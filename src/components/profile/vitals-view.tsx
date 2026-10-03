"use client";

import { useId, useState } from "react";
import { ErrorSummary } from "@/components/auth/error-summary";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveSimple } from "@/lib/data/profile";
import { formatSlotDay } from "@/lib/data/doctors";
import { fieldErrors } from "@/lib/schemas/auth";
import { vitalsForm } from "@/lib/schemas/profile";
import type { VitalReading } from "@/lib/types";

const FIELDS = [
  { key: "sys", label: "Upper pressure (mmHg)", hint: "Systolic" },
  { key: "dia", label: "Lower pressure (mmHg)", hint: "Diastolic" },
  { key: "pulse", label: "Pulse (beats a minute)" },
  { key: "spo2", label: "Oxygen level (%)", hint: "SpO₂" },
  { key: "temp", label: "Temperature (°C)" },
  { key: "weight", label: "Weight (kg)" },
  { key: "sugar", label: "Blood sugar (mg/dL)" },
] as const;

type Key = (typeof FIELDS)[number]["key"];
const empty = { sys: "", dia: "", pulse: "", spo2: "", temp: "", weight: "", sugar: "", note: "" };

export function VitalsView({ initial }: { initial: VitalReading[] }) {
  const uid = useId();
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const ids = {
    form: `${uid}-sys`,
    ...Object.fromEntries(FIELDS.map((f) => [f.key, `${uid}-${f.key}`])),
    note: `${uid}-note`,
  } as Record<string, string>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = vitalsForm.safeParse(v);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    await saveSimple();
    setBusy(false);
    const d = parsed.data;
    const reading: VitalReading = { id: `v-${rows.length + 1}-new`, date: "2026-10-02" };
    for (const f of FIELDS) {
      const val = d[f.key as Key];
      if (val !== undefined) (reading as unknown as Record<string, number>)[f.key] = val;
    }
    if (d.note) reading.note = d.note;
    setRows((l) => [reading, ...l]);
    setV(empty);
    toast({ tone: "success", title: "Reading saved" });
  }

  const cell = (n: number | undefined) => (n === undefined ? "–" : String(n));
  return (
    <div className="grid min-w-0 gap-8">
      <form
        noValidate
        onSubmit={(e) => void save(e)}
        className="border-line bg-surface shadow-card grid gap-4 rounded-xl border p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <h2 className="text-xl font-semibold sm:col-span-2 lg:col-span-4">Log a reading</h2>
        <p className="text-ink-muted sm:col-span-2 lg:col-span-4">
          Fill in only what you measured. Your doctor can see this when you share it.
        </p>
        <div className="sm:col-span-2 lg:col-span-4">
          <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
        </div>
        {FIELDS.map((f) => (
          <Field
            key={f.key}
            inputId={ids[f.key]!}
            label={f.label}
            hint={"hint" in f ? f.hint : undefined}
            error={errors[f.key]}
          >
            {({ describedBy, invalid }) => (
              <Input
                id={ids[f.key]}
                value={v[f.key]}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                inputMode="decimal"
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
        ))}
        <Field
          inputId={ids.note!}
          label="Note (optional)"
          error={errors.note}
          className="sm:col-span-2"
        >
          {({ describedBy, invalid }) => (
            <Input
              id={ids.note}
              value={v.note}
              onChange={(e) => setV({ ...v, note: e.target.value })}
              maxLength={200}
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        {errors.form ? (
          <p role="alert" className="text-danger text-sm font-medium sm:col-span-2 lg:col-span-4">
            {errors.form}
          </p>
        ) : null}
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" loading={busy}>
            Save reading
          </Button>
        </div>
      </form>

      <section aria-labelledby="hist-h" className="min-w-0">
        <h2 id="hist-h" className="mb-3 text-xl font-semibold">
          Recent readings
        </h2>
        <div
          role="region"
          aria-label="Recent readings table, scrolls sideways on small screens"
          tabIndex={0}
          className="border-line bg-surface overflow-x-auto rounded-xl border"
        >
          <table className="w-full min-w-[40rem] text-left">
            <caption className="sr-only">Your recent readings, newest first</caption>
            <thead className="bg-primary-tint text-ink-muted text-sm">
              <tr>
                <th scope="col" className="p-3 font-semibold">
                  Date
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Pressure
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Pulse
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Oxygen
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Temp
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Weight
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Sugar
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Note
                </th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="p-3 font-medium whitespace-nowrap">
                    {formatSlotDay(r.date)}
                  </th>
                  <td className="p-3 tabular-nums">
                    {r.sys !== undefined && r.dia !== undefined ? `${r.sys}/${r.dia}` : "–"}
                  </td>
                  <td className="p-3 tabular-nums">{cell(r.pulse)}</td>
                  <td className="p-3 tabular-nums">{cell(r.spo2)}</td>
                  <td className="p-3 tabular-nums">{cell(r.temp)}</td>
                  <td className="p-3 tabular-nums">{cell(r.weight)}</td>
                  <td className="p-3 tabular-nums">{cell(r.sugar)}</td>
                  <td className="text-ink-muted p-3">{r.note ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-muted mt-3 text-sm">
          These numbers are for you and your doctor. We do not diagnose from them.
        </p>
      </section>
    </div>
  );
}
