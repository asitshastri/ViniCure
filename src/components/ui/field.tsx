import { useId, type ComponentProps, type ReactNode } from "react";
import { CaretDown, WarningCircle } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type FieldRenderProps = {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
};

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  /** Use a fixed id for the control, for example so an error summary can link to it. */
  inputId?: string;
  className?: string;
  children: (props: FieldRenderProps) => ReactNode;
};

/** Label, helper text and error message wired to one control with ARIA. */
export function Field({
  label,
  hint,
  error,
  required = false,
  inputId,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const id = inputId ?? autoId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-ink text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden className="text-danger ml-0.5">
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        describedBy: describedBy || undefined,
        invalid: Boolean(error),
        required,
      })}
      {hint ? (
        <p id={hintId} className="text-ink-muted text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-danger flex items-start gap-1.5 text-sm">
          <WarningCircle aria-hidden weight="fill" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

const control =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-faint transition-colors disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger";

type InputProps = ComponentProps<"input"> & {
  /** Icon shown inside the field, left side. Decorative. */
  leading?: ReactNode;
};

export function Input({ leading, className, ...props }: InputProps) {
  if (!leading) {
    return <input className={cn(control, "h-11", className)} {...props} />;
  }
  return (
    <div className="relative">
      <span
        aria-hidden
        className="text-ink-faint pointer-events-none absolute inset-y-0 left-3 flex items-center"
      >
        {leading}
      </span>
      <input className={cn(control, "h-11 pl-10", className)} {...props} />
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-11 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <CaretDown
        aria-hidden
        className="text-ink-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}
