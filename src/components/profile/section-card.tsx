import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/** One labelled block on a settings page. The id is also the anchor for in-page links. */
export function SectionCard({ id, title, description, children, className }: Props) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className={cn("border-line bg-surface shadow-card rounded-xl border p-5 sm:p-6", className)}
    >
      <h2 id={`${id}-h`} className="text-xl font-semibold">
        {title}
      </h2>
      {description ? <p className="text-ink-muted mt-1 max-w-prose">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
