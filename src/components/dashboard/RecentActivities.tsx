"use client";

import React from "react";

type Activity = {
  id: string;
  name: string;
  role: string;
  message: string;
  time: string;
};

export default function RecentActivities({ items }: { items: Activity[] }) {
  return (
    <article className="glass-card rounded-[22px] p-4">
      <h3 className="text-base font-semibold text-slate-100">Recent Activities</h3>
      <div className="mt-3 space-y-3">
        {items.map((item, idx) => (
          <div key={item.id} className={idx ? "border-t border-white/10 pt-3" : ""}>
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-b from-violet-400/70 to-cyan-400/60 text-xs font-semibold text-white">
                {item.name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-100">{item.name}</p>
                  <p className="text-[11px] text-slate-500">{item.time}</p>
                </div>
                <p className="text-[11px] text-violet-200/80">{item.role}</p>
                <p className="mt-1 text-xs text-slate-400">{item.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
