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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [devLink, setDevLink] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setDevLink("");
    setError("");

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Request failed.");

      if (mode === "login") {
        router.push(next);
        router.refresh();
        return;
      }

      setMessage(json.message || "Verification email sent.");
      if (json.devVerifyUrl) setDevLink(json.devVerifyUrl);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

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
                onClick={() => setMode("login")}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  mode === "login" ? "bg-cyan-400/18 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "text-slate-400 hover:text-white"
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode("request")}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  mode === "request" ? "bg-cyan-400/18 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]" : "text-slate-400 hover:text-white"
                }`}
              >
                Request Access
              </button>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-white">
            {mode === "login" ? "Sign in" : "Request dashboard access"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {mode === "login"
              ? "Use an approved email and password to continue."
              : "Set your email and password. After verification, approval is sent to taha.zohaib@rtcleague.com."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
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
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>

            {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
            {message ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}
            {devLink ? (
              <a href={devLink} className="block break-all rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm font-semibold text-cyan-100">
                Development verify link: {devLink}
              </a>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/16 px-5 text-sm font-semibold text-cyan-50 shadow-[0_14px_34px_rgba(8,145,178,0.18)] transition hover:bg-cyan-400/22 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Working..." : mode === "login" ? "Login" : "Send Verification"}
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
