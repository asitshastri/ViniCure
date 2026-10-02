"use client";

import { useState } from "react";
import { FileText, ShieldCheck } from "@phosphor-icons/react/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { decideKyc } from "@/lib/data/admin";
import type { KycItem } from "@/lib/types";

const tone: Record<KycItem["status"], BadgeTone> = {
  pending: "warning",
  changes_needed: "info",
  approved: "success",
  rejected: "danger",
};
const label: Record<KycItem["status"], string> = {
  pending: "Waiting for review",
  changes_needed: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
};

export function KycBoard({ items }: { items: KycItem[] }) {
  const [list, setList] = useState(items);
  const [openId, setOpenId] = useState<string | null>(null);
  const current = list.find((k) => k.id === openId) ?? null;
  const { toast } = useToast();

  async function decide(id: string, decision: "approve" | "changes" | "reject", note?: string) {
    await decideKyc();
    const status =
      decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_needed";
    setList((l) => l.map((k) => (k.id === id ? { ...k, status, note } : k)));
    setOpenId(null);
    toast({
      title:
        status === "approved"
          ? "Doctor approved"
          : status === "rejected"
            ? "Application rejected"
            : "Changes requested",
      description: "Recorded in the audit log.",
      tone: status === "approved" ? "success" : "info",
    });
  }

  return (
    <>
      <ul className="grid min-w-0 gap-3 md:grid-cols-2">
        {list.map((k) => (
          <li
            key={k.id}
            className="border-line bg-surface flex min-w-0 flex-col gap-3 rounded-xl border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{k.name}</h2>
                <p className="text-ink-muted text-sm">
                  {k.specialty}. Submitted {k.submitted}
                </p>
              </div>
              <Badge tone={tone[k.status]}>{label[k.status]}</Badge>
            </div>
            <p className="text-sm">
              <span className="text-ink-muted">Registration: </span>
              {k.registrationNumber}
            </p>
            {k.note ? <p className="text-ink-muted text-sm">Note sent: {k.note}</p> : null}
            <Button
              variant={k.status === "pending" ? "primary" : "secondary"}
              size="sm"
              className="self-start"
              onClick={() => setOpenId(k.id)}
            >
              {k.status === "pending" ? "Review" : "View"}
              <span className="sr-only"> {k.name}</span>
            </Button>
          </li>
        ))}
      </ul>
      {current ? (
        <ReviewDialog
          key={current.id}
          item={current}
          onClose={() => setOpenId(null)}
          onDecide={(d, note) => decide(current.id, d, note)}
        />
      ) : null}
    </>
  );
}

function ReviewDialog({
  item,
  onClose,
  onDecide,
}: {
  item: KycItem;
  onClose: () => void;
  onDecide: (d: "approve" | "changes" | "reject", note?: string) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState<"changes" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const done = item.status !== "pending";
  const { toast } = useToast();

  async function go(d: "approve" | "changes" | "reject", note?: string) {
    setBusy(true);
    await onDecide(d, note);
    setBusy(false);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={item.name}
      description={`${item.specialty}. ${item.council}`}
      footer={
        done ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : mode ? (
          <>
            <Button variant="ghost" onClick={() => setMode(null)} disabled={busy}>
              Back
            </Button>
            <Button
              variant={mode === "reject" ? "danger" : "primary"}
              loading={busy}
              onClick={() => {
                if (reason.trim().length < 10) {
                  setErr("Write a reason of at least 10 characters. The doctor will see it.");
                  return;
                }
                void go(mode, reason.trim());
              }}
            >
              {mode === "reject" ? "Reject application" : "Send request"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setMode("changes")}>
              Ask for changes
            </Button>
            <Button variant="danger" onClick={() => setMode("reject")}>
              Reject
            </Button>
            <Button disabled={!confirmed} loading={busy} onClick={() => void go("approve")}>
              Approve doctor
            </Button>
          </>
        )
      }
    >
      {mode ? (
        <Field
          label={mode === "reject" ? "Reason for rejecting" : "What needs to change"}
          error={err}
          required
        >
          {(p) => (
            <Textarea
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              rows={4}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setErr(undefined);
              }}
            />
          )}
        </Field>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid gap-1 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-ink-muted">Registration number</dt>
              <dd className="font-medium">{item.registrationNumber}</dd>
            </div>
            {item.qualifications.map((q) => (
              <div key={q}>
                <dt className="sr-only">Qualification</dt>
                <dd>{q}</dd>
              </div>
            ))}
          </dl>
          <section aria-labelledby={`docs-${item.id}`}>
            <h3 id={`docs-${item.id}`} className="mb-2 text-sm font-semibold">
              Documents
            </h3>
            <ul className="flex flex-col gap-2">
              {item.docs.map((d) => (
                <li
                  key={d.label}
                  className="border-line flex items-center justify-between gap-3 rounded-lg border p-2 pl-3"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <FileText aria-hidden className="text-ink-muted size-4" />
                    {d.label}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      toast({
                        title: "Opening in a private window",
                        description: `${d.label} access is logged against your name.`,
                      })
                    }
                  >
                    Open<span className="sr-only"> {d.label}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          {!done ? (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="accent-primary mt-0.5 size-5 shrink-0"
              />
              <span>
                I checked this registration number with the {item.council} and it matches.
              </span>
            </label>
          ) : (
            <p className="text-ink-muted flex items-center gap-2 text-sm">
              <ShieldCheck aria-hidden className="size-4" />
              Decision recorded: {label[item.status]}.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
