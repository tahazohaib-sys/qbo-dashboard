"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type SearchOption = { value: string; label: string; hint?: string };

/** A drop-down list with a search bar. Keyboard: arrows, Enter, Escape. */
export default function SearchSelect({
  value,
  options,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className = "",
  emptyText = "No match",
}: {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(needle));
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    if (!open) {
      setQ("");
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    setOpen(!open);
  }

  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active].value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-left text-sm outline-none transition hover:border-white/20 focus:border-cyan-300/40 disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "text-slate-100" : "text-slate-500"}`}>{selected ? selected.label : value || placeholder}</span>
        <span className="text-xs text-slate-400">▾</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 min-w-[220px] overflow-hidden rounded-xl border border-white/15 bg-[#0b1224] shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Search..."
            className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <ul ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {filtered.length ? (
              filtered.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o.value)}
                    className={`flex w-full flex-col px-3 py-1.5 text-left text-sm ${
                      i === active ? "bg-cyan-400/15 text-white" : "text-slate-200"
                    } ${o.value === value ? "font-semibold" : ""}`}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.hint ? <span className="truncate text-xs text-slate-400">{o.hint}</span> : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-sm text-slate-500">{emptyText}</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
