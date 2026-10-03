"use client";

import { useCallback, useEffect, useState } from "react";

/** Counts down once a second. Returns the seconds left and a function to restart it. */
export function useCountdown(): [number, (seconds: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const start = useCallback((seconds: number) => setLeft(seconds), []);
  return [left, start];
}
