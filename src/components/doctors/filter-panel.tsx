"use client";

import { useId, useState, type ReactNode } from "react";
import { Funnel } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";

/** On phones the filters sit behind a button. From 1024px they are always visible. */
export function FilterPanel({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <Button
        variant="secondary"
        className="w-full lg:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Funnel aria-hidden className="size-5" />
        {open ? "Hide filters" : "Show filters"}
        {activeCount > 0 ? ` (${activeCount} on)` : ""}
      </Button>
      <div id={panelId} className={open ? "mt-4 block" : "hidden lg:block"}>
        {children}
      </div>
    </div>
  );
}
