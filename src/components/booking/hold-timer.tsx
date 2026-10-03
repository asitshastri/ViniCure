"use client";

import { useEffect, useState } from "react";
import { Timer } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type HoldTimerProps = { expiresAt: number; onExpire: () => void };

function format(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Counts down to the end of the slot hold. Screen readers hear it only at 2 minutes, 1 minute and 30 seconds. */
export function HoldTimer({ expiresAt, onExpire }: HoldTimerProps) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setLeft(next);
      if (next === 0) onExpire();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  const urgent = left <= 60;
  const announce = [120, 60, 30].includes(left) ? `Your held time ends in ${format(left)}.` : "";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
        urgent
          ? "border-warning bg-warning-soft text-warning"
          : "border-line bg-primary-tint text-ink",
      )}
    >
      <Timer aria-hidden className="size-5 shrink-0" />
      <span>
        We are holding this time for you:{" "}
        <span className="font-display tabular-nums" aria-hidden>
          {format(left)}
        </span>
      </span>
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
