"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  label?: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string | undefined;
};

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label = "One-time password",
  invalid = false,
  disabled = false,
  describedBy,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  }

  function focusAt(index: number) {
    refs.current[Math.max(0, Math.min(length - 1, index))]?.focus();
  }

  function handleChange(index: number, rawInput: string) {
    const raw = rawInput.replace(/\D/g, "");
    const current = digits[index];
    // Typing into a filled box gives two characters: keep only the new one. Autofill gives many: spread them.
    const typed = current && raw.length === 2 ? raw.replace(current, "") : raw;
    if (!typed) return;
    const next = value.slice(0, index) + typed + value.slice(index + 1);
    commit(next);
    focusAt(index + typed.length);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        commit(value.slice(0, index) + value.slice(index + 1));
      } else {
        commit(value.slice(0, Math.max(0, index - 1)) + value.slice(index));
        focusAt(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    commit(pasted);
    focusAt(pasted.length >= length ? length - 1 : pasted.length);
  }

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "border-line-strong bg-surface font-display text-ink h-12 w-11 rounded-lg border text-center text-xl font-semibold transition-colors sm:w-12",
            "aria-invalid:border-danger aria-invalid:ring-danger disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-1",
          )}
        />
      ))}
    </div>
  );
}
