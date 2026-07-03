"use client";

import { useMemo, useState } from "react";

type AccessUser = {
  id: string;
  email: string;
  status: "approval_pending" | "approved" | "rejected";
  isAdmin: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
};

type Filter = "all" | AccessUser["status"];

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: AccessUser["status"]) {
  if (status === "approval_pending") return "Pending";
  if (status === "approved") return "Approved";
  return "Rejected";
}

function statusClass(status: AccessUser["status"]) {
  if (status === "approved") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (status === "approval_pending") return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  return "border-rose-300/25 bg-rose-400/10 text-rose-100";
}

export default function AdminAccessClient({ initialUsers }: { initialUsers: AccessUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const counts = useMemo(
    () => ({
      all: users.length,
      approval_pending: users.filter((user) => user.status === "approval_pending").length,
      approved: users.filter((user) => user.status === "approved").length,
      rejected: users.filter((user) => user.status === "rejected").length,
    }),
    [users]
  );

  const visibleUsers = filter === "all" ? users : users.filter((user) => user.status === filter);

  async function runAction(userId: string, action: "approve" | "revoke" | "reject") {
    setBusyId(userId);
    setError("");

    try {
      const res = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not update access.");
      setUsers(json.users || []);
    } catch (err: any) {
      setError(err?.message || "Could not update access.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="rounded-[30px] border border-white/10 bg-slate-950/72 p-5 shadow-[0_36px_120px_rgba(0,0,0,.48)] backdrop-blur-2xl sm:p-6">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-200/80">Admin Console</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Access Management</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {[
            ["all", "All", counts.all],
            ["approval_pending", "Pending", counts.approval_pending],
            ["approved", "Approved", counts.approved],
            ["rejected", "Rejected", counts.rejected],
          ].map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as Filter)}
              className={`rounded-2xl border px-4 py-2 text-sm font-black transition ${
                filter === key
                  ? "border-cyan-200/35 bg-cyan-400/14 text-white shadow-[0_12px_30px_rgba(8,145,178,.16)]"
                  : "border-white/10 bg-white/[0.045] text-slate-300 hover:text-white"
              }`}
            >
              {label} <span className="text-cyan-100/80">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-rose-300/30 bg-rose-500/12 p-3 text-sm font-medium text-rose-100">{error}</div> : null}

      <div className="mt-5 space-y-3">
        {visibleUsers.length ? (
          visibleUsers.map((user) => (
            <div key={user.id} className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.045] p-4 lg:grid-cols-[1.2fr_.7fr_.7fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-base font-black text-white">{user.email}</div>
                  {user.isAdmin ? <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Admin</span> : null}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">Created {formatDate(user.createdAt)}</div>
              </div>

              <div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${statusClass(user.status)}`}>
                  {statusLabel(user.status)}
                </span>
              </div>

              <div className="text-sm font-semibold text-slate-300">
                <div>{user.hasPassword ? "Password set" : "No password yet"}</div>
                <div className="mt-1 text-xs text-slate-500">Updated {formatDate(user.updatedAt)}</div>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {user.status !== "approved" && !user.isAdmin ? (
                  <button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => runAction(user.id, "approve")}
                    className="rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-4 py-2 text-sm font-black text-emerald-100 transition hover:bg-emerald-400/18 disabled:opacity-60"
                  >
                    Approve
                  </button>
                ) : null}
                {user.status === "approved" && !user.isAdmin ? (
                  <button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => runAction(user.id, "revoke")}
                    className="rounded-2xl border border-rose-300/25 bg-rose-400/12 px-4 py-2 text-sm font-black text-rose-100 transition hover:bg-rose-400/18 disabled:opacity-60"
                  >
                    Revoke
                  </button>
                ) : null}
                {user.status === "approval_pending" && !user.isAdmin ? (
                  <button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => runAction(user.id, "reject")}
                    className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-black text-slate-200 transition hover:text-white disabled:opacity-60"
                  >
                    Reject
                  </button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-8 text-center text-sm font-semibold text-slate-400">No users in this view.</div>
        )}
      </div>
    </div>
  );
}
