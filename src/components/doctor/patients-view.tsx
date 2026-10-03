"use client";

import { useState } from "react";
import { Warning } from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatSlotDay } from "@/lib/data/doctors";
import type { DoctorPatient } from "@/lib/types";

export function PatientsView({ patients }: { patients: DoctorPatient[] }) {
  const [open, setOpen] = useState<DoctorPatient | null>(null);
  return (
    <>
      <ul className="divide-line border-line bg-surface divide-y overflow-hidden rounded-xl border">
        {patients.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
            <Avatar name={p.name} size="md" />
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-semibold">
                {p.name} <span className="text-ink-muted font-normal">({p.ageSex})</span>
              </p>
              <p className="text-ink-muted text-sm">
                Last visit {formatSlotDay(p.lastVisit)}. {p.visits}{" "}
                {p.visits === 1 ? "visit" : "visits"}.
              </p>
            </div>
            <Badge tone={p.kind === "new" ? "info" : "neutral"}>
              {p.kind === "new" ? "New" : "Follow-up"}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Open summary of ${p.name}`}
              onClick={() => setOpen(p)}
            >
              Summary
            </Button>
          </li>
        ))}
      </ul>
      <Dialog
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        variant="sheet"
        title={open ? `${open.name} (${open.ageSex})` : "Patient"}
        description="You see this because the patient booked you. Access is logged."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Close
            </Button>
            {open ? <ButtonLink href="/doctor/consultations">Open consultations</ButtonLink> : null}
          </>
        }
      >
        {open ? (
          <dl className="grid gap-3">
            <div>
              <dt className="text-ink-muted text-sm">Allergies</dt>
              <dd
                className={
                  open.allergies.length ? "text-danger flex items-center gap-1 font-semibold" : ""
                }
              >
                {open.allergies.length ? (
                  <>
                    <Warning aria-hidden weight="fill" className="size-4" />
                    {open.allergies.join(", ")}
                  </>
                ) : (
                  "None recorded"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted text-sm">Conditions</dt>
              <dd>{open.conditions.length ? open.conditions.join(", ") : "None recorded"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted text-sm">Files shared with you</dt>
              <dd>{open.sharedFiles}</dd>
            </div>
            <div>
              <dt className="text-ink-muted text-sm">Last visit</dt>
              <dd>{formatSlotDay(open.lastVisit)}</dd>
            </div>
          </dl>
        ) : null}
      </Dialog>
    </>
  );
}
