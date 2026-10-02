"use client";

import { useMemo, useState } from "react";
import { PhoneCall, VideoCamera, ArrowsClockwise } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/format";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import type { ConsultMode, DoctorProfile } from "@/lib/types";

type Props = {
  doctor: DoctorProfile;
  slotId: string | undefined;
  mode: ConsultMode;
  busy: boolean;
  error?: string | undefined;
  onSlot: (id: string) => void;
  onMode: (mode: ConsultMode) => void;
  onContinue: () => void;
};

const chip =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary";

export function SlotStep({ doctor, slotId, mode, busy, error, onSlot, onMode, onContinue }: Props) {
  const days = useMemo(() => {
    const map = new Map<string, typeof doctor.slots>();
    for (const s of doctor.slots) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return [...map.entries()];
  }, [doctor]);
  const selected = doctor.slots.find((s) => s.id === slotId);
  const [day, setDay] = useState(selected?.date ?? days[0]?.[0]);
  const times = days.find(([d]) => d === day)?.[1] ?? [];

  const modes: Array<{
    id: ConsultMode;
    label: string;
    icon: typeof VideoCamera;
    fee: number;
    disabled?: string;
  }> = [
    { id: "video", label: "Video", icon: VideoCamera, fee: doctor.feePaise },
    { id: "audio", label: "Audio", icon: PhoneCall, fee: doctor.audioFeePaise },
    {
      id: "followup",
      label: "Follow-up",
      icon: ArrowsClockwise,
      fee: doctor.followUpFeePaise,
      disabled: "Available after a first consultation with this doctor",
    },
  ];

  return (
    <div className="grid gap-8">
      <fieldset>
        <legend className="mb-3 text-lg font-semibold">How do you want to talk?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {modes.map(({ id, label, icon: Icon, fee, disabled }) => (
            <label key={id} className={cn("relative block", disabled && "opacity-60")}>
              <input
                type="radio"
                name="mode"
                value={id}
                checked={mode === id}
                disabled={Boolean(disabled)}
                onChange={() => onMode(id)}
                className="peer sr-only"
                aria-describedby={disabled ? `mode-${id}-note` : undefined}
              />
              <span
                className={cn(
                  "border-line-strong bg-surface peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-primary flex min-h-20 cursor-pointer flex-col gap-1 rounded-xl border p-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:cursor-not-allowed",
                )}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Icon aria-hidden className="text-primary size-5" />
                  {label}
                </span>
                <span className="font-display text-lg font-semibold tabular-nums">
                  {formatRupees(fee)}
                </span>
              </span>
              {disabled ? (
                <span id={`mode-${id}-note`} className="text-ink-muted mt-1 block text-sm">
                  {disabled}
                </span>
              ) : null}
            </label>
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="day-heading">
        <h2 id="day-heading" className="mb-3 text-lg font-semibold">
          Pick a day
        </h2>
        <div role="radiogroup" aria-labelledby="day-heading" className="flex flex-wrap gap-2">
          {days.map(([date, list]) => (
            <label key={date} className="relative">
              <input
                type="radio"
                name="day"
                value={date}
                checked={day === date}
                onChange={() => setDay(date)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  chip,
                  "border-line-strong cursor-pointer",
                  day === date
                    ? "bg-primary border-primary text-white"
                    : "bg-surface text-ink hover:bg-primary-soft",
                )}
              >
                {formatSlotDay(date)}
                <span className="sr-only">, {list.length} times free</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <fieldset>
        <legend className="mb-3 text-lg font-semibold">
          Pick a time{" "}
          <span className="text-ink-muted text-sm font-normal">(Indian Standard Time)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {times.map((s) => (
            <label key={s.id} className="relative">
              <input
                type="radio"
                name="slot"
                value={s.id}
                checked={slotId === s.id}
                onChange={() => onSlot(s.id)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  chip,
                  "border-line-strong min-w-24 cursor-pointer",
                  slotId === s.id
                    ? "bg-primary border-primary text-white"
                    : "bg-surface text-ink hover:bg-primary-soft",
                )}
              >
                {formatSlotTime(s.time)}
              </span>
            </label>
          ))}
        </div>
        {error ? (
          <p role="alert" className="text-danger mt-3 text-sm font-medium">
            {error}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" loading={busy} disabled={!slotId} onClick={onContinue}>
          Continue
        </Button>
        {!slotId ? <p className="text-ink-muted text-sm">Choose a time to continue.</p> : null}
      </div>
    </div>
  );
}
