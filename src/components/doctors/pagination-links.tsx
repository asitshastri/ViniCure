import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";
import { directoryHref, type DirectoryQuery } from "@/lib/schemas/doctors";

const item =
  "inline-flex size-11 items-center justify-center rounded-lg text-base font-medium transition-colors sm:size-10";

/** Page links, not buttons, so every page has its own URL and works without JavaScript. */
export function PaginationLinks({
  query,
  page,
  pageCount,
}: {
  query: DirectoryQuery;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => directoryHref(query, { page: p });
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          aria-label="Previous page"
          className={cn(item, "text-ink hover:bg-primary-soft")}
        >
          <CaretLeft aria-hidden className="size-5" />
        </Link>
      ) : null}
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
        <Link
          key={p}
          href={href(p)}
          aria-label={`Page ${p}`}
          aria-current={p === page ? "page" : undefined}
          className={cn(
            item,
            p === page ? "bg-primary text-white" : "text-ink hover:bg-primary-soft",
          )}
        >
          {p}
        </Link>
      ))}
      {page < pageCount ? (
        <Link
          href={href(page + 1)}
          aria-label="Next page"
          className={cn(item, "text-ink hover:bg-primary-soft")}
        >
          <CaretRight aria-hidden className="size-5" />
        </Link>
      ) : null}
    </nav>
  );
}

/**
 * Paging for the real directory, which uses a page link (cursor) instead of page numbers. Both
 * are plain links, so they work without JavaScript and every page has its own URL.
 */
export function CursorLinks({
  query,
  nextCursor,
}: {
  query: DirectoryQuery;
  nextCursor: string | null;
}) {
  if (!nextCursor && !query.cursor) return null;
  return (
    <nav aria-label="More doctors" className="flex flex-wrap items-center justify-center gap-4">
      {query.cursor ? (
        <Link
          href={directoryHref(query, { cursor: undefined })}
          className="text-primary min-h-11 content-center font-semibold underline"
        >
          Back to the first doctors
        </Link>
      ) : null}
      {nextCursor ? (
        <Link
          href={directoryHref(query, { cursor: nextCursor })}
          className="border-line-strong text-ink hover:bg-primary-soft inline-flex min-h-11 items-center gap-2 rounded-lg border px-5 font-medium transition-colors"
        >
          Show more doctors
          <CaretRight aria-hidden className="size-5" />
        </Link>
      ) : null}
    </nav>
  );
}
