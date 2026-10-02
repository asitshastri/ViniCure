import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionProps = {
  id?: string;
  title: string;
  intro?: string;
  action?: ReactNode;
  tone?: "plain" | "tint";
  children: ReactNode;
  className?: string;
};

/** Page section with a heading. The id doubles as the aria-labelledby target. */
export function Section({
  id,
  title,
  intro,
  action,
  tone = "plain",
  children,
  className,
}: SectionProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("py-14 sm:py-20", tone === "tint" && "bg-primary-tint", className)}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h2 id={headingId} className="text-ink text-3xl font-semibold sm:text-4xl">
              {title}
            </h2>
            {intro ? <p className="text-ink-muted mt-3 text-lg">{intro}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}
