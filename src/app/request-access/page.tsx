"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";

function AccessShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(900px_620px_at_8%_-8%,rgba(0,114,188,0.26),transparent_62%),radial-gradient(760px_520px_at_92%_10%,rgba(16,185,129,0.16),transparent_58%),linear-gradient(135deg,#07152b_0%,#050914_48%,#081321_100%)] px-4 py-8 text-slate-100">
      <style jsx global>{`
        @keyframes grid-drift {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(38px, 38px, 0); }
        }
        @keyframes rise-in {
          0% { opacity: 0; transform: translateY(18px) scale(.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes shimmer-line {
          0% { transform: translateX(-120%); opacity: 0; }
          18% { opacity: .7; }
          100% { transform: translateX(120%); opacity: 0; }
        }
        .auth-grid {
          animation: grid-drift 24s linear infinite;
        }
        .auth-rise {
          animation: rise-in .7s ease-out both;
        }
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
            <div className="relative h-24 w-24 overflow-hidden rounded-[26px] border border-cyan-200/16 bg-slate-950/68 p-3 shadow-[0_24px_70px_rgba(0,0,0,.42),0_0_42px_rgba(34,211,238,.14)] auth-shimmer">
              <Image src="/logo.png" alt="RTC League" fill className="object-contain p-3" priority />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-emerald-200/80">RTC League</p>
              <h1 className="mt-2 max-w-xl text-5xl font-black leading-[0.95] tracking-tight text-white">Finance Dashboard</h1>
            </div>
          </div>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
            Access is controlled through approval first. Submit your email, then wait for Taha to approve your request before login begins.
          </p>
          <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
            {[
              ["01", "Request"],
              ["02", "Approval"],
              ["03", "Secure login"],
            ].map(([step, label]) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
                <div className="text-xs font-black tracking-[0.24em] text-cyan-200/80">{step}</div>
                <div className="mt-2 text-sm font-semibold text-white">{label}</div>
              </div>
            ))}
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}

export default function RequestAccessPage() {
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
        <div className="mb-7 flex items-center gap-4 lg:hidden">
          <div className="relative h-16 w-16 overflow-hidden rounded-[22px] border border-cyan-200/15 bg-slate-950/70 p-2 shadow-[0_0_30px_rgba(34,211,238,.12)]">
            <Image src="/logo.png" alt="RTC League" fill className="object-contain p-2" priority />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-200/80">RTC League</p>
            <div className="text-2xl font-black tracking-tight text-white">Finance Dashboard</div>
          </div>
        </div>

        {!submitted ? (
          <>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/80">Access Gateway</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white">Request access</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">Enter your work email. Taha will receive an approval email before login is available.</p>
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
