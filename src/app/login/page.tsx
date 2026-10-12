"use client";

import { FormEvent, ReactNode, Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Login as one slideshow workflow: each slide is one step of the real setup.
 *   0 Email -> 1 Password -> 2 Code (first login only) -> 3 Done
 * A returning user goes from Password straight to Done; the Code step then
 * shows as skipped in the step bar.
 */

const STEPS = [
  { title: "Email", hint: "Approved email" },
  { title: "Password", hint: "New on first login" },
  { title: "Code", hint: "First login only" },
  { title: "Done", hint: "Open dashboard" },
];

const fieldClass =
  "field mt-2 h-14 w-full rounded-2xl border border-white/10 bg-black/34 px-4 text-base font-medium text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/60 focus:bg-black/42";

function PrimaryButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="shine-btn relative h-14 w-full overflow-hidden rounded-2xl border border-cyan-200/25 bg-gradient-to-r from-cyan-500/30 via-emerald-400/22 to-cyan-500/30 px-5 text-base font-black text-white shadow-[0_18px_44px_rgba(8,145,178,.28)] transition duration-300 hover:-translate-y-0.5 hover:border-cyan-100/45 hover:shadow-[0_22px_54px_rgba(8,145,178,.4)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="shine" />
      <span className="relative">{children}</span>
    </button>
  );
}

function SlideHead({ icon, title, text }: { icon: ReactNode; title: string; text: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <div className="step-icon relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-cyan-200/20 bg-[radial-gradient(circle_at_30%_25%,rgba(34,211,238,.28),rgba(16,185,129,.1)_60%,rgba(255,255,255,.02))] text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,.16)]">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-slate-300/90">{text}</p>
      </div>
    </div>
  );
}

function Icon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-7 w-7 ${className}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const approved = searchParams.get("approved") === "1";
  const initialEmail = searchParams.get("email") || "";

  // With the email already known (link from the approval email), start at the password step.
  const [step, setStep] = useState(initialEmail ? 1 : 0);
  const [codeSkipped, setCodeSkipped] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(approved ? "Your access is approved. Choose your password to continue." : "");
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Move the focus to the field of the new slide when the slide changes.
  useEffect(() => {
    const target = [emailRef, passwordRef, codeRef][step]?.current;
    const t = window.setTimeout(() => target?.focus({ preventScroll: true }), 420);
    return () => window.clearTimeout(t);
  }, [step]);

  function goTo(s: number) {
    setError("");
    setStep(s);
  }

  function finish() {
    setStep(3);
    window.setTimeout(() => {
      router.push(next);
      router.refresh();
    }, 1100);
  }

  async function post(endpoint: string, payload: object) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error || "Request failed.");
    return json;
  }

  async function run(action: () => Promise<void>) {
    setLoading(true);
    setError("");
    setDevCode("");
    try {
      await action();
    } catch (err) {
      setError((err instanceof Error && err.message) || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function submitEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    goTo(1);
  }

  function submitPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    run(async () => {
      const json = await post("/api/auth/login", { email, password });
      // Returning user: email + password is enough.
      if (json.needsCode === false) {
        setCodeSkipped(true);
        finish();
        return;
      }
      setCodeSkipped(false);
      setMessage(json.message || "");
      if (json.devVerificationCode) {
        setVerificationCode(json.devVerificationCode);
        setDevCode(json.devVerificationCode);
      }
      goTo(2);
    });
  }

  function submitCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(async () => {
      await post("/api/auth/verify-login", { email, code: verificationCode });
      finish();
    });
  }

  // The login API refuses unknown and not-yet-approved emails; then point to the request form.
  const needsAccess = /not approved|waiting for approval/i.test(error);

  const alerts = (
    <>
      {error ? (
        <div className="rounded-2xl border border-rose-300/30 bg-rose-500/12 p-3 text-sm font-medium text-rose-100">
          {error}
          {needsAccess ? (
            <a href="/request-access" className="ml-1 font-bold text-rose-50 underline underline-offset-2">
              Request access
            </a>
          ) : null}
        </div>
      ) : null}
      {message ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/12 p-3 text-sm font-medium text-emerald-100">{message}</div> : null}
    </>
  );

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
        @keyframes halo-pulse {
          0%, 100% { opacity: .55; transform: scale(1); }
          50% { opacity: .9; transform: scale(1.08); }
        }
        @keyframes btn-shine {
          0% { transform: translateX(-130%); }
          100% { transform: translateX(130%); }
        }
        @keyframes icon-pop {
          0% { opacity: 0; transform: scale(.6) rotate(-8deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        @keyframes check-draw { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
        @keyframes ring-out {
          0% { opacity: .75; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.6); }
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

        .wf-track { transition: transform .55s cubic-bezier(.22, 1, .36, 1); }
        .wf-slide { transition: opacity .45s ease, filter .45s ease; }
        .wf-slide[inert] { opacity: 0; filter: blur(3px); }
        .wf-bar { transition: width .55s cubic-bezier(.22, 1, .36, 1); }
        .wf-slide:not([inert]) .step-icon { animation: icon-pop .6s cubic-bezier(.34, 1.56, .64, 1) .15s both; }
        .wf-ring { animation: ring-out 1.6s ease-out infinite; }
        .wf-check { stroke-dasharray: 40; animation: check-draw .8s ease .25s both; }

        @media (prefers-reduced-motion: reduce) {
          .aurora, .orb, .logo-float, .logo-halo, .shine-btn:hover > .shine, .wf-ring { animation: none !important; }
          .auth-rise { animation: none !important; opacity: 1 !important; transform: none !important; }
          .wf-track, .wf-slide, .wf-bar { transition: none !important; }
          .wf-slide:not([inert]) .step-icon, .wf-check { animation: none !important; }
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

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[540px] flex-col items-center justify-center">
        <div className="auth-rise logo-float relative mb-8 inline-block">
          <span className="logo-halo" />
          <Image
            src="/logo.png"
            alt="RTC League"
            width={264}
            height={100}
            priority
            className="h-auto w-[180px] select-none drop-shadow-[0_10px_30px_rgba(34,211,238,0.25)] sm:w-[220px]"
          />
        </div>

        <div className="auth-rise w-full overflow-hidden rounded-[32px] border border-white/12 bg-slate-950/60 shadow-[0_36px_120px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-2xl">
          {/* Step bar */}
          <ol className="relative grid grid-cols-4 gap-2 px-5 pt-6 sm:px-8 sm:pt-7" aria-label="Login steps">
            {STEPS.map((s, i) => {
              const skipped = i === 2 && codeSkipped && step === 3;
              const done = i < step && !skipped;
              const active = i === step;
              return (
                <li key={s.title} aria-current={active ? "step" : undefined} className="min-w-0">
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
                    <span
                      className={`wf-bar absolute inset-y-0 left-0 rounded-full ${skipped ? "bg-white/25" : "bg-gradient-to-r from-cyan-300 to-emerald-300"}`}
                      style={{ width: done || skipped ? "100%" : active ? "50%" : "0%" }}
                    />
                  </div>
                  <div className={`mt-2.5 truncate text-[10px] font-black uppercase tracking-[0.08em] sm:text-[11px] sm:tracking-[0.16em] ${active ? "text-cyan-100" : done ? "text-emerald-200/80" : "text-slate-500"}`}>
                    <span className="hidden sm:inline">{i + 1}. </span>
                    {s.title}
                  </div>
                  <div className="hidden truncate text-[11px] text-slate-500 sm:block">{skipped ? "Not needed" : s.hint}</div>
                </li>
              );
            })}
          </ol>

          {/* Slides */}
          <div className="wf-track flex" style={{ transform: `translateX(-${step * 100}%)` }}>
            {/* 1. Email */}
            <form onSubmit={submitEmail} inert={step !== 0} className="wf-slide flex w-full shrink-0 flex-col justify-center space-y-5 p-5 sm:p-8">
              <SlideHead
                icon={<Icon d="M4 6h16v12H4zM4.5 6.5l7.5 6 7.5-6" />}
                title="Enter your email"
                text="Use the email that the admin approved for dashboard access."
              />
              <div>
                <label htmlFor="login-email" className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Email address</label>
                <input
                  id="login-email"
                  ref={emailRef}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="approved@email.com"
                  className={fieldClass}
                />
              </div>
              {step === 0 ? alerts : null}
              <PrimaryButton>Continue</PrimaryButton>
              <p className="text-center text-sm text-slate-400">
                No access yet?{" "}
                <a href="/request-access" className="font-bold text-emerald-200 transition hover:text-emerald-100">
                  Request access →
                </a>
              </p>
            </form>

            {/* 2. Password */}
            <form onSubmit={submitPassword} inert={step !== 1} className="wf-slide flex w-full shrink-0 flex-col justify-center space-y-5 p-5 sm:p-8">
              <SlideHead
                icon={<Icon d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3" />}
                title="Enter your password"
                text="First login: choose a new password. After that, use the same password every time."
              />
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <span className="truncate text-sm font-semibold text-slate-200">{email || "—"}</span>
                <button type="button" onClick={() => goTo(0)} className="shrink-0 text-xs font-black uppercase tracking-[0.16em] text-cyan-200 hover:text-cyan-100">
                  Change
                </button>
              </div>
              <div>
                <label htmlFor="login-password" className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Password</label>
                <input
                  id="login-password"
                  ref={passwordRef}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  className={fieldClass}
                />
              </div>
              {step === 1 ? alerts : null}
              <PrimaryButton disabled={loading}>{loading ? "Working..." : "Sign in"}</PrimaryButton>
            </form>

            {/* 3. Code (first login only) */}
            <form onSubmit={submitCode} inert={step !== 2} className="wf-slide flex w-full shrink-0 flex-col justify-center space-y-5 p-5 sm:p-8">
              <SlideHead
                icon={<Icon d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3zM9 12l2 2 4-4" />}
                title="Confirm your email"
                text={
                  <>
                    We sent a 6-digit code to <span className="font-semibold text-slate-100">{email}</span>. You need it on the first login only.
                  </>
                }
              />
              <div>
                <label htmlFor="login-code" className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Verification code</label>
                <input
                  id="login-code"
                  ref={codeRef}
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
              {step === 2 ? alerts : null}
              {devCode ? (
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-sm font-semibold text-cyan-100">
                  Development login code: <span className="tracking-[0.28em]">{devCode}</span>
                </div>
              ) : null}
              <PrimaryButton disabled={loading}>{loading ? "Working..." : "Verify and sign in"}</PrimaryButton>
              <button type="button" onClick={() => goTo(1)} className="block w-full text-center text-sm font-semibold text-slate-400 hover:text-slate-200">
                ← Back to password
              </button>
            </form>

            {/* 4. Done */}
            <div inert={step !== 3} className="wf-slide flex w-full shrink-0 flex-col items-center justify-center p-5 text-center sm:p-8">
              <div className="relative grid h-24 w-24 place-items-center rounded-full border border-emerald-200/30 bg-emerald-400/12 text-emerald-200 shadow-[0_0_44px_rgba(16,185,129,.28)]">
                <span className="wf-ring absolute inset-0 rounded-full border border-emerald-200/40" />
                <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
                  {step === 3 ? (
                    <path d="M14 24.5l6.5 6.5L34 17.5" className="wf-check" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  ) : null}
                </svg>
              </div>
              <h2 className="mt-6 text-2xl font-black tracking-tight text-white">You are signed in</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300/90">
                {codeSkipped ? "Welcome back." : "Your password is saved. Next time, use your email and password only."} Opening the dashboard…
              </p>
            </div>
          </div>
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
