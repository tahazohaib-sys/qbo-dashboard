"use client";

import { useState } from "react";

/**
 * First-time login setup, shown as an auto-playing slideshow.
 * The fill animation of the active progress bar sets the timing: when it
 * ends, the next slide shows. Pause (hover, focus or the button) pauses that
 * animation, and reduced motion turns it off, so there is no autoplay then.
 */

type Slide = {
  title: string;
  body: string;
  art: "request" | "approve" | "password" | "code" | "done";
  link?: { href: string; label: string };
};

const SLIDES: Slide[] = [
  {
    title: "Request access",
    body: "Send an access request with your work email. You do this one time only.",
    art: "request",
    link: { href: "/request-access", label: "Request access" },
  },
  {
    title: "Admin approves your email",
    body: "The admin examines the request. You get an email when your access is approved.",
    art: "approve",
  },
  {
    title: "First login: set your password",
    body: "Enter your approved email and a new password with a minimum of 8 characters.",
    art: "password",
  },
  {
    title: "Confirm the 6-digit code",
    body: "We send a one-time code to your email. Enter it to confirm. Your password is then saved.",
    art: "code",
  },
  {
    title: "Next time: email + password",
    body: "After the first login, sign in with your email and password only. No code is necessary.",
    art: "done",
  },
];

const SLIDE_MS = 5200;

function Art({ kind }: { kind: Slide["art"] }) {
  const ring = "relative grid h-24 w-24 shrink-0 place-items-center rounded-[28px] border border-cyan-200/20 bg-[radial-gradient(circle_at_30%_25%,rgba(34,211,238,.28),rgba(16,185,129,.1)_60%,rgba(255,255,255,.02))] shadow-[0_0_40px_rgba(34,211,238,.18)]";
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (kind === "code") {
    return (
      <div className={ring}>
        <div className="flex gap-[3px]">
          {[4, 8, 2, 9, 1, 6].map((d, i) => (
            <span
              key={i}
              className="ss-digit grid h-7 w-[11px] place-items-center rounded-[4px] border border-cyan-200/35 bg-black/30 text-[10px] font-black text-cyan-50"
              style={{ animationDelay: `${0.25 + i * 0.18}s` }}
            >
              {d}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={ring}>
      <span className="ss-pulse absolute inset-0 rounded-[28px] border border-cyan-200/30" />
      <svg viewBox="0 0 48 48" className="ss-icon h-12 w-12 text-cyan-100" aria-hidden="true">
        {kind === "request" ? (
          <>
            <rect x="6" y="11" width="30" height="22" rx="4" {...stroke} />
            <path d="M7 13l14 10 14-10" {...stroke} />
            <circle cx="37" cy="33" r="7" className="text-emerald-300" {...stroke} />
            <path d="M37 30v6M34 33h6" className="text-emerald-300" {...stroke} />
          </>
        ) : null}
        {kind === "approve" ? (
          <>
            <path d="M24 6l14 5v10c0 9.5-6 17-14 21-8-4-14-11.5-14-21V11l14-5z" {...stroke} />
            <path d="M17 24l5 5 9-10" className="ss-draw text-emerald-300" {...stroke} strokeWidth={2.4} />
          </>
        ) : null}
        {kind === "password" ? (
          <>
            <rect x="9" y="21" width="30" height="20" rx="4" {...stroke} />
            <path d="M16 21v-5a8 8 0 0116 0v5" {...stroke} />
            {[17, 24, 31].map((cx, i) => (
              <circle key={cx} cx={cx} cy="31" r="2.2" className="ss-dot text-emerald-300" fill="currentColor" style={{ animationDelay: `${0.3 + i * 0.25}s` }} />
            ))}
          </>
        ) : null}
        {kind === "done" ? (
          <>
            <circle cx="24" cy="24" r="17" {...stroke} />
            <path d="M16 24.5l5.5 5.5L33 18.5" className="ss-draw text-emerald-300" {...stroke} strokeWidth={2.6} />
          </>
        ) : null}
      </svg>
    </div>
  );
}

export default function SetupSlideshow({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const paused = hoverPaused || userPaused;
  const slide = SLIDES[index];

  const go = (i: number) => setIndex((i + SLIDES.length) % SLIDES.length);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="First-time login setup"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={() => setHoverPaused(false)}
      className={`relative w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-sm ${compact ? "p-5" : "max-w-xl p-6"}`}
    >
      <style jsx global>{`
        @keyframes ss-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes ss-in {
          0% { opacity: 0; transform: translateX(26px); filter: blur(4px); }
          100% { opacity: 1; transform: translateX(0); filter: blur(0); }
        }
        @keyframes ss-pop {
          0% { opacity: 0; transform: scale(.7) rotate(-6deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        @keyframes ss-pulse {
          0% { opacity: .7; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.35); }
        }
        @keyframes ss-draw { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
        @keyframes ss-blink { 0% { opacity: 0; transform: scale(.4); } 100% { opacity: 1; transform: scale(1); } }

        .ss-fill { transform-origin: left center; animation: ss-fill 5s linear forwards; }
        .ss-slide { animation: ss-in .65s cubic-bezier(.22, 1, .36, 1) both; }
        .ss-icon { animation: ss-pop .7s cubic-bezier(.34, 1.56, .64, 1) both; }
        .ss-pulse { animation: ss-pulse 2.4s ease-out infinite; }
        .ss-draw { stroke-dasharray: 40; animation: ss-draw .9s ease .35s both; }
        .ss-dot, .ss-digit { animation: ss-blink .35s ease both; }

        @media (prefers-reduced-motion: reduce) {
          .ss-fill { animation: none; transform: scaleX(1); }
          .ss-slide, .ss-icon, .ss-pulse, .ss-draw, .ss-dot, .ss-digit { animation: none !important; }
        }
      `}</style>

      {/* Progress bars: one per slide. The active bar's fill drives autoplay. */}
      <div className="flex gap-1.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => go(i)}
            aria-label={`Step ${i + 1}: ${s.title}`}
            aria-current={i === index ? "step" : undefined}
            className="group relative h-6 flex-1 cursor-pointer"
          >
            <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/10 transition group-hover:bg-white/20">
              {i < index ? <span className="absolute inset-0 rounded-full bg-cyan-200/70" /> : null}
              {i === index ? (
                <span
                  key={`fill-${index}`}
                  onAnimationEnd={() => go(index + 1)}
                  style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
                  className="ss-fill absolute inset-0 rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300"
                />
              ) : null}
            </span>
          </button>
        ))}
      </div>

      <div key={index} aria-live={paused ? "polite" : "off"} className={`ss-slide flex items-center gap-5 ${compact ? "mt-4" : "mt-6 min-h-[132px]"}`}>
        <Art kind={slide.art} />
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/80">
            Step {index + 1} of {SLIDES.length}
          </div>
          <h3 className={`mt-1.5 font-black leading-tight tracking-tight text-white ${compact ? "text-lg" : "text-2xl"}`}>{slide.title}</h3>
          <p className={`mt-2 text-slate-300/90 ${compact ? "text-sm leading-6" : "text-[15px] leading-7"}`}>{slide.body}</p>
          {slide.link ? (
            <a
              href={slide.link.href}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-200 transition hover:text-emerald-100"
            >
              {slide.link.label} <span aria-hidden="true">→</span>
            </a>
          ) : null}
        </div>
      </div>

      <div className={`flex items-center justify-between ${compact ? "mt-4" : "mt-5"}`}>
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">First-time setup</div>
        <div className="flex items-center gap-2">
          {[
            { label: "Previous step", onClick: () => go(index - 1), icon: "M15 6l-6 6 6 6" },
            { label: userPaused ? "Play slideshow" : "Pause slideshow", onClick: () => setUserPaused((p) => !p), icon: userPaused ? "M8 5l11 7-11 7z" : "M9 5v14M15 5v14" },
            { label: "Next step", onClick: () => go(index + 1), icon: "M9 6l6 6-6 6" },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.onClick}
              aria-label={b.label}
              title={b.label}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:border-cyan-200/40 hover:bg-cyan-400/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d={b.icon} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
