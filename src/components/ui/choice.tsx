"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ChoiceProps = Omit<ComponentProps<"input">, "type"> & {
  label: ReactNode;
  description?: ReactNode;
};

function Choice({
  type,
  label,
  description,
  className,
  id,
  ...props
}: ChoiceProps & { type: "checkbox" | "radio" }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = `${inputId}-desc`;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={inputId}
        type={type}
        aria-describedby={description ? descId : undefined}
        className="accent-primary mt-0.5 size-5 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <label htmlFor={inputId} className="text-ink flex flex-col text-base">
        <span>{label}</span>
        {description ? (
          <span id={descId} className="text-ink-muted text-sm">
            {description}
          </span>
        ) : null}
      </label>
    </div>
  );
}

export function Checkbox(props: ChoiceProps) {
  return <Choice type="checkbox" {...props} />;
}

export function Radio(props: ChoiceProps) {
  return <Choice type="radio" {...props} />;
}

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
};

export function Switch({ checked, onCheckedChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-line-strong",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform duration-150",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
