"use client";

import React from "react";

type KpiItem = {
  title: string;
  value: string;
  note: string;
  progress: number;
};

function ProgressRing({ progress }: { progress: number }) {
  const radius = 24;
  const c = 2 * Math.PI * radius;
  const safe = Math.max(0, Math.min(100, progress));
  const offset = c - (safe / 100) * c;

  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14">
      <defs>
        <linearGradient id="kpiRing" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r={radius} stroke="rgba(148,163,184,0.22)" strokeWidth="5" fill="none" />
      <circle
        cx="32"
        cy="32"
        r={radius}
        stroke="url(#kpiRing)"
        strokeLinecap="round"
        strokeWidth="5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="36" textAnchor="middle" className="fill-slate-200 text-[11px] font-semibold">
        {Math.round(safe)}%
      </text>
    </svg>
  );
}

export default function KpiCards({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map((item) => (
        <article key={item.title} className="glass-card rounded-[20px] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">{item.title}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">{item.value}</p>
              <p className="mt-2 text-xs text-slate-500">{item.note}</p>
            </div>
            <ProgressRing progress={item.progress} />
          </div>
        </article>
      ))}
    </div>
  );
}
