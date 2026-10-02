import type { ComponentProps, ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("border-line bg-surface shadow-card rounded-xl border p-5", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("font-display text-ink text-lg font-semibold", className)} {...props} />;
}

type StatTileProps = {
  icon: ReactNode;
  label: string;
  value: string;
  /** Change since the last period, for example "+12%". Include the sign. */
  change?: string;
  direction?: "up" | "down";
  /** Whether the direction is good news. Color is never the only signal: an arrow and the sign are shown too. */
  good?: boolean;
  note?: string;
  className?: string;
};

export function StatTile({
  icon,
  label,
  value,
  change,
  direction = "up",
  good = true,
  note,
  className,
}: StatTileProps) {
  const Arrow = direction === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-full"
        >
          {icon}
        </span>
        <p className="text-ink-muted text-sm font-medium">{label}</p>
      </div>
      <p className="font-display text-ink text-3xl font-semibold">{value}</p>
      {change || note ? (
        <p className="text-ink-muted flex flex-wrap items-center gap-x-2 text-sm">
          {change ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                good ? "text-success" : "text-danger",
              )}
            >
              <Arrow aria-hidden className="size-4" />
              <span className="sr-only">{direction === "up" ? "Up" : "Down"}</span>
              {change}
            </span>
          ) : null}
          {note ? <span>{note}</span> : null}
        </p>
      ) : null}
    </Card>
  );
}
