"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { BreakGlassSession } from "@/lib/types";

// The grant lives in sessionStorage so every staff page can show the countdown. In P9 the server owns the grant and
// its expiry; this copy only drives the banner.
const KEY = "vc-break-glass";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}
function emit() {
  listeners.forEach((fn) => fn());
}

export function saveBreakGlass(session: BreakGlassSession) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage blocked: the page still shows the grant for this visit */
  }
  memory = JSON.stringify(session);
  emit();
}
export function clearBreakGlass() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  memory = null;
  emit();
}
let memory: string | null = null;

export function useBreakGlass(): BreakGlassSession | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => read() ?? memory,
    () => null,
  );
  return useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BreakGlassSession;
    } catch {
      return null;
    }
  }, [raw]);
}

/** Current time in ms, ticking each second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
