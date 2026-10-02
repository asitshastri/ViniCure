import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Small line above the title, such as breadcrumbs or the date. */
  eyebrow?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        {eyebrow}
        <h1 className="font-display text-ink text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? <p className="text-ink-muted max-w-2xl text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
