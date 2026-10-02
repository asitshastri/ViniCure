"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
  id: string;
  label: string;
  /** Optional count shown after the label. */
  count?: number;
  panel: ReactNode;
};

type TabsProps = {
  items: TabItem[];
  defaultId?: string;
  label: string;
  className?: string;
};

export function Tabs({ items, defaultId, label, className }: TabsProps) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(defaultId ?? items[0]?.id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function move(toIndex: number) {
    const next = items[(toIndex + items.length) % items.length];
    if (!next) return;
    setActiveId(next.id);
    tabRefs.current[next.id]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") move(index + 1);
    else if (event.key === "ArrowLeft") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]"
      >
        {items.map((item, index) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[item.id] = el;
              }}
              id={`${baseId}-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-base font-medium transition-colors",
                selected
                  ? "border-primary text-primary"
                  : "text-ink-muted hover:text-ink border-transparent",
              )}
            >
              {item.label}
              {item.count !== undefined ? (
                <span className="bg-primary-soft text-primary rounded-full px-2 text-xs font-semibold">
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`${baseId}-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== activeId}
          tabIndex={0}
          className="pt-5"
        >
          {item.id === activeId ? item.panel : null}
        </div>
      ))}
    </div>
  );
}
