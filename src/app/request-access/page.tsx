"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

function AccessShell({ children }: { children: React.ReactNode }) {
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

        @media (prefers-reduced-motion: reduce) {
          .aurora, .orb, .logo-float, .logo-halo { animation: none !important; }
          .auth-rise { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <div className="aurora aurora-1" />
      <div className="aurora aurora-2" />
      <div className="aurora aurora-3" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />
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
          <h1 className="mt-8 max-w-xl text-5xl font-black leading-[0.95] tracking-tight text-white">Finance Dashboard</h1>
        </div>
        {children}
      </section>
    </main>
  );
}

export default function RequestAccessPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devApproval, setDevApproval] = useState<{ approveUrl: string; rejectUrl: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setDevApproval(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Request failed.");

      if (json.alreadyApproved && json.loginUrl) {
        setMessage(json.message || "This email is approved. Redirecting to login.");
        router.push(json.loginUrl);
        return;
      }

      setSubmitted(true);
      setMessage(json.message || "Wait for Approval. Your request has been sent to Taha.");
      if (json.devApproval) setDevApproval(json.devApproval);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccessShell>
      <div className="auth-rise mx-auto w-full max-w-[500px] rounded-[32px] border border-white/12 bg-slate-950/72 p-5 shadow-[0_36px_120px_rgba(0,0,0,.52)] backdrop-blur-2xl sm:p-7">
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
          <div className="text-2xl font-black tracking-tight text-white">Finance Dashboard</div>
        </div>

        {!submitted ? (
          <>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/80">Access Gateway</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white">Request access</h2>
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
                  placeholder="name@company.com"
                  className="mt-2 h-14 w-full rounded-2xl border border-white/10 bg-black/34 px-4 text-base font-medium text-white outline-none transition duration-300 placeholder:text-slate-600 focus:border-cyan-200/60 focus:bg-black/42 focus:ring-4 focus:ring-cyan-400/10"
                />
              </div>
              {error ? <div className="rounded-2xl border border-rose-300/30 bg-rose-500/12 p-3 text-sm font-medium text-rose-100">{error}</div> : null}
              {message ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/12 p-3 text-sm font-medium text-emerald-100">{message}</div> : null}
              <button
                type="submit"
                disabled={loading}
                className="relative h-14 w-full overflow-hidden rounded-2xl border border-cyan-200/20 bg-gradient-to-r from-cyan-500/26 via-emerald-400/18 to-cyan-500/26 px-5 text-base font-black text-white shadow-[0_18px_40px_rgba(8,145,178,.22)] transition duration-300 hover:scale-[1.01] hover:border-cyan-100/36 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending request..." : "Request Access"}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-[26px] border border-emerald-200/22 bg-emerald-400/12 shadow-[0_0_44px_rgba(16,185,129,.18)]">
              <div className="h-8 w-8 rounded-full border-4 border-emerald-200/80 border-t-transparent animate-spin" />
            </div>
            <h2 className="mt-6 text-3xl font-black tracking-tight text-white">Wait for Approval</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-300">{message}</p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Next step</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">After approval, you will receive an email with the login link. Then you can create your password and verify the six-digit code.</p>
            </div>
            {devApproval ? (
              <div className="mt-4 space-y-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-left text-sm font-semibold text-cyan-100">
                <div>Development approval links:</div>
                <a href={devApproval.approveUrl} className="block break-all text-emerald-200">Approve: {devApproval.approveUrl}</a>
                <a href={devApproval.rejectUrl} className="block break-all text-rose-200">Reject: {devApproval.rejectUrl}</a>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </AccessShell>
  );
}
