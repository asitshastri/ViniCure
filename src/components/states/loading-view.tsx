"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Page-shaped placeholder. It tells assistive tech what is happening, and after a few seconds says it is slow
 * instead of leaving a grey screen with no explanation.
 */
export function LoadingView({
  label = "Loading this page",
  heading = true,
}: {
  label?: string;
  /** Set false when the view sits inside a page that already has its own h1. */
  heading?: boolean;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" className="grid grid-cols-[minmax(0,1fr)] gap-4" aria-busy="true">
      {heading ? <h1 className="sr-only">{label}</h1> : null}
      <span className="sr-only">
        {slow ? `${label}. This is taking longer than usual.` : label}
      </span>
      <Skeleton className="h-10 w-64 max-w-full" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="grid gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      {slow ? (
        <p className="text-ink-muted" aria-hidden>
          This is taking longer than usual. Check your connection. You can keep waiting or refresh
          the page.
        </p>
      ) : null}
    </div>
  );
}
