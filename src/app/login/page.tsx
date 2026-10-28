"use client";

import {
  FormEvent,
  ReactNode,
  RefObject,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Login as one slide per step:
 *   0 Email -> 1 Password -> 2 Code (first login only) -> 3 Done
 * A returning user goes from Password straight to Done.
 * Slides move left or right by their order, and the card height follows the active slide.
 */

const STEP_COUNT = 4;
const RESEND_SECONDS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SubmitButton({ children, loading }: { children: ReactNode; loading?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-[#0b0f17] transition duration-200 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/30 active:scale-[.985] disabled:cursor-default disabled:bg-white/80"
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="field-error mt-2 flex items-start gap-1.5 text-[13px] leading-5 text-rose-300">
      <svg viewBox="0 0 20 20" className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true">
        <path
          fill="currentColor"
          d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a.9.9 0 01.9.9v3.6a.9.9 0 01-1.8 0V6.9A.9.9 0 0110 6zm0 8.4a1.05 1.05 0 110-2.1 1.05 1.05 0 010 2.1z"
        />
      </svg>
      <span>{children}</span>
    </p>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] px-4 py-3 text-[13px] leading-5 text-cyan-50/90">
      {children}
    </div>
  );
}

function TextField({
  id,
  label,
  type,
  value,
  onChange,
  inputRef,
  invalid,
  autoComplete,
  trailing,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  invalid?: boolean;
  autoComplete: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        spellCheck={false}
        autoCapitalize="none"
        placeholder=" "
        aria-invalid={invalid || undefined}
        className={`login-input peer h-14 w-full rounded-xl border bg-white/[.03] px-4 pb-2 pt-6 text-base text-white outline-none transition duration-200 focus:bg-white/[.05] focus:ring-4 ${
          trailing ? "pr-12" : ""
        } ${
          invalid
            ? "border-rose-400/70 focus:border-rose-400 focus:ring-rose-400/15"
            : "border-white/[.12] hover:border-white/25 focus:border-cyan-300/80 focus:ring-cyan-300/15"
        }`}
      />
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-4 top-1/2 origin-left -translate-y-1/2 text-base transition-all duration-200 ease-out peer-focus:top-[17px] peer-focus:scale-[.8] peer-autofill:top-[17px] peer-autofill:scale-[.8] peer-[:not(:placeholder-shown)]:top-[17px] peer-[:not(:placeholder-shown)]:scale-[.8] ${
          invalid ? "text-rose-300/90" : "text-slate-400 peer-focus:text-cyan-200"
        }`}
      >
        {label}
      </label>
      {trailing}
    </div>
  );
}

function AccountChip({ email, onClick }: { email: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Use another email"
      className="mx-auto mt-4 flex max-w-full items-center gap-2 rounded-full border border-white/[.12] py-1 pl-1 pr-3 text-sm text-slate-200 transition hover:border-white/25 hover:bg-white/[.04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/20"
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 text-xs font-bold uppercase text-[#0b0f17]">
        {email.charAt(0) || "?"}
      </span>
      <span className="truncate">{email}</span>
      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true">
        <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function CodeInput({
  value,
  onChange,
  inputRef,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  invalid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        aria-label="Verification code"
        aria-invalid={invalid || undefined}
        className="code-input absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-base text-transparent caret-transparent outline-none"
      />
      <div className="grid grid-cols-6 gap-2 sm:gap-2.5" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => {
          const digit = value[i] ?? "";
          const active = focused && (i === value.length || (i === 5 && value.length === 6));
          return (
            <div
              key={i}
              className={`relative grid h-14 place-items-center rounded-xl border bg-white/[.03] text-[22px] font-semibold text-white transition duration-200 ${
                invalid
                  ? "border-rose-400/70"
                  : active
                    ? "border-cyan-300/80 bg-white/[.05] ring-4 ring-cyan-300/15"
                    : digit
                      ? "border-white/25"
                      : "border-white/[.12]"
              }`}
            >
              {digit ? <span className="code-digit">{digit}</span> : null}
              {active && !digit ? <span className="code-caret absolute h-6 w-[2px] rounded-full bg-cyan-200" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const approved = searchParams.get("approved") === "1";
  const initialEmail = searchParams.get("email") || "";
  const reason = searchParams.get("reason");

  // With the email already known (link from the approval email), start at the password step.
  const [step, setStep] = useState(initialEmail ? 1 : 0);
  const [codeSkipped, setCodeSkipped] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(
    approved
      ? "Your access is approved. Choose a password to continue."
      : reason === "idle"
        ? "You were signed out after 2 hours of inactivity."
        : reason === "expired"
          ? "Your session expired. Sign in again."
          : ""
  );
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  // Changes on each new error so the error line animates in again.
  const [errorKey, setErrorKey] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [height, setHeight] = useState<number>();

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);

  // The card height follows the active slide, also when an error line comes or goes.
  useLayoutEffect(() => {
    const el = slideRefs.current[step];
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [step]);

  // Move the focus to the field of the new slide after the slide comes in.
  useEffect(() => {
    const target = [emailRef, passwordRef, codeRef][step]?.current;
    const t = window.setTimeout(() => target?.focus({ preventScroll: true }), 380);
    return () => window.clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  function fail(text: string) {
    setError(text);
    setErrorKey((k) => k + 1);
    // Shake the field of the active slide; remove the class first so it plays again.
    const el = slideRefs.current[step]?.querySelector<HTMLElement>("[data-shake]");
    if (el) {
      el.classList.remove("shake");
      void el.offsetWidth;
      el.classList.add("shake");
    }
  }

  function goTo(s: number) {
    setError("");
    setStep(s);
  }

  function finish() {
    setStep(3);
    window.setTimeout(() => {
      router.push(next);
      router.refresh();
    }, 1400);
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
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await action();
    } catch (err) {
      fail((err instanceof Error && err.message) || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Sends the email + password. A first login gets a code by email.
  async function requestCode() {
    const json = await post("/api/auth/login", { email, password });
    if (json.needsCode === false) {
      setCodeSkipped(true);
      finish();
      return false;
    }
    setCodeSkipped(false);
    setDevCode(json.devVerificationCode || "");
    setResendIn(RESEND_SECONDS);
    return true;
  }

  function submitEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      fail(value ? "Enter a valid email address." : "Enter your email.");
      return;
    }
    setEmail(value);
    goTo(1);
  }

  function submitPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) {
      fail(password ? "Use at least 8 characters." : "Enter your password.");
      return;
    }
    run(async () => {
      if (await requestCode()) {
        setNotice("");
        setVerificationCode("");
        goTo(2);
      }
    });
  }

  function verify(code: string) {
    if (code.length !== 6) {
      fail("Enter the 6-digit code.");
      return;
    }
    run(async () => {
      await post("/api/auth/verify-login", { email, code });
      finish();
    });
  }

  function resend() {
    run(async () => {
      setVerificationCode("");
      await requestCode();
      codeRef.current?.focus();
    });
  }

  // The login API refuses unknown and not-yet-approved emails; then point to the request form.
  const needsAccess = /not approved|waiting for approval/i.test(error);

  const errorLine = (forStep: number) =>
    error && step === forStep ? (
      <FieldError key={errorKey}>
        {error}
        {needsAccess ? (
          <>
            {" "}
            <a href="/request-access" className="font-semibold text-rose-100 underline underline-offset-2">
              Request access
            </a>
          </>
        ) : null}
      </FieldError>
    ) : null;

  const slideProps = (i: number) => ({
    ref: (el: HTMLElement | null) => {
      slideRefs.current[i] = el;
    },
    inert: step !== i,
    "aria-hidden": step !== i,
    "data-pos": i < step ? "before" : i > step ? "after" : "current",
  });
  // Kept out of slideProps: styled-jsx drops a className that comes from a spread.
  const slideClass = "login-slide px-6 pb-1 sm:px-10";

  return (
    <main className="login-page relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#0b0f17] px-4 py-10 text-slate-100">
      <style jsx global>{`
        .login-page {
          font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        @keyframes card-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes item-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }
        @keyframes indeterminate {
          from { transform: translateX(-100%); }
          to { transform: translateX(250%); }
        }
        @keyframes caret-blink { 50% { opacity: 0; } }
        @keyframes digit-in {
          from { opacity: 0; transform: translateY(4px) scale(.9); }
          to { opacity: 1; transform: none; }
        }
        @keyframes badge-in {
          0% { opacity: 0; transform: scale(.6); }
          60% { opacity: 1; transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        @keyframes check-draw { from { stroke-dashoffset: 18; } to { stroke-dashoffset: 0; } }

        .login-card { animation: card-in .7s cubic-bezier(.16, 1, .3, 1) both; }

        .login-slides { transition: height .5s cubic-bezier(.32, .72, 0, 1); }
        .login-slide {
          position: absolute;
          inset: 0 0 auto 0;
          transition: transform .55s cubic-bezier(.32, .72, 0, 1), opacity .3s ease, visibility 0s linear .55s;
        }
        .login-slide[data-pos="current"] {
          position: relative;
          transition: transform .55s cubic-bezier(.32, .72, 0, 1), opacity .45s ease .08s, visibility 0s;
        }
        .login-slide[data-pos="before"] { opacity: 0; transform: translateX(-48px); visibility: hidden; }
        .login-slide[data-pos="after"] { opacity: 0; transform: translateX(48px); visibility: hidden; }
        .login-slide[data-pos="current"] .stagger > * { animation: item-in .5s cubic-bezier(.16, 1, .3, 1) both; }
        .login-slide[data-pos="current"] .stagger > :nth-child(2) { animation-delay: .05s; }
        .login-slide[data-pos="current"] .stagger > :nth-child(3) { animation-delay: .1s; }
        .login-slide[data-pos="current"] .stagger > :nth-child(4) { animation-delay: .15s; }
        .login-slide[data-pos="current"] .stagger > :nth-child(n + 5) { animation-delay: .2s; }

        .login-progress { transition: width .6s cubic-bezier(.32, .72, 0, 1), opacity .3s ease; }
        .login-indeterminate { animation: indeterminate 1.1s cubic-bezier(.65, 0, .35, 1) infinite; }

        .field-error { animation: item-in .25s ease both; }
        .shake { animation: shake .4s ease; }

        .login-input:-webkit-autofill,
        .login-input:-webkit-autofill:hover,
        .login-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #fff;
          caret-color: #fff;
          transition: background-color 600000s 0s, color 600000s 0s;
        }
        .code-input::selection { background: transparent; }
        .code-caret { animation: caret-blink 1s step-end infinite; }
        .code-digit { animation: digit-in .18s ease-out both; }

        .done-badge { animation: badge-in .6s cubic-bezier(.34, 1.56, .64, 1) .15s both; }
        .done-check { stroke-dasharray: 18; animation: check-draw .45s ease-out .5s both; }

        @media (prefers-reduced-motion: reduce) {
          .login-card, .login-slide .stagger > *, .field-error, .shake, .code-digit, .done-badge, .done-check {
            animation: none !important;
          }
          .login-slides, .login-slide, .login-progress { transition: none !important; }
          .login-slide[data-pos] { transform: none; }
        }
      `}</style>

      {/* One quiet light source behind the card */}
      <div className="pointer-events-none absolute left-1/2 top-[-30%] h-[70vh] w-[90vw] max-w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,.10),transparent)]" />

      <div className="login-card relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/[.08] bg-[#10151f] shadow-[0_24px_80px_-12px_rgba(0,0,0,.6)]">
        {/* Progress line: fills by step, runs while a request is open */}
        <div className="absolute inset-x-0 top-0 h-[3px] overflow-hidden bg-white/[.04]" aria-hidden="true">
          {loading ? (
            <span className="login-indeterminate absolute inset-y-0 left-0 w-2/5 rounded-full bg-cyan-300" />
          ) : (
            <span
              className="login-progress absolute inset-y-0 left-0 rounded-r-full bg-gradient-to-r from-cyan-300 to-emerald-300"
              style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
            />
          )}
        </div>

        <div className="pt-10 pb-8 sm:pt-12 sm:pb-10">
          <div className="flex justify-center px-6">
            <Image src="/logo.png" alt="RTC League" width={264} height={100} priority className="h-auto w-[120px] select-none" />
          </div>

          <div className="login-slides relative mt-8 overflow-hidden" style={height ? { height } : undefined}>
            {/* 1. Email */}
            <form {...slideProps(0)} className={slideClass} onSubmit={submitEmail} noValidate>
              <div className="stagger space-y-6">
                <h1 className="text-center text-[26px] font-semibold tracking-tight text-white">Sign in</h1>
                {notice && step === 0 ? <Notice>{notice}</Notice> : null}
                <div data-shake>
                  <TextField
                    id="login-email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(v) => {
                      setEmail(v);
                      if (error) setError("");
                    }}
                    inputRef={emailRef}
                    invalid={!!error && step === 0}
                    autoComplete="username"
                  />
                  {errorLine(0)}
                </div>
                <SubmitButton>Continue</SubmitButton>
                <p className="text-center text-sm text-slate-400">
                  New here?{" "}
                  <a href="/request-access" className="font-medium text-cyan-200 transition hover:text-cyan-100">
                    Request access
                  </a>
                </p>
              </div>
            </form>

            {/* 2. Password */}
            <form {...slideProps(1)} className={slideClass} onSubmit={submitPassword} noValidate>
              <div className="stagger space-y-6">
                <div>
                  <h1 className="text-center text-[26px] font-semibold tracking-tight text-white">Enter password</h1>
                  <AccountChip email={email} onClick={() => goTo(0)} />
                </div>
                {notice && step === 1 ? <Notice>{notice}</Notice> : null}
                {/* Lets password managers save the email together with the password. */}
                <input type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" className="hidden" />
                <div data-shake>
                  <TextField
                    id="login-password"
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      if (error) setError("");
                    }}
                    inputRef={passwordRef}
                    invalid={!!error && step === 1}
                    autoComplete="current-password"
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[.06] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                          <path
                            d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                          />
                          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
                          {showPassword ? null : <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
                        </svg>
                      </button>
                    }
                  />
                  {errorLine(1)}
                </div>
                <SubmitButton loading={loading && step === 1}>Continue</SubmitButton>
              </div>
            </form>

            {/* 3. Code (first login only) */}
            <form
              {...slideProps(2)}
              className={slideClass}
              onSubmit={(e) => {
                e.preventDefault();
                verify(verificationCode);
              }}
              noValidate
            >
              <div className="stagger space-y-6">
                <div>
                  <h1 className="text-center text-[26px] font-semibold tracking-tight text-white">Check your email</h1>
                  <AccountChip email={email} onClick={() => goTo(0)} />
                </div>
                <div data-shake>
                  <CodeInput
                    value={verificationCode}
                    onChange={(v) => {
                      setVerificationCode(v);
                      if (error) setError("");
                      if (v.length === 6) verify(v);
                    }}
                    inputRef={codeRef}
                    invalid={!!error && step === 2}
                  />
                  {errorLine(2)}
                </div>
                {devCode ? (
                  <Notice>
                    Development code: <span className="font-semibold tracking-[0.2em]">{devCode}</span>
                  </Notice>
                ) : null}
                <SubmitButton loading={loading && step === 2}>Verify</SubmitButton>
                <div className="text-center text-sm">
                  {resendIn > 0 ? (
                    <span className="tabular-nums text-slate-500">Resend code in {resendIn}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={resend}
                      disabled={loading}
                      className="font-medium text-cyan-200 transition hover:text-cyan-100 disabled:opacity-60"
                    >
                      Resend code
                    </button>
                  )}
                </div>
              </div>
            </form>

            {/* 4. Done */}
            <div {...slideProps(3)} className={slideClass} role="status">
              <div className="stagger flex flex-col items-center pb-2 pt-2 text-center">
                {step === 3 ? (
                  <div className="done-badge grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-cyan-300 to-emerald-300 text-[#0b0f17] shadow-[0_10px_40px_-6px_rgba(52,211,153,.5)]">
                    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
                      <path d="M6 12.5l4 4L18 8.5" className="done-check" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ) : (
                  <div className="h-16 w-16" />
                )}
                <h1 className="mt-6 text-[26px] font-semibold tracking-tight text-white">
                  {codeSkipped ? "Welcome back" : "You're all set"}
                </h1>
                <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
                  <Spinner />
                  <span>Opening dashboard</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-[100dvh] bg-[#0b0f17]" />}>
      <LoginForm />
    </Suspense>
  );
}
