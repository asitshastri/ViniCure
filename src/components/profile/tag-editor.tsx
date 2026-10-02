"use client";

import { useId, useState } from "react";
import { X } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { tagSchema } from "@/lib/schemas/profile";

type Props = {
  label: string;
  hint: string;
  items: string[];
  onChange: (items: string[]) => void;
  emptyText: string;
  max?: number;
};

/** Add and remove short items (conditions, allergies). Enter adds; every chip has a real remove button. */
export function TagEditor({ label, hint, items, onChange, emptyText, max = 20 }: Props) {
  const uid = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [announce, setAnnounce] = useState("");

  function add() {
    if (!value.trim()) return;
    const parsed = tagSchema.safeParse(value);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    const v = parsed.data;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase()))
      return setError("That is already on the list.");
    if (items.length >= max) return setError(`You can add up to ${max}.`);
    onChange([...items, v]);
    setAnnounce(`${v} added`);
    setValue("");
    setError(undefined);
  }

  return (
    <div className="grid gap-3">
      <Field inputId={`${uid}-in`} label={label} hint={hint} error={error}>
        {({ describedBy, invalid }) => (
          <div className="flex gap-2">
            <Input
              id={`${uid}-in`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              maxLength={60}
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
            <Button type="button" variant="secondary" onClick={add}>
              Add
            </Button>
          </div>
        )}
      </Field>
      {items.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={`${label}, added`}>
          {items.map((i) => (
            <li
              key={i}
              className="bg-primary-soft text-ink inline-flex min-h-11 items-center gap-1 rounded-full pl-4"
            >
              {i}
              <button
                type="button"
                aria-label={`Remove ${i}`}
                onClick={() => {
                  onChange(items.filter((x) => x !== i));
                  setAnnounce(`${i} removed`);
                }}
                className="text-ink-muted hover:text-danger flex size-11 items-center justify-center rounded-full"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted text-sm">{emptyText}</p>
      )}
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
