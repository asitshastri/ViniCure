"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { Notice } from "@/components/auth/notice";
import { cn } from "@/lib/cn";
import { rescheduleAppointment } from "@/lib/data/appointments";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import type { AppointmentView, DoctorSlot } from "@/lib/types";

type Props = {
  appt: AppointmentView | null;
  slots: DoctorSlot[];
  onClose: () => void;
  onDone: (id: string, slot: DoctorSlot) => void;
};

export function RescheduleDialog({ appt, slots, onClose, onDone }: Props) {
  const days = useMemo(() => [...new Set(slots.map((s) => s.date))], [slots]);
  const [day, setDay] = useState<string>("");
  const [slotId, setSlotId] = useState("");
  const [taken, setTaken] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const activeDay = day || days[0] || "";
  const times = slots.filter((s) => s.date === activeDay);

  function close() {
    if (busy) return;
    setError(undefined);
    setSlotId("");
    onClose();
  }

  async function confirm() {
    if (!appt || !slotId) return;
    setBusy(true);
    setError(undefined);
    const result = await rescheduleAppointment({ id: appt.id, slotId });
    setBusy(false);
    if (result.status === "slot_taken") {
      setTaken((t) => [...t, slotId]);
      setSlotId("");
      setError("Someone booked that time while you were choosing. Pick another time.");
      return;
    }
    const slot = slots.find((s) => s.id === slotId);
    if (slot) onDone(appt.id, slot);
    setSlotId("");
  }

  return (
    <Dialog
      open={Boolean(appt)}
      onClose={close}
      dismissible={!busy}
      variant="sheet"
      title="Choose a new time"
      description={
        appt
          ? `${appt.doctorName}. Now: ${formatSlotDay(appt.date)} at ${formatSlotTime(appt.time)} IST.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Keep current time
          </Button>
          <Button onClick={() => void confirm()} loading={busy} disabled={!slotId}>
            Move appointment
          </Button>
        </>
      }
    >
      {error ? (
        <Notice tone="warning" title="That time is gone">
          {error}
        </Notice>
      ) : null}
      <div className="grid gap-4">
        <div>
          <label htmlFor="rs-day" className="mb-1 block text-sm font-medium">
            Day
          </label>
          <Select
            id="rs-day"
            value={activeDay}
            onChange={(e) => {
              setDay(e.target.value);
              setSlotId("");
            }}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {formatSlotDay(d)}
              </option>
            ))}
          </Select>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Time (IST)</legend>
          <div className="flex flex-wrap gap-2">
            {times.map((s) => {
              const gone = taken.includes(s.id);
              return (
                <label key={s.id} className="relative">
                  <input
                    type="radio"
                    name="rs-slot"
                    value={s.id}
                    checked={slotId === s.id}
                    disabled={gone}
                    onChange={() => setSlotId(s.id)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "border-line-strong peer-focus-visible:outline-primary inline-flex min-h-11 min-w-24 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium tabular-nums peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                      slotId === s.id
                        ? "bg-primary border-primary text-white"
                        : "bg-surface text-ink hover:bg-primary-soft",
                      gone && "text-ink-faint cursor-not-allowed line-through opacity-60",
                    )}
                  >
                    {formatSlotTime(s.time)}
                    {gone ? <span className="sr-only"> (taken)</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="text-ink-muted text-sm">
          Moving is free until 2 hours before. You pay nothing extra.
        </p>
      </div>
    </Dialog>
  );
}
