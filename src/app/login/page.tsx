"use client";

import { FormEvent, Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const approved = searchParams.get("approved") === "1";
  const initialEmail = searchParams.get("email") || "";
  const [email, setEmail] = useState(initialEmail);
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
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(160deg,#060b18_0%,#050914_46%,#04101c_100%)] px-4 py-10 text-slate-100">
      <style jsx global>{`
        @keyframes aurora-a {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(6%, 5%, 0) scale(1.18); }
        }
        @keyframes aurora-b {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-5%, -4%, 0) scale(1.12); }
        }
        @keyframes aurora-c {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-4%, 6%, 0) scale(1.22); }
        }
        @keyframes float-orb {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(-22px) translateX(10px); }
        }
        @keyframes rise-in {
          0% { opacity: 0; transform: translateY(22px) scale(.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes grad-move {
          to { background-position: 200% center; }
        }
        @keyframes halo-pulse {
          0%, 100% { opacity: .55; transform: scale(1); }
          50% { opacity: .9; transform: scale(1.08); }
        }
        @keyframes btn-shine {
          0% { transform: translateX(-130%); }
          100% { transform: translateX(130%); }
        }

        .aurora {
          position: absolute;
          border-radius: 9999px;
          filter: blur(72px);
          pointer-events: none;
          z-index: 0;
          will-change: transform;
        }
        .aurora-1 {
          top: -20%; left: -12%; width: 54vw; height: 54vw; opacity: .5;
          background: radial-gradient(circle at 34% 34%, rgba(34, 211, 238, .55), rgba(34, 211, 238, 0) 70%);
          animation: aurora-a 22s ease-in-out infinite;
        }
        .aurora-2 {
          bottom: -26%; right: -16%; width: 60vw; height: 60vw; opacity: .42;
          background: radial-gradient(circle at 60% 40%, rgba(16, 185, 129, .48), rgba(16, 185, 129, 0) 70%);
          animation: aurora-b 27s ease-in-out infinite;
        }
        .aurora-3 {
          top: 16%; right: 8%; width: 42vw; height: 42vw; opacity: .38;
          background: radial-gradient(circle at 50% 50%, rgba(79, 130, 246, .45), rgba(79, 130, 246, 0) 70%);
          animation: aurora-c 31s ease-in-out infinite;
        }

        .orb {
          position: absolute;
          border-radius: 9999px;
          pointer-events: none;
          z-index: 0;
          will-change: transform;
        }
        .orb-1 { top: 22%; left: 16%; width: 10px; height: 10px; background: rgba(103, 232, 249, .9); box-shadow: 0 0 22px 5px rgba(34, 211, 238, .5); animation: float-orb 9s ease-in-out infinite; }
        .orb-2 { top: 68%; left: 30%; width: 7px; height: 7px; background: rgba(110, 231, 183, .9); box-shadow: 0 0 20px 4px rgba(16, 185, 129, .5); animation: float-orb 11s ease-in-out infinite 1.2s; }
        .orb-3 { top: 34%; right: 22%; width: 8px; height: 8px; background: rgba(147, 197, 253, .9); box-shadow: 0 0 20px 5px rgba(59, 130, 246, .5); animation: float-orb 13s ease-in-out infinite .6s; }
        .orb-4 { top: 80%; right: 30%; width: 6px; height: 6px; background: rgba(165, 243, 252, .85); box-shadow: 0 0 16px 4px rgba(34, 211, 238, .45); animation: float-orb 10s ease-in-out infinite 2s; }

        .auth-rise { animation: rise-in .8s cubic-bezier(.22, 1, .36, 1) both; }
        .auth-rise-2 { animation-delay: .12s; }

        .logo-float { animation: logo-float 6s ease-in-out infinite; }
        .logo-halo {
          position: absolute;
          inset: -18% -6%;
          border-radius: 9999px;
          background: radial-gradient(60% 70% at 42% 50%, rgba(34, 211, 238, .28), rgba(16, 185, 129, .12) 55%, transparent 75%);
          filter: blur(14px);
          animation: halo-pulse 5s ease-in-out infinite;
          pointer-events: none;
          z-index: -1;
        }

        .grad-text {
          background: linear-gradient(90deg, #a5f3fc, #e0f2fe, #6ee7b7, #93c5fd, #a5f3fc);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: grad-move 7s linear infinite;
        }

        .shine-btn > .shine {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 45%;
          background: linear-gradient(105deg, transparent, rgba(255, 255, 255, .28), transparent);
          transform: translateX(-130%);
          pointer-events: none;
        }
        .shine-btn:hover > .shine { animation: btn-shine 1.1s ease; }

        .field {
          transition: border-color .3s, background-color .3s, box-shadow .3s, transform .3s;
        }
        .field:focus {
          box-shadow: 0 0 0 4px rgba(34, 211, 238, .12), 0 0 26px rgba(34, 211, 238, .18);
        }

        @media (prefers-reduced-motion: reduce) {
          .aurora, .orb, .grad-text, .logo-float, .logo-halo, .shine-btn:hover > .shine { animation: none !important; }
          .auth-rise { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      {/* Animated aurora backdrop */}
      <div className="aurora aurora-1" />
      <div className="aurora aurora-2" />
      <div className="aurora aurora-3" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />
      {/* Soft vignette to focus the center */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(120%_120%_at_50%_-10%,transparent_38%,rgba(3,6,14,0.55)_100%)]" />

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.04fr_0.96fr]">
        <div className="auth-rise hidden lg:block">
          <div className="logo-float relative inline-block">
            <span className="logo-halo" />
            <Image
              src="/logo.png"
              alt="RTC League"
              width={264}
              height={100}
              priority
              className="h-auto w-[248px] select-none drop-shadow-[0_10px_30px_rgba(34,211,238,0.25)]"
            />
          </div>
          <h1 className="mt-10 max-w-xl text-6xl font-black leading-[0.95] tracking-tight">
            <span className="grad-text">Approved</span>
            <br />
            <span className="text-white">Login</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300/90">
            Continue only after your email has been approved. Your password and one-time code keep the finance dashboard protected.
          </p>
          <div className="mt-9 flex max-w-xl items-center gap-4">
            <div className="flex-1 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition duration-300 hover:border-cyan-200/25 hover:bg-white/[0.06]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-400">Security state</div>
                  <div className="mt-2 text-xl font-black text-white">Approval required</div>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-200/25 bg-emerald-400/12 text-lg font-black text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.18)]">2FA</div>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-rise auth-rise-2 mx-auto w-full max-w-[500px] rounded-[32px] border border-white/12 bg-slate-950/60 p-5 shadow-[0_36px_120px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-2xl sm:p-8">
          <div className="mb-7 flex flex-col items-start gap-3 lg:hidden">
            <div className="logo-float relative inline-block">
              <span className="logo-halo" />
              <Image
                src="/logo.png"
                alt="RTC League"
                width={200}
                height={76}
                priority
                className="h-auto w-[168px] select-none drop-shadow-[0_8px_24px_rgba(34,211,238,0.25)]"
              />
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-5">
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
                className="field mt-2 h-14 w-full rounded-2xl border border-white/10 bg-black/34 px-4 text-base font-medium text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/60 focus:bg-black/42 disabled:opacity-70"
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
                  className="field mt-2 h-14 w-full rounded-2xl border border-white/10 bg-black/34 px-4 text-base font-medium text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/60 focus:bg-black/42"
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
                  className="field mt-2 h-14 w-full rounded-2xl border border-white/10 bg-black/34 px-4 text-center text-xl font-black tracking-[0.46em] text-white outline-none focus:border-cyan-200/60 focus:bg-black/42"
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
              className="shine-btn relative h-14 w-full overflow-hidden rounded-2xl border border-cyan-200/25 bg-gradient-to-r from-cyan-500/30 via-emerald-400/22 to-cyan-500/30 px-5 text-base font-black text-white shadow-[0_18px_44px_rgba(8,145,178,.28)] transition duration-300 hover:-translate-y-0.5 hover:border-cyan-100/45 hover:shadow-[0_22px_54px_rgba(8,145,178,.4)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="shine" />
              <span className="relative">{loading ? "Working..." : awaitingCode ? "Verify and Login" : "Send Login Code"}</span>
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
        <main className="grid min-h-screen place-items-center bg-[#050914] px-4 text-slate-100">
          <div className="h-28 w-full max-w-md animate-pulse rounded-[28px] border border-white/10 bg-white/5" />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
