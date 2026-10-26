"use client";

import { useEffect } from "react";

/** Same value as SESSION_MAX_AGE_SECONDS in lib/auth.ts. */
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
/** Tell the server about activity at most this often. */
const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
/** Shared by all open tabs, so activity in one tab keeps the others signed in. */
const STORAGE_KEY = "qbo_dashboard_last_activity";
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

function readLastActivity(fallback: number) {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > fallback ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeLastActivity(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage is not available; this tab still uses its own timer.
  }
}

function goToLogin(reason: string) {
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login?reason=${reason}&next=${encodeURIComponent(next)}`;
}

/**
 * Signs the user out after 2 hours with no mouse, keyboard, touch or scroll
 * activity. The server cookie has the same idle timeout, so the session also
 * ends when the browser is closed or the computer sleeps.
 */
export default function IdleLogout() {
  useEffect(() => {
    let lastActivity = readLastActivity(Date.now());
    let lastKeepalive = Date.now();
    let lastWrite = 0;
    let loggingOut = false;

    writeLastActivity(lastActivity);

    async function logout() {
      if (loggingOut) return;
      loggingOut = true;
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      goToLogin("idle");
    }

    function check() {
      if (loggingOut) return;
      lastActivity = readLastActivity(lastActivity);
      if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) void logout();
    }

    function onActivity() {
      if (loggingOut) return;
      const now = Date.now();
      // The device may have slept past the timeout; do not let this event extend the session.
      if (now - readLastActivity(lastActivity) >= IDLE_TIMEOUT_MS) {
        void logout();
        return;
      }
      lastActivity = now;
      if (now - lastWrite > 1000) {
        lastWrite = now;
        writeLastActivity(now);
      }
      if (now - lastKeepalive >= KEEPALIVE_INTERVAL_MS) {
        lastKeepalive = now;
        fetch("/api/auth/keepalive", { method: "POST" })
          .then((res) => {
            if (res.status === 401) goToLogin("expired");
          })
          .catch(() => undefined);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") check();
    }

    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
