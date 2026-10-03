"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Radio } from "@/components/ui/choice";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/auth/notice";
import { cancelAppointment, refundFor } from "@/lib/data/appointments";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import { formatRupees } from "@/lib/format";
import { CANCEL_REASONS, cancelForm } from "@/lib/schemas/appointments";
import type { AppointmentView } from "@/lib/types";

type Props = {
  appt: AppointmentView | null;
  onClose: () => void;
  onDone: (id: string, refundPaise: number) => void;
};

export function CancelDialog({ appt, onClose, onDone }: Props) {
  const uid = useId();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; note?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function close() {
    if (busy) return;
    setReason("");
    setNote("");
    setErrors({});
    setFailed(false);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!appt) return;
    const parsed = cancelForm.safeParse({ reason, note });
    if (!parsed.success) {
      const next: { reason?: string; note?: string } = {};
      for (const i of parsed.error.issues) next[i.path[0] as "reason" | "note"] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setFailed(false);
    setBusy(true);
    const refundPaise = refundFor(appt);
    const result = await cancelAppointment({ id: appt.id, refundPaise, note });
    setBusy(false);
    if (result.status === "error") {
      setFailed(true);
      return;
    }
    onDone(appt.id, result.refundPaise);
    setReason("");
    setNote("");
  }

  const formId = `${uid}-cancel`;
  const refund = appt ? refundFor(appt) : 0;
  return (
    <Dialog
      open={Boolean(appt)}
      onClose={close}
      dismissible={!busy}
      variant="sheet"
      title="Cancel this appointment?"
      description={
        appt
          ? `${appt.doctorName}, ${formatSlotDay(appt.date)} at ${formatSlotTime(appt.time)} IST`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Keep appointment
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={busy}>
            Cancel appointment
          </Button>
        </>
      }
    >
      {appt ? (
        <form id={formId} noValidate onSubmit={(e) => void submit(e)} className="grid gap-4">
          {failed ? (
            <Notice tone="danger" title="Could not cancel">
              Something went wrong and nothing changed. Try again.
            </Notice>
          ) : null}
          {refund > 0 ? (
            <Notice tone="info" title={`You get ${formatRupees(refund)} back`}>
              Cancelling more than 2 hours ahead is free. The refund reaches you in 5 to 7 working
              days.
            </Notice>
          ) : (
            <Notice tone="warning" title="No refund for a late cancellation">
              This appointment starts in less than 2 hours. Draft policy, pending legal review.
            </Notice>
          )}
          <fieldset className="grid gap-3">
            <legend className="mb-1 font-semibold">Why are you cancelling?</legend>
            {CANCEL_REASONS.map((r) => (
              <Radio
                key={r.id}
                name="reason"
                label={r.label}
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
              />
            ))}
            {errors.reason ? (
              <p role="alert" className="text-danger text-sm">
                {errors.reason}
              </p>
            ) : null}
          </fieldset>
          <Field inputId={`${uid}-note`} label="Anything to add? (optional)" error={errors.note}>
            {({ describedBy, invalid }) => (
              <Textarea
                id={`${uid}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                className="min-h-20"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <p className="text-ink-muted text-sm">
            Prototype: write “simulate error” in the box to see a failed cancel.
          </p>
        </form>
      ) : null}
    </Dialog>
  );
}
