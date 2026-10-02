import type { ReactNode } from "react";
import { WarningCircle, Info } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="font-display text-ink text-2xl font-semibold" tabIndex={-1} data-auth-heading>
        {title}
      </h1>
      {description ? <p className="text-ink-muted mt-2">{description}</p> : null}
      <div className="mt-6 flex flex-col gap-5">{children}</div>
      {footer ? (
        <div className="border-line text-ink-muted mt-6 border-t pt-4 text-sm">{footer}</div>
      ) : null}
    </Card>
  );
}

export function Notice({
  tone = "danger",
  children,
  className,
}: {
  tone?: "danger" | "info" | "warning";
  children: ReactNode;
  className?: string;
}) {
  const Icon = tone === "info" ? Info : WarningCircle;
  const styles = {
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
  } as const;
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn("flex items-start gap-2 rounded-lg p-3 text-sm", styles[tone], className)}
    >
      <Icon aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** Reviewer help shown on the UI-first pages only. Remove when real auth lands (P2). */
export function DemoHint({ children }: { children: ReactNode }) {
  return (
    <p className="border-line-strong text-ink-muted rounded-lg border border-dashed p-3 text-xs">
      <strong className="text-ink">Demo only:</strong> {children}
    </p>
  );
}
