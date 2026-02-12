"use client";

import React from "react";

type Txn = {
  id: string;
  label: string;
  amount: string;
  time: string;
};

export default function QuickTransactions({ items }: { items: Txn[] }) {
  return (
    <article className="glass-card rounded-[22px] p-4">
      <h3 className="text-base font-semibold text-slate-100">Quick Transactions</h3>
      <p className="mt-1 text-xs text-slate-400">Fast actions</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { label: "Send", tone: "from-violet-500/30 to-violet-700/20" },
          { label: "Receive", tone: "from-cyan-500/30 to-cyan-700/20" },
          { label: "Export", tone: "from-indigo-500/30 to-indigo-700/20" },
        ].map((x) => (
          <button
            key={x.label}
            className={`rounded-full border border-white/10 bg-gradient-to-b ${x.tone} px-4 py-1.5 text-xs font-medium text-slate-200 hover:brightness-110`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex -space-x-2">
        {items.slice(0, 5).map((item, idx) => (
          <div
            key={item.id}
            className="grid h-8 w-8 place-items-center rounded-full border border-[#10172f] bg-gradient-to-b from-violet-400/70 to-cyan-400/60 text-[10px] font-semibold text-white"
            title={item.label}
          >
            {String.fromCharCode(65 + idx)}
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {items.slice(0, 4).map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-200">{item.label}</p>
              <p className="text-xs text-slate-500">{item.time}</p>
            </div>
            <p className="text-sm font-semibold tabular-nums text-slate-100">{item.amount}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
