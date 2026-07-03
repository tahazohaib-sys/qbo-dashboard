"use client";

import { FormEvent, Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const approved = searchParams.get("approved") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(approved ? "Access approved. Sign in with your approved email to continue." : "");
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setDevCode("");
    setError("");

    try {
      const endpoint = awaitingCode ? "/api/auth/verify-login" : "/api/auth/login";
      const payload = awaitingCode ? { email, code: verificationCode } : { email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Request failed.");

      if (awaitingCode) {
        router.push(next);
        router.refresh();
        return;
      }

      setMessage(json.message || "Verification code sent. Enter the code below to finish logging in.");
      if (json.needsCode) setAwaitingCode(true);
      if (json.devVerificationCode) {
        setVerificationCode(json.devVerificationCode);
        setDevCode(json.devVerificationCode);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(900px_620px_at_10%_-8%,rgba(0,114,188,0.26),transparent_62%),radial-gradient(760px_520px_at_90%_8%,rgba(16,185,129,0.15),transparent_58%),linear-gradient(135deg,#07152b_0%,#050914_48%,#081321_100%)] px-4 py-8 text-slate-100">
      <style jsx global>{`
        @keyframes grid-drift {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(38px, 38px, 0); }
        }
        @keyframes rise-in {
          0% { opacity: 0; transform: translateY(18px) scale(.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse-ring {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,211,238,.18); }
          50% { box-shadow: 0 0 0 14px rgba(34,211,238,0); }
        }
        @keyframes shimmer-line {
          0% { transform: translateX(-120%); opacity: 0; }
          18% { opacity: .7; }
          100% { transform: translateX(120%); opacity: 0; }
        }
        .auth-grid { animation: grid-drift 24s linear infinite; }
        .auth-rise { animation: rise-in .7s ease-out both; }
        .auth-pulse { animation: pulse-ring 3.2s ease-in-out infinite; }
        .auth-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,.14) 45%, transparent 60%);
          animation: shimmer-line 4.8s ease-in-out infinite;
        }
      `}</style>
      <div className="auth-grid pointer-events-none absolute -inset-12 opacity-[0.052] [background-image:linear-gradient(rgba(255,255,255,0.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.75)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.055] to-transparent" />

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.04fr_0.96fr]">
        <div className="auth-rise hidden lg:block">
          <div className="relative inline-flex items-center gap-5">
            <div className="auth-pulse auth-shimmer relative h-24 w-24 overflow-hidden rounded-[26px] border border-cyan-200/16 bg-slate-950/68 p-3 shadow-[0_24px_70px_rgba(0,0,0,.42),0_0_42px_rgba(34,211,238,.14)]">
              <Image src="/logo.png" alt="RTC League" fill className="object-contain p-3" priority />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-emerald-200/80">RTC League</p>
              <h1 className="mt-2 max-w-xl text-5xl font-black leading-[0.95] tracking-tight text-white">Approved Login</h1>
            </div>
          </div>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
            Continue only after your email has been approved. Your password and one-time code keep the finance dashboard protected.
          </p>
          <div className="mt-8 max-w-xl rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-400">Security state</div>
                <div className="mt-2 text-xl font-black text-white">Approval required</div>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-200/20 bg-emerald-400/12 text-lg font-black text-emerald-100">2FA</div>
            </div>
          </div>
        </div>

        <div className="auth-rise mx-auto w-full max-w-[500px] rounded-[32px] border border-white/12 bg-slate-950/72 p-5 shadow-[0_36px_120px_rgba(0,0,0,.52)] backdrop-blur-2xl sm:p-7">
          <div className="mb-7 flex items-center gap-4 lg:hidden">
            <div className="relative h-16 w-16 overflow-hidden rounded-[22px] border border-cyan-200/15 bg-slate-950/70 p-2 shadow-[0_0_30px_rgba(34,211,238,.12)]">
              <Image src="/logo.png" alt="RTC League" fill className="object-contain p-2" priority />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-200/80">RTC League</p>
              <div className="text-2xl font-black tracking-tight text-white">Approved Login</div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/80">Secure Portal</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white">{awaitingCode ? "Verify your code" : "Sign in"}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {awaitingCode
                ? "Enter the six-digit code sent to your approved email address."
                : "Use your approved email and password. On your first approved login, the password you enter will be saved."}
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Email address</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
                disabled={awaitingCode}
                placeholder="approved@email.com"
                className="mt-2 h-14 w-full rounded-2xl border border-white/10 bg-black/34 px-4 text-base font-medium text-white outline-none transition duration-300 placeholder:text-slate-600 focus:border-cyan-200/60 focus:bg-black/42 focus:ring-4 focus:ring-cyan-400/10 disabled:opacity-70"
              />
            </div>
            {!awaitingCode ? (
              <div>
                <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  className="mt-2 h-14 w-full rounded-2xl border border-white/10 bg-black/34 px-4 text-base font-medium text-white outline-none transition duration-300 placeholder:text-slate-600 focus:border-cyan-200/60 focus:bg-black/42 focus:ring-4 focus:ring-cyan-400/10"
                />
              </div>
            ) : null}
            {awaitingCode ? (
              <div>
                <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Verification code</label>
                <input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  className="mt-2 h-14 w-full rounded-2xl border border-white/10 bg-black/34 px-4 text-center text-xl font-black tracking-[0.46em] text-white outline-none transition duration-300 focus:border-cyan-200/60 focus:bg-black/42 focus:ring-4 focus:ring-cyan-400/10"
                />
              </div>
            ) : null}

            {error ? <div className="rounded-2xl border border-rose-300/30 bg-rose-500/12 p-3 text-sm font-medium text-rose-100">{error}</div> : null}
            {message ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/12 p-3 text-sm font-medium text-emerald-100">{message}</div> : null}
            {devCode ? (
              <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm font-semibold text-cyan-100">
                Development login code: <span className="tracking-[0.28em]">{devCode}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="relative h-14 w-full overflow-hidden rounded-2xl border border-cyan-200/20 bg-gradient-to-r from-cyan-500/26 via-emerald-400/18 to-cyan-500/26 px-5 text-base font-black text-white shadow-[0_18px_40px_rgba(8,145,178,.22)] transition duration-300 hover:scale-[1.01] hover:border-cyan-100/36 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Working..." : awaitingCode ? "Verify and Login" : "Send Login Code"}
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
