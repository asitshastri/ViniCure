import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  /** Pick the level that follows the heading above it, so headings never skip a level. */
  as?: "h2" | "h3" | "h4";
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  as: Heading = "h2",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-line-strong bg-surface flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="bg-primary-soft text-primary flex size-14 items-center justify-center rounded-full [&>svg]:size-7"
      >
        {icon}
      </span>
      <Heading className="font-display text-ink text-lg font-semibold">{title}</Heading>
      <p className="text-ink-muted max-w-sm text-base">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
