"use client";

import React from "react";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  rightRail: React.ReactNode;
};

const sidebarItems = ["◈", "◉", "◍", "◌", "◎", "⚙"];

export default function DashboardShell({ title, subtitle, children, rightRail }: DashboardShellProps) {
  return (
    <div className="dashboard-bg min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] rounded-[28px] border border-white/10 bg-[#0f1326]/90 p-3 shadow-[0_28px_80px_rgba(2,6,23,0.75)] backdrop-blur-xl md:p-5">
        <div className="grid gap-4 lg:grid-cols-[78px_1fr_330px]">
          <aside className="glass-card hidden flex-col items-center gap-4 rounded-[22px] p-3 lg:flex">
            {sidebarItems.map((icon, idx) => (
              <button
                key={idx}
                className={[
                  "grid h-11 w-11 place-items-center rounded-xl border text-sm transition",
                  idx === 0
                    ? "border-violet-300/35 bg-violet-400/20 text-violet-100 shadow-[0_0_25px_rgba(167,139,250,0.35)]"
                    : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-200/30 hover:text-slate-200",
                ].join(" ")}
              >
                {icon}
              </button>
            ))}
          </aside>

          <main className="space-y-4">
            <header className="glass-card rounded-[22px] px-5 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">{title}</h1>
                  <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
                </div>

                <div className="relative w-full xl:max-w-md">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">⌕</span>
                  <input
                    placeholder="Search"
                    className="h-11 w-full rounded-full border border-white/10 bg-white/5 pl-11 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-300/40 focus:bg-white/10"
                  />
                </div>
              </div>
            </header>

            {children}
          </main>

          <aside className="space-y-4">{rightRail}</aside>
        </div>
      </div>
    </div>
  );
}
