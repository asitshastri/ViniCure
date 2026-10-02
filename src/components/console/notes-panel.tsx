"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, CircleNotch } from "@phosphor-icons/react/ssr";
import { Field, Textarea } from "@/components/ui/field";
import { saveNotes } from "@/lib/data/console";
import { notesSchema } from "@/lib/schemas/console";

/** Saves by itself a moment after the doctor stops typing, so nothing is lost if the call drops. */
export function NotesPanel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsed = notesSchema.safeParse(value);
  const error = parsed.success ? undefined : parsed.error.issues[0]?.message;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function change(next: string) {
    onChange(next);
    if (timer.current) clearTimeout(timer.current);
    if (!notesSchema.safeParse(next).success) return;
    setState("saving");
    timer.current = setTimeout(async () => {
      await saveNotes();
      setState("saved");
    }, 900);
  }

  return (
    <div className="grid gap-3">
      <Field
        label="Consultation notes"
        hint="Part of the patient’s record. Only you and the patient can read them."
        error={error}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            value={value}
            onChange={(e) => change(e.target.value)}
            className="min-h-56"
            maxLength={4000}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <p role="status" className="text-ink-muted flex items-center gap-1.5 text-sm">
        {state === "saving" ? (
          <>
            <CircleNotch aria-hidden className="size-4 animate-spin" />
            Saving…
          </>
        ) : null}
        {state === "saved" ? (
          <>
            <CheckCircle aria-hidden weight="fill" className="text-success size-4" />
            Saved
          </>
        ) : null}
        {state === "idle" ? "Notes save by themselves." : null}
      </p>
    </div>
  );
}
