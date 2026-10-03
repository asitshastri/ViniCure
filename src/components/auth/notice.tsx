import type { ReactNode } from "react";
import { Clock, Info, WarningCircle } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type NoticeProps = {
  tone: "info" | "danger" | "warning";
  title: string;
  children?: ReactNode;
  className?: string;
};

const styles = {
  info: "bg-info-soft text-info border-info/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  warning: "bg-warning-soft text-warning border-warning/30",
} as const;
const icons = { info: Info, danger: WarningCircle, warning: Clock } as const;

/** Inline message with an icon and words, so colour is never the only signal. */
export function Notice({ tone, title, children, className }: NoticeProps) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn("flex gap-3 rounded-xl border p-4", styles[tone], className)}
    >
      <Icon aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-base">{children}</div> : null}
      </div>
    </div>
  );
}

/** Marks screens that only exist for the prototype. Remove when P2 lands. */
export function PrototypeHint({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <details
      className={cn(
        "mt-6 rounded-xl border border-dashed p-4 text-sm",
        dark ? "border-white/50 text-white" : "border-line-strong text-ink-muted",
      )}
    >
      <summary className={cn("min-h-6 font-semibold", dark ? "text-white" : "text-ink")}>
        Prototype only: try the other states
      </summary>
      <div className="mt-2 grid gap-1">{children}</div>
    </details>
  );
}
