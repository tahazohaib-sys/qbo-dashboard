"use client";

import { FormEvent, Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "login" | "request";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [devCode, setDevCode] = useState("");
  const [devApproval, setDevApproval] = useState<{ approveUrl: string; rejectUrl: string } | null>(null);
  const [error, setError] = useState("");

  function resetFlow(nextMode: Mode) {
    setMode(nextMode);
    setAwaitingCode(false);
    setVerificationCode("");
    setMessage("");
    setDevCode("");
    setDevApproval(null);
    setError("");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setDevCode("");
    setDevApproval(null);
    setError("");

    try {
      const endpoint = awaitingCode
        ? mode === "login"
          ? "/api/auth/verify-login"
          : "/api/auth/verify-code"
        : mode === "login"
        ? "/api/auth/login"
        : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(awaitingCode ? { email, code: verificationCode } : { email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Request failed.");

      if (mode === "login" && awaitingCode) {
        router.push(next);
        router.refresh();
        return;
      }

      setMessage(
        json.message ||
          (mode === "login"
            ? "Verification code sent. Enter the code below to finish logging in."
            : awaitingCode
            ? "Your request has been forwarded for approval."
            : "Verification code sent.")
      );
      if (json.needsCode) setAwaitingCode(true);
      if (json.devVerificationCode) {
        setVerificationCode(json.devVerificationCode);
        setDevCode(json.devVerificationCode);
      }
      if (json.devApproval) setDevApproval(json.devApproval);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const heading = mode === "login" ? (awaitingCode ? "Enter login code" : "Sign in") : awaitingCode ? "Verify your email" : "Request dashboard access";
  const description =
    mode === "login"
      ? awaitingCode
        ? "Enter the six-digit code sent to your approved email address."
        : "Use an approved email and password. A six-digit login code will be sent to that email."
      : awaitingCode
      ? "Enter the verification code sent to your email. After verification, your request will be forwarded for approval."
      : "Set your email and password. A verification code will be sent to your email before approval is requested.";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(900px_620px_at_12%_0%,rgba(37,99,235,0.28),transparent_58%),radial-gradient(900px_680px_at_86%_8%,rgba(14,165,233,0.16),transparent_55%),linear-gradient(180deg,#061429_0%,#050915_44%,#030610_100%)] px-4 py-8 text-slate-100">
      <div className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:42px_42px]" />

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_440px]">
        <div className="hidden lg:block">
          <div className="mb-6 flex items-center gap-4">
            <div className="relative h-16 w-16 rounded-2xl border border-white/10 bg-white/5 p-2">
              <Image src="/logo.png" alt="RTC League Logo" fill className="object-contain" priority />
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-white">Finance Dashboard</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                Access is restricted. New users must verify their email and be approved before they can view financial data.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#071020]/82 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="relative h-12 w-12 rounded-2xl border border-white/10 bg-white/5 p-1.5">
              <Image src="/logo.png" alt="RTC League Logo" fill className="object-contain" priority />
            </div>
            <div className="text-xl font-semibold tracking-tight text-white">Finance Dashboard</div>
          </div>

          <div className="mb-5 rounded-2xl border border-white/10 bg-black/20 p-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => resetFlow("login")}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  mode === "login" ? "bg-cyan-400/18 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "text-slate-400 hover:text-white"
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => resetFlow("request")}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  mode === "request" ? "bg-cyan-400/18 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "text-slate-400 hover:text-white"
                }`}
              >
                Request Access
              </button>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-white">{heading}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
                disabled={awaitingCode}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10 disabled:opacity-70"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                disabled={awaitingCode}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10 disabled:opacity-70"
              />
            </div>
            {awaitingCode ? (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Verification Code</label>
                <input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-center text-lg font-bold tracking-[0.45em] text-white outline-none transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
                />
              </div>
            ) : null}

            {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
            {message ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}
            {devCode ? (
              <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm font-semibold text-cyan-100">
                Development verification code: <span className="tracking-[0.28em]">{devCode}</span>
              </div>
            ) : null}
            {devApproval ? (
              <div className="space-y-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm font-semibold text-cyan-100">
                <div>Development approval links:</div>
                <a href={devApproval.approveUrl} className="block break-all text-emerald-200">Approve: {devApproval.approveUrl}</a>
                <a href={devApproval.rejectUrl} className="block break-all text-rose-200">Reject: {devApproval.rejectUrl}</a>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/16 px-5 text-sm font-semibold text-cyan-50 shadow-[0_14px_34px_rgba(8,145,178,0.18)] transition hover:bg-cyan-400/22 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Working..." : mode === "login" ? (awaitingCode ? "Verify and Login" : "Send Login Code") : awaitingCode ? "Verify Email" : "Send Verification Code"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-[#061429] px-4 text-slate-100">
          <div className="h-28 w-full max-w-md animate-pulse rounded-[28px] border border-white/10 bg-white/5" />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
