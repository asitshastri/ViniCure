"use client";

import { useState } from "react";
import { FileText, Warning } from "@phosphor-icons/react/ssr";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatSlotDay } from "@/lib/data/doctors";
import type { ConsultContext } from "@/lib/types";

export function PatientPanel({
  ctx,
  part = "all",
  real = false,
}: {
  ctx: ConsultContext;
  part?: "info" | "files" | "all";
  /** A real consultation: what is not recorded yet says so, instead of showing sample data. */
  real?: boolean;
}) {
  const { patient, consult } = ctx;
  const [file, setFile] = useState<ConsultContext["patient"]["files"][number] | null>(null);
  return (
    <div className="grid gap-5">
      {part !== "files" ? (
        <>
          <div className="flex items-center gap-3">
            <Avatar name={patient.name} size="lg" />
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold">{patient.name}</p>
              <p className="text-ink-muted text-sm">
                {patient.ageSex}
                {real ? "." : `. ${consult.kind === "new" ? "New patient" : "Follow-up"}.`}
              </p>
              {patient.attendingAdult ? (
                <p className="text-ink-muted text-sm">With: {patient.attendingAdult}</p>
              ) : null}
            </div>
          </div>

          <section aria-labelledby="cc-h">
            <h3 id="cc-h" className="text-ink-muted text-sm font-semibold">
              Reason for visit
            </h3>
            <p className="mt-1">{consult.reason}</p>
          </section>

          {real ? (
            <section aria-labelledby="hx-h" className="grid gap-1">
              <h3 id="hx-h" className="text-ink-muted text-sm font-semibold">
                Health history and allergies
              </h3>
              <p>Not recorded yet. They will appear here when the patient adds them.</p>
            </section>
          ) : null}

          {real ? null : (
            <>
              <section aria-labelledby="al-h">
                <h3 id="al-h" className="text-ink-muted text-sm font-semibold">
                  Allergies
                </h3>
                {consult.allergies.length ? (
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {consult.allergies.map((a) => (
                      <li key={a}>
                        <Badge tone="danger" icon={<Warning weight="fill" className="size-3.5" />}>
                          {a}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1">None recorded</p>
                )}
              </section>

              <section aria-labelledby="hx-h" className="grid gap-3">
                <h3 id="hx-h" className="text-ink-muted text-sm font-semibold">
                  Health history
                </h3>
                <p>
                  <span className="text-ink-muted">Conditions: </span>
                  {patient.conditions.length ? patient.conditions.join(", ") : "None recorded"}
                </p>
                <p>
                  <span className="text-ink-muted">Takes now: </span>
                  {patient.medicines.length ? patient.medicines.join(", ") : "None recorded"}
                </p>
                {patient.pastVisits.length ? (
                  <ul className="grid gap-2">
                    {patient.pastVisits.map((v) => (
                      <li key={v.date} className="bg-primary-tint rounded-lg p-3 text-sm">
                        <span className="font-semibold">{formatSlotDay(v.date)}.</span> {v.summary}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </>
          )}
        </>
      ) : null}
      {part !== "info" ? (
        <>
          <section aria-labelledby="fl-h">
            <h3 id="fl-h" className="text-ink-muted text-sm font-semibold">
              Files shared with you ({patient.files.length})
            </h3>
            {patient.files.length ? (
              <ul className="divide-line border-line mt-2 divide-y rounded-xl border">
                {patient.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 p-3">
                    <FileText aria-hidden className="text-primary size-6 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{f.title}</p>
                      <p className="text-ink-muted text-sm">
                        {f.type}. Shared {formatSlotDay(f.sharedOn)}.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Open ${f.title}`}
                      onClick={() => setFile(f)}
                    >
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1">No files shared.</p>
            )}
          </section>
          <p className="text-ink-muted text-sm">Opening a file is logged for the patient.</p>
        </>
      ) : null}

      <Dialog
        open={Boolean(file)}
        onClose={() => setFile(null)}
        variant="sheet"
        title={file?.title ?? "File"}
        description={file ? `${file.type}. Preview placeholder, sample data.` : undefined}
        footer={<Button onClick={() => setFile(null)}>Close</Button>}
      >
        <div
          role="img"
          aria-label="Preview placeholder"
          className="bg-primary-soft text-primary flex aspect-[4/3] items-center justify-center rounded-xl text-sm font-medium"
        >
          Preview placeholder
        </div>
      </Dialog>
    </div>
  );
}
