"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Radio } from "@/components/ui/choice";
import { Dialog } from "@/components/ui/dialog";
import { shareRecord } from "@/lib/data/records";
import { shareForm } from "@/lib/schemas/records";
import type { HealthRecord, ShareTarget } from "@/lib/types";

const DURATIONS = [
  { id: "consult", label: "Until the end of the consultation", days: 1 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
] as const;

type Props = {
  record: HealthRecord | null;
  targets: ShareTarget[];
  onClose: () => void;
  onDone: (id: string, target: ShareTarget, days: number) => void;
};

export function ShareDialog({ record, targets, onClose, onDone }: Props) {
  const [doctorId, setDoctorId] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setError(undefined);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!record) return;
    const parsed = shareForm.safeParse({ doctorId, duration });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setBusy(true);
    await shareRecord();
    setBusy(false);
    const target = targets.find((t) => t.doctorId === doctorId);
    const days = DURATIONS.find((d) => d.id === duration)?.days ?? 1;
    if (target) onDone(record.id, target, days);
    setDoctorId("");
    setDuration("");
  }

  return (
    <Dialog
      open={Boolean(record)}
      onClose={close}
      dismissible={!busy}
      variant="sheet"
      title="Share with a doctor"
      description={
        record
          ? `“${record.title}” will be visible to the doctor you choose, and only for the time you choose.`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="share-form" loading={busy}>
            Share
          </Button>
        </>
      }
    >
      <form id="share-form" noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
        <fieldset className="grid gap-3">
          <legend className="mb-1 font-semibold">Which doctor?</legend>
          {targets.map((t) => (
            <Radio
              key={t.doctorId}
              name="doctor"
              label={t.doctorName}
              description={`${t.specialty}. ${t.reason}.`}
              checked={doctorId === t.doctorId}
              onChange={() => setDoctorId(t.doctorId)}
            />
          ))}
        </fieldset>
        <fieldset className="grid gap-3">
          <legend className="mb-1 font-semibold">For how long?</legend>
          {DURATIONS.map((d) => (
            <Radio
              key={d.id}
              name="duration"
              label={d.label}
              checked={duration === d.id}
              onChange={() => setDuration(d.id)}
            />
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="text-danger text-sm font-medium">
            {error}
          </p>
        ) : null}
        <p className="text-ink-muted text-sm">
          You can stop sharing at any time. We record who opens your files.
        </p>
      </form>
    </Dialog>
  );
}
