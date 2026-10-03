"use client";

import { useId, useState } from "react";
import { Eye, PaperPlaneTilt, Trash, Warning } from "@phosphor-icons/react/ssr";
import { Notice } from "@/components/auth/notice";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { allergyConflicts } from "@/lib/data/console";
import { rxForm } from "@/lib/schemas/console";
import type { Medicine, RxLine } from "@/lib/types";
import { mockMedicines } from "@/mocks/console";
import { MedicineSearch } from "./medicine-search";

export type RxState = { diagnosis: string; advice: string; followUpDays: number; lines: RxLine[] };
type Props = {
  allergies: string[];
  value: RxState;
  onChange: (v: RxState) => void;
  onPreview: () => void;
  sent: boolean;
  onSend: () => void;
  sending: boolean;
};

const PRESETS: Array<{ label: string; freq: RxLine["freq"]; timing: RxLine["timing"] }> = [
  {
    label: "Twice a day, after food",
    freq: { morning: true, afternoon: false, night: true, sos: false },
    timing: "after",
  },
  {
    label: "Night, after food",
    freq: { morning: false, afternoon: false, night: true, sos: false },
    timing: "after",
  },
  {
    label: "When needed",
    freq: { morning: false, afternoon: false, night: false, sos: true },
    timing: "any",
  },
];

function Toggle({
  on,
  label,
  onClick,
  disabled,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-60",
        on
          ? "border-primary bg-primary text-white"
          : "border-line-strong bg-surface hover:bg-primary-soft",
      )}
    >
      {label}
    </button>
  );
}

export function RxBuilder({ allergies, value, onChange, onPreview, sent, onSend, sending }: Props) {
  const uid = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warn, setWarn] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const set = (patch: Partial<RxState>) => onChange({ ...value, ...patch });

  function add(m: Medicine) {
    setBlocked(null);
    if (m.restricted) {
      setBlocked(
        `${m.name} is restricted for online prescribing. Ask the patient to visit in person. [Exact rules to be confirmed.]`,
      );
      return;
    }
    const conflict = allergyConflicts(m, allergies);
    setWarn(
      conflict.length
        ? `Allergy alert: the patient is allergic to ${conflict.join(", ")}. ${m.name} may not be safe. Check before you continue.`
        : null,
    );
    const line: RxLine = {
      id: `rx-${Date.now()}-${m.id}`,
      medicineId: m.id,
      name: m.name,
      strength: m.strengths[0] ?? "",
      freq: { morning: false, afternoon: false, night: false, sos: false },
      timing: "after",
      days: 5,
      note: "",
    };
    set({ lines: [...value.lines, line] });
  }

  const update = (id: string, patch: Partial<RxLine>) =>
    set({ lines: value.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  function validate(): boolean {
    const found: Record<string, string> = {};
    const parsed = rxForm.safeParse(value);
    if (!parsed.success)
      for (const i of parsed.error.issues) found[String(i.path[0])] ??= i.message;
    value.lines.forEach((l) => {
      if (!(l.freq.morning || l.freq.afternoon || l.freq.night || l.freq.sos))
        found[l.id] = `${l.name}: choose when to take it.`;
      else if (!(l.days >= 1 && l.days <= 90)) found[l.id] = `${l.name}: enter 1 to 90 days.`;
    });
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  const locked = sent;
  return (
    <div className="grid gap-5">
      {locked ? (
        <Notice tone="info" title="Prescription sent">
          The patient has it in their records. You can still add notes.
        </Notice>
      ) : null}
      <Field
        inputId={`${uid}-dx`}
        label="Diagnosis or main problem"
        error={errors.diagnosis}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={`${uid}-dx`}
            value={value.diagnosis}
            disabled={locked}
            onChange={(e) => set({ diagnosis: e.target.value })}
            maxLength={160}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>

      {!locked ? <MedicineSearch onPick={add} /> : null}
      {blocked ? (
        <Notice tone="danger" title="Cannot be prescribed online">
          {blocked}
        </Notice>
      ) : null}
      {warn ? (
        <div
          role="alert"
          className="bg-danger-soft text-danger flex gap-2 rounded-xl p-3 font-medium"
        >
          <Warning aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0" />
          {warn}
        </div>
      ) : null}
      {errors.lines ? (
        <p role="alert" className="text-danger text-sm font-medium">
          {errors.lines}
        </p>
      ) : null}

      {value.lines.length ? (
        <ul className="grid gap-3" aria-label="Medicines on this prescription">
          {value.lines.map((l) => {
            const med = mockMedicines.find((m) => m.id === l.medicineId);
            return (
              <li key={l.id} className="border-line bg-surface rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{l.name}</p>
                  {!locked ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      aria-label={`Remove ${l.name}`}
                      onClick={() => set({ lines: value.lines.filter((x) => x.id !== l.id) })}
                    >
                      <Trash aria-hidden className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3">
                  <div>
                    <label htmlFor={`${l.id}-s`} className="mb-1 block text-sm font-medium">
                      Strength
                    </label>
                    <Select
                      id={`${l.id}-s`}
                      value={l.strength}
                      disabled={locked}
                      onChange={(e) => update(l.id, { strength: e.target.value })}
                    >
                      {(med?.strengths ?? [l.strength]).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </div>
                  <fieldset>
                    <legend className="mb-1 text-sm font-medium">When</legend>
                    <div className="flex flex-wrap gap-2">
                      <Toggle
                        on={l.freq.morning}
                        label="Morning"
                        disabled={locked}
                        onClick={() =>
                          update(l.id, { freq: { ...l.freq, morning: !l.freq.morning } })
                        }
                      />
                      <Toggle
                        on={l.freq.afternoon}
                        label="Afternoon"
                        disabled={locked}
                        onClick={() =>
                          update(l.id, { freq: { ...l.freq, afternoon: !l.freq.afternoon } })
                        }
                      />
                      <Toggle
                        on={l.freq.night}
                        label="Night"
                        disabled={locked}
                        onClick={() => update(l.id, { freq: { ...l.freq, night: !l.freq.night } })}
                      />
                      <Toggle
                        on={l.freq.sos}
                        label="When needed"
                        disabled={locked}
                        onClick={() => update(l.id, { freq: { ...l.freq, sos: !l.freq.sos } })}
                      />
                    </div>
                  </fieldset>
                  {!locked ? (
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label={`Quick settings for ${l.name}`}
                    >
                      {PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => update(l.id, { freq: p.freq, timing: p.timing })}
                          className="bg-primary-soft text-primary min-h-11 rounded-full px-3 text-sm font-medium"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor={`${l.id}-t`} className="mb-1 block text-sm font-medium">
                        With food
                      </label>
                      <Select
                        id={`${l.id}-t`}
                        value={l.timing}
                        disabled={locked}
                        onChange={(e) =>
                          update(l.id, { timing: e.target.value as RxLine["timing"] })
                        }
                      >
                        <option value="before">Before food</option>
                        <option value="after">After food</option>
                        <option value="any">Any time</option>
                      </Select>
                    </div>
                    <div>
                      <label htmlFor={`${l.id}-d`} className="mb-1 block text-sm font-medium">
                        Days
                      </label>
                      <Input
                        id={`${l.id}-d`}
                        type="number"
                        min={1}
                        max={90}
                        inputMode="numeric"
                        value={l.days}
                        disabled={locked}
                        onChange={(e) => update(l.id, { days: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`${l.id}-n`} className="mb-1 block text-sm font-medium">
                      Instruction (optional)
                    </label>
                    <Input
                      id={`${l.id}-n`}
                      value={l.note}
                      disabled={locked}
                      maxLength={120}
                      onChange={(e) => update(l.id, { note: e.target.value })}
                    />
                  </div>
                  {errors[l.id] ? (
                    <p role="alert" className="text-danger text-sm font-medium">
                      {errors[l.id]}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-muted border-line-strong rounded-xl border border-dashed p-5">
          No medicines yet. Search above to add one.
        </p>
      )}

      <Field inputId={`${uid}-adv`} label="Advice for the patient" error={errors.advice}>
        {({ describedBy, invalid }) => (
          <Textarea
            id={`${uid}-adv`}
            value={value.advice}
            disabled={locked}
            onChange={(e) => set({ advice: e.target.value })}
            maxLength={500}
            className="min-h-24"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field inputId={`${uid}-fu`} label="Follow-up">
        {({ describedBy }) => (
          <Select
            id={`${uid}-fu`}
            value={String(value.followUpDays)}
            disabled={locked}
            onChange={(e) => set({ followUpDays: Number(e.target.value) })}
            aria-describedby={describedBy}
          >
            <option value="0">No follow-up needed</option>
            <option value="3">In 3 days</option>
            <option value="7">In 7 days</option>
            <option value="14">In 2 weeks</option>
            <option value="30">In a month</option>
          </Select>
        )}
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => validate() && onPreview()}>
          <Eye aria-hidden className="size-5" /> Preview
        </Button>
        {!locked ? (
          <Button loading={sending} onClick={() => validate() && onSend()}>
            <PaperPlaneTilt aria-hidden className="size-5" /> Send to patient
          </Button>
        ) : null}
      </div>
    </div>
  );
}
