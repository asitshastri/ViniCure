"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { freqText } from "@/lib/data/console";
import { formatSlotDay } from "@/lib/data/doctors";
import type { ConsultContext } from "@/lib/types";
import type { RxState } from "./rx-builder";

type Props = {
  open: boolean;
  onClose: () => void;
  ctx: ConsultContext;
  rx: RxState;
  onSend: () => void;
  sending: boolean;
  sent: boolean;
};

/** What the patient will receive. The doctor’s registration number is always printed on it. */
export function RxPreview({ open, onClose, ctx, rx, onSend, sending, sent }: Props) {
  const { doctor, patient, consult } = ctx;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Prescription preview"
      description="Check everything. The patient sees exactly this."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back to editing
          </Button>
          {!sent ? (
            <Button loading={sending} onClick={onSend}>
              Send to patient
            </Button>
          ) : null}
        </>
      }
    >
      <article
        aria-label="Prescription"
        className="border-line-strong bg-surface grid gap-4 rounded-lg border p-5 text-sm"
      >
        <header className="border-line border-b pb-3">
          <p className="font-display text-lg font-semibold">{doctor.name}</p>
          <p className="text-ink-muted">{doctor.qualifications}</p>
          <p className="font-semibold">
            Registration no. {doctor.registrationNumber}, {doctor.council}
          </p>
        </header>
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-ink-muted">Patient</dt>
            <dd className="font-medium">
              {patient.name} ({patient.ageSex})
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Date</dt>
            <dd className="font-medium">{formatSlotDay(consult.date)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-muted">Diagnosis</dt>
            <dd className="font-medium">{rx.diagnosis || "–"}</dd>
          </div>
          {consult.allergies.length ? (
            <div className="col-span-2">
              <dt className="text-ink-muted">Known allergies</dt>
              <dd className="text-danger font-semibold">{consult.allergies.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
        <div>
          <p className="font-display mb-1 text-base font-semibold">Rx</p>
          <ol className="grid gap-3">
            {rx.lines.map((l) => (
              <li key={l.id} className="border-line border-b pb-2 last:border-b-0">
                <p className="font-semibold">
                  {l.name} {l.strength}
                </p>
                <p>
                  {freqText(l.freq)}.{" "}
                  {l.timing === "before"
                    ? "Before food"
                    : l.timing === "after"
                      ? "After food"
                      : "Any time"}
                  . For {l.days} {l.days === 1 ? "day" : "days"}.
                </p>
                {l.note ? <p className="text-ink-muted">{l.note}</p> : null}
              </li>
            ))}
          </ol>
        </div>
        {rx.advice ? (
          <div>
            <p className="font-semibold">Advice</p>
            <p>{rx.advice}</p>
          </div>
        ) : null}
        <p>
          <span className="font-semibold">Follow-up: </span>
          {rx.followUpDays ? `in ${rx.followUpDays} days` : "not needed"}
        </p>
        <footer className="text-ink-muted border-line border-t pt-3 text-xs">
          Issued after an online consultation on ViniCure. Digital signature and verification code
          are added when sent. Not valid for emergencies.
        </footer>
      </article>
    </Dialog>
  );
}
