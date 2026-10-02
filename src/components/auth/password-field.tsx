"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react/ssr";
import { Field, Input } from "@/components/ui/field";

type PasswordFieldProps = Omit<ComponentProps<typeof Input>, "type" | "id"> & {
  label: string;
  error?: string | undefined;
  hint?: string;
  autoComplete: "current-password" | "new-password";
  /** Fixed id so an error summary can link to the field. */
  inputId?: string;
};

/** Paste and password managers work. The show button is a real button with a state. */
export function PasswordField({ label, error, hint, inputId, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} error={error} hint={hint} inputId={inputId} required>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <Input
            {...props}
            id={id}
            type={visible ? "text" : "password"}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label={visible ? "Hide password" : "Show password"}
            className="text-ink-muted hover:text-ink absolute top-0 right-0 flex size-11 items-center justify-center rounded-lg"
          >
            {visible ? (
              <EyeSlash aria-hidden className="size-5" />
            ) : (
              <Eye aria-hidden className="size-5" />
            )}
          </button>
        </div>
      )}
    </Field>
  );
}
