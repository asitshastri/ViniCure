"use client";

import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Table, TBody, THead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { decideRefund } from "@/lib/data/admin";
import { formatRupees } from "@/lib/format";
import type { RefundRequest } from "@/lib/types";

const tone: Record<RefundRequest["status"], BadgeTone> = {
  pending: "warning",
  approved: "success",
  declined: "neutral",
};
const label: Record<RefundRequest["status"], string> = {
  pending: "Waiting",
  approved: "Refunded",
  declined: "Declined",
};

export function RefundQueue({ items }: { items: RefundRequest[] }) {
  const [list, setList] = useState(items);
  const [target, setTarget] = useState<{
    r: RefundRequest;
    decision: "approve" | "decline";
  } | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  function close() {
    setTarget(null);
    setPassword("");
    setError(undefined);
  }

  async function confirm() {
    if (!target) return;
    if (!password) {
      setError("Enter your password to continue.");
      return;
    }
    setBusy(true);
    const res = await decideRefund({ id: target.r.id, decision: target.decision, password });
    setBusy(false);
    if (res.status === "reauth_failed") {
      setError("That password is not right. Try again.");
      return;
    }
    const status = target.decision === "approve" ? "approved" : "declined";
    setList((l) => l.map((x) => (x.id === target.r.id ? { ...x, status } : x)));
    toast({
      title: status === "approved" ? "Refund approved" : "Refund declined",
      description: `${formatRupees(target.r.amountPaise)} for ${target.r.appointment}. Recorded in the audit log.`,
      tone: "success",
    });
    close();
  }

  return (
    <>
      <Table>
        <caption className="sr-only">Refund requests</caption>
        <THead>
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Booking
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Patient
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              Amount
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Reason
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Action
            </th>
          </tr>
        </THead>
        <TBody>
          {list.map((r) => (
            <Tr key={r.id}>
              <th scope="row" className="px-4 py-3 font-medium">
                {r.appointment}
              </th>
              <td className="px-4 py-3">{r.patient}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatRupees(r.amountPaise)}</td>
              <td className="px-4 py-3">{r.reason}</td>
              <td className="px-4 py-3">
                <Badge tone={tone[r.status]}>{label[r.status]}</Badge>
              </td>
              <td className="px-4 py-3">
                {r.status === "pending" ? (
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => setTarget({ r, decision: "approve" })}>
                      Approve<span className="sr-only"> refund {r.appointment}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setTarget({ r, decision: "decline" })}
                    >
                      Decline<span className="sr-only"> refund {r.appointment}</span>
                    </Button>
                  </span>
                ) : (
                  <span className="text-ink-muted">Done</span>
                )}
              </td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {target ? (
        <Dialog
          open
          onClose={close}
          title={target.decision === "approve" ? "Approve this refund?" : "Decline this refund?"}
          description={`${formatRupees(target.r.amountPaise)} for ${target.r.patient}, booking ${target.r.appointment}. Enter your password to confirm.`}
          footer={
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant={target.decision === "approve" ? "primary" : "danger"}
                loading={busy}
                onClick={() => void confirm()}
              >
                {target.decision === "approve" ? "Approve refund" : "Decline refund"}
              </Button>
            </>
          }
        >
          <Field label="Your password" error={error} required>
            {(p) => (
              <Input
                id={p.id}
                type="password"
                autoComplete="current-password"
                aria-describedby={p.describedBy}
                aria-invalid={p.invalid}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(undefined);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirm();
                }}
              />
            )}
          </Field>
        </Dialog>
      ) : null}
    </>
  );
}
