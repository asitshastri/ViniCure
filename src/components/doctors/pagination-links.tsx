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
