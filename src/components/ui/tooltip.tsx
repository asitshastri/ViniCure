"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type TooltipProps = {
  content: string;
  /** Pass the received id to the trigger as aria-describedby. */
  children: (describedBy: string) => ReactNode;
  className?: string;
};

/** For short, non-essential hints only. Shows on hover and keyboard focus. Escape hides it. */
export function Tooltip({ content, children, className }: TooltipProps) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visible = (hovered || focused) && !dismissed;

  useEffect(() => {
    if (!visible) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDismissed(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible]);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => {
        setDismissed(false);
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        setDismissed(false);
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
    >
      {children(id)}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "bg-dock shadow-pop pointer-events-none absolute bottom-full left-1/2 z-[100] mb-2 w-max max-w-56 -translate-x-1/2 rounded-lg px-3 py-1.5 text-sm text-white",
          visible ? "block" : "hidden",
        )}
      >
        {content}
      </span>
    </span>
  );
}
