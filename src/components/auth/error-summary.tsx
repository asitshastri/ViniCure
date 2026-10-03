"use client";

import { useEffect, useRef } from "react";

type ErrorSummaryProps = {
  errors: Record<string, string>;
  /** Maps an error key to the id of its input. */
  fieldIds: Record<string, string>;
  /** Changes on every failed submit so focus moves again. */
  attempt: number;
};

/** Focusable list of problems with links to the fields. Shown when two or more fields fail. */
export function ErrorSummary({ errors, fieldIds, attempt }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors);
  const show = entries.length > 1;

  useEffect(() => {
    if (show) ref.current?.focus();
  }, [attempt, show]);

  if (!show) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      className="border-danger bg-danger-soft text-danger mb-6 rounded-xl border p-4"
    >
      <h2 id="error-summary-title" className="text-lg font-semibold">
        There is a problem
      </h2>
      <ul className="mt-2 list-disc pl-5">
        {entries.map(([key, message]) => (
          <li key={key}>
            <a href={`#${fieldIds[key] ?? key}`} className="font-medium underline">
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
