"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
};

function pageList(page: number, count: number): Array<number | "gap"> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set([1, 2, count - 1, count, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

const item =
  "inline-flex size-11 items-center justify-center rounded-lg text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:size-10";

export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      <button
        type="button"
        className={cn(item, "text-ink hover:bg-primary-soft")}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <CaretLeft aria-hidden className="size-5" />
      </button>
      {pageList(page, pageCount).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} aria-hidden className="text-ink-faint px-1">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              item,
              p === page ? "bg-primary text-white" : "text-ink hover:bg-primary-soft",
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className={cn(item, "text-ink hover:bg-primary-soft")}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="Next page"
      >
        <CaretRight aria-hidden className="size-5" />
      </button>
    </nav>
  );
}
