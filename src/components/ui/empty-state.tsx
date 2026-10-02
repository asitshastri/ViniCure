import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
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
      <h3 className="font-display text-ink text-lg font-semibold">{title}</h3>
      <p className="text-ink-muted max-w-sm text-base">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
