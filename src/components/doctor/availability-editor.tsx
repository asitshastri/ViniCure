"use client";

import { useId, useState } from "react";
import { ErrorSummary } from "@/components/auth/error-summary";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/choice";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveAvailability } from "@/lib/data/doctor";
import { SLOT_LENGTHS, checkAvailability } from "@/lib/schemas/doctor";
import type { AvailabilityDay } from "@/lib/types";

export function AvailabilityEditor({ initial }: { initial: AvailabilityDay[] }) {
  const uid = useId();
  const { toast } = useToast();
  const [days, setDays] = useState(initial);
  const [slot, setSlot] = useState("20");
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const idFor = (d: number) => `${uid}-end-${d}`;

  const update = (day: number, patch: Partial<AvailabilityDay>) =>
    setDays((l) => l.map((d) => (d.day === day ? { ...d, ...patch } : d)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found = checkAvailability(days);
    if (Object.keys(found).length) {
      setErrors(found);
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    await saveAvailability();
    setBusy(false);
    toast({
      tone: "success",
      title: "Hours saved",
      description: "Patients see the new times straight away. Booked consultations are not moved.",
    });
  }

  const summaryErrors = Object.fromEntries(
    Object.entries(errors).map(([d, m]) => [
      `day-${d}`,
      `${days.find((x) => x.day === Number(d))?.label}: ${m}`,
    ]),
  );
  const summaryIds = Object.fromEntries(
    Object.keys(errors).map((d) => [`day-${d}`, idFor(Number(d))]),
  );

  return (
    <form noValidate onSubmit={(e) => void save(e)} className="grid gap-5">
      <ErrorSummary errors={summaryErrors} fieldIds={summaryIds} attempt={attempt} />
      <ul className="divide-line border-line divide-y rounded-xl border">
        {days.map((d) => (
          <li key={d.day} className="grid gap-3 p-4 sm:grid-cols-[10rem_1fr] sm:items-start">
            <div className="flex items-center gap-3">
              <Switch
                label={`${d.label}: ${d.enabled ? "open" : "closed"}`}
                checked={d.enabled}
                onCheckedChange={(v) => update(d.day, { enabled: v })}
              />
              <span className="font-semibold">{d.label}</span>
            </div>
            {d.enabled ? (
              <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                <Field label="From">
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      type="time"
                      value={d.start}
                      onChange={(e) => update(d.day, { start: e.target.value })}
                      aria-describedby={describedBy}
                    />
                  )}
                </Field>
                <Field inputId={idFor(d.day)} label="Until" error={errors[d.day]}>
                  {({ describedBy, invalid }) => (
                    <Input
                      id={idFor(d.day)}
                      type="time"
                      value={d.end}
                      onChange={(e) => update(d.day, { end: e.target.value })}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                    />
                  )}
                </Field>
              </div>
            ) : (
              <p className="text-ink-muted self-center">Closed. Patients cannot book this day.</p>
            )}
          </li>
        ))}
      </ul>
      <div className="max-w-xs">
        <Field
          label="Length of each consultation"
          hint="Patients can pick a start time every this many minutes."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              aria-describedby={describedBy}
            >
              {SLOT_LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div>
        <Button type="submit" loading={busy}>
          Save hours
        </Button>
      </div>
    </form>
  );
}
