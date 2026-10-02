import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type Crumb = { label: string; href?: string };

/** Use for pages three or more levels deep. The last item is the current page. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="text-ink-muted flex flex-wrap items-center gap-1 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className={cn("hover:text-primary rounded px-1 py-1.5 hover:underline")}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn(last && "text-ink font-medium")}
                >
                  {item.label}
                </span>
              )}
              {!last ? <CaretRight aria-hidden className="size-3.5" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
