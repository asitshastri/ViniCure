"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatRupees } from "@/lib/format";
import { formatSlotDay, formatSlotTime } from "@/lib/data/doctors";
import type { ConsultMode, DoctorProfile, DoctorSlot } from "@/lib/types";
import { feeFor, MODE_LABEL } from "./summary-card";

type Props = {
  doctor: DoctorProfile;
  slot: DoctorSlot;
  mode: ConsultMode;
  forWhom: string;
  reason: string;
  onEdit: (step: 0 | 1) => void;
  onPay: () => void;
};

export function ReviewStep({ doctor, slot, mode, forWhom, reason, onEdit, onPay }: Props) {
  const fee = feeFor(doctor, mode);
  const rows: Array<{ label: string; value: string; edit: 0 | 1 }> = [
    { label: "Doctor", value: `${doctor.name}, Reg. ${doctor.registrationNumber}`, edit: 0 },
    {
      label: "When",
      value: `${formatSlotDay(slot.date)}, ${formatSlotTime(slot.time)} IST`,
      edit: 0,
    },
    { label: "Type", value: MODE_LABEL[mode], edit: 0 },
    { label: "For", value: forWhom, edit: 1 },
    { label: "Reason", value: reason, edit: 1 },
  ];
  return (
    <div className="grid gap-6">
      <Card className="p-0">
        <ul className="divide-line divide-y">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-ink-muted text-sm">{r.label}</p>
                <p className="font-medium break-words">{r.value}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(r.edit)}
                aria-label={`Change ${r.label.toLowerCase()}`}
              >
                Change
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="grid gap-2">
        <p className="flex justify-between">
          <span>Consultation fee</span>
          <span className="tabular-nums">{formatRupees(fee)}</span>
        </p>
        <p className="font-display border-line flex justify-between border-t pt-3 text-xl font-semibold">
          <span>Total to pay</span>
          <span className="tabular-nums">{formatRupees(fee)}</span>
        </p>
        <p className="text-ink-muted text-sm">
          Tax and invoice details are added after payment. Wording pending confirmation.
        </p>
      </Card>

      <section aria-labelledby="refund-heading" className="text-ink-muted text-sm">
        <h2 id="refund-heading" className="text-ink text-base font-semibold">
          Cancelling
        </h2>
        <p className="mt-1">
          Cancel free of charge up to 2 hours before your time. If the doctor cannot attend, you get
          a full refund. Draft policy, pending legal review.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="lg" onClick={() => onEdit(1)}>
          Back
        </Button>
        <Button size="lg" onClick={onPay}>
          Pay {formatRupees(fee)}
        </Button>
      </div>
    </div>
  );
}
