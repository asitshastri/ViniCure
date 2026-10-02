import { Check } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type StepperProps = {
  steps: string[];
  /** Zero-based index of the current step. */
  current: number;
  className?: string;
};

export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={cn("flex items-center gap-2", className)} aria-label="Progress">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className="flex flex-1 items-center gap-2 last:flex-none"
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                done && "border-primary bg-primary text-white",
                active && "border-primary bg-primary-soft text-primary",
                !done && !active && "border-line-strong bg-surface text-ink-muted",
              )}
            >
              {done ? <Check aria-hidden weight="bold" className="size-4" /> : index + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm font-medium sm:inline",
                active ? "text-ink" : "text-ink-muted",
              )}
            >
              {step}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden className={cn("h-px flex-1", done ? "bg-primary" : "bg-line")} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
