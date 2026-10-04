"use client";

import { useId, useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react/ssr";
import { ErrorSummary } from "@/components/auth/error-summary";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/choice";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveHours } from "@/lib/data/availability-api";
import { hoursBody, SLOT_LENGTHS, type HoursView } from "@/modules/scheduling/availability-schemas";

// A doctor's weekly hours, saved to the server (P4-08). Each day can have up to three time
// windows, for example a morning and an evening session. One consultation length applies to all.

const DAYS = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];
const MAX_WINDOWS = 3;

type Window = { start: string; end: string };
type DayState = { weekday: number; label: string; windows: Window[] };

function toDays(rules: HoursView["rules"]): DayState[] {
  return DAYS.map((d) => ({
    ...d,
    windows: rules
      .filter((r) => r.weekday === d.weekday)
      .map((r) => ({ start: r.startTime, end: r.endTime })),
  }));
}

export function HoursEditor({ initial }: { initial: HoursView["rules"] }) {
  const uid = useId();
  const { toast } = useToast();
  const [days, setDays] = useState(() => toDays(initial));
  const [slot, setSlot] = useState(String(initial[0]?.slotMinutes ?? 30));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const idFor = (weekday: number, i: number) => `${uid}-end-${weekday}-${i}`;

  const setWindows = (weekday: number, f: (w: Window[]) => Window[]) =>
    setDays((l) => l.map((d) => (d.weekday === weekday ? { ...d, windows: f(d.windows) } : d)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFailure(undefined);
    const rules = days.flatMap((d) =>
      d.windows.map((w) => ({
        weekday: d.weekday,
        startTime: w.start,
        endTime: w.end,
        slotMinutes: Number(slot),
      })),
    );
    const parsed = hoursBody.safeParse({ rules });
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const [, index] = issue.path;
        const rule = typeof index === "number" ? rules[index] : undefined;
        if (!rule) continue;
        const day = days.find((d) => d.weekday === rule.weekday);
        const position = day
          ? day.windows.findIndex((w) => w.start === rule.startTime && w.end === rule.endTime)
          : 0;
        found[idFor(rule.weekday, Math.max(0, position))] = `${day?.label}: ${issue.message}`;
      }
      setErrors(found);
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await saveHours(parsed.data.rules);
    setBusy(false);
    if (result.status === "ok") {
      toast({
        tone: "success",
        title: "Hours saved",
        description:
          "Patients see the new times straight away. Booked consultations are not moved.",
      });
    } else {
      setFailure(result.message);
    }
  }

  const fieldIds = Object.fromEntries(Object.keys(errors).map((k) => [k, k]));

  return (
    <form noValidate onSubmit={(e) => void save(e)} className="grid gap-5">
      <ErrorSummary errors={errors} fieldIds={fieldIds} attempt={attempt} />
      <ul className="divide-line border-line divide-y rounded-xl border">
        {days.map((d) => (
          <li key={d.weekday} className="grid gap-3 p-4 sm:grid-cols-[10rem_1fr] sm:items-start">
            <div className="flex items-center gap-3">
              <Switch
                label={`${d.label}: ${d.windows.length ? "open" : "closed"}`}
                checked={d.windows.length > 0}
                onCheckedChange={(on) =>
                  setWindows(d.weekday, () => (on ? [{ start: "09:00", end: "13:00" }] : []))
                }
              />
              <span className="font-semibold">{d.label}</span>
            </div>
            {d.windows.length ? (
              <div className="grid gap-3">
                {d.windows.map((w, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 sm:max-w-lg"
                  >
                    <Field label={i === 0 ? "From" : `From (window ${i + 1})`}>
                      {({ id, describedBy }) => (
                        <Input
                          id={id}
                          type="time"
                          value={w.start}
                          onChange={(e) =>
                            setWindows(d.weekday, (l) =>
                              l.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                            )
                          }
                          aria-describedby={describedBy}
                        />
                      )}
                    </Field>
                    <Field
                      inputId={idFor(d.weekday, i)}
                      label="Until"
                      error={errors[idFor(d.weekday, i)]}
                    >
                      {({ describedBy, invalid }) => (
                        <Input
                          id={idFor(d.weekday, i)}
                          type="time"
                          value={w.end === "24:00" ? "23:59" : w.end}
                          onChange={(e) =>
                            setWindows(d.weekday, (l) =>
                              l.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                            )
                          }
                          aria-describedby={describedBy}
                          aria-invalid={invalid || undefined}
                        />
                      )}
                    </Field>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger mb-1"
                      aria-label={`Remove ${d.label} window ${i + 1}`}
                      onClick={() => setWindows(d.weekday, (l) => l.filter((_, j) => j !== i))}
                    >
                      <Trash aria-hidden className="size-4" />
                    </Button>
                  </div>
                ))}
                {d.windows.length < MAX_WINDOWS ? (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setWindows(d.weekday, (l) => [...l, { start: "16:00", end: "19:00" }])
                      }
                    >
                      <Plus aria-hidden className="size-4" /> Add another time window
                    </Button>
                  </div>
                ) : null}
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
      {failure ? (
        <p role="alert" className="text-danger font-medium">
          {failure}
        </p>
      ) : null}
      <div>
        <Button type="submit" loading={busy}>
          Save hours
        </Button>
      </div>
    </form>
  );
}
