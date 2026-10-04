"use client";

import { useId, useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { addTimeOff, removeTimeOff } from "@/lib/data/availability-api";
import { formatSlotDay } from "@/lib/data/doctors";
import type { TimeOffView } from "@/modules/scheduling/availability-schemas";

/** A doctor's time off, saved to the server (P4-08). Booked consultations are never cancelled by it. */
export function TimeOffReal({ initial }: { initial: TimeOffView[] }) {
  const uid = useId();
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ from: "", to: "", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!v.from) found.from = "Choose the first day.";
    if (!v.to) found.to = "Choose the last day.";
    if (v.from && v.to && v.to < v.from) found.to = "The last day is before the first day.";
    if (Object.keys(found).length) return setErrors(found);
    setErrors({});
    setFailure(undefined);
    setBusy(true);
    const result = await addTimeOff(v);
    setBusy(false);
    if (result.status !== "ok") {
      setFailure(result.message);
      return;
    }
    setItems((l) => [...l, result.item].sort((a, b) => a.from.localeCompare(b.from)));
    setOpen(false);
    setV({ from: "", to: "", reason: "" });
    toast({
      tone: result.affected > 0 ? "info" : "success",
      title: "Time off added",
      description:
        result.affected > 0
          ? `${result.affected} booked ${result.affected === 1 ? "consultation falls" : "consultations fall"} in these days. They are not cancelled: cancel or move them from your appointments.`
          : "Patients cannot book these days.",
    });
  }

  async function remove(item: TimeOffView) {
    const ok = await removeTimeOff(item.id);
    if (ok) setItems((l) => l.filter((x) => x.id !== item.id));
    else
      toast({
        tone: "danger",
        title: "Could not remove",
        description: "Nothing changed. Try again.",
      });
  }

  return (
    <div className="grid gap-4">
      {items.length ? (
        <ul className="divide-line border-line divide-y rounded-xl border">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 p-4">
              <p className="min-w-0 flex-1">
                <span className="font-semibold">
                  {formatSlotDay(t.from)}
                  {t.to !== t.from ? ` to ${formatSlotDay(t.to)}` : ""}
                </span>
                {t.reason ? <span className="text-ink-muted">. {t.reason}</span> : null}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                aria-label={`Remove time off from ${formatSlotDay(t.from)}`}
                onClick={() => void remove(t)}
              >
                <Trash aria-hidden className="size-4" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted border-line-strong rounded-xl border border-dashed p-5">
          No time off planned.
        </p>
      )}
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Plus aria-hidden className="size-5" /> Add time off
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        dismissible={!busy}
        variant="sheet"
        title="Add time off"
        description="Patients cannot book you on these days. Consultations already booked are not moved."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={`${uid}-to`} loading={busy}>
              Add
            </Button>
          </>
        }
      >
        <form id={`${uid}-to`} noValidate onSubmit={(e) => void add(e)} className="grid gap-4">
          <Field inputId={`${uid}-f`} label="First day" error={errors.from} required>
            {({ describedBy, invalid }) => (
              <Input
                id={`${uid}-f`}
                type="date"
                value={v.from}
                onChange={(e) => setV({ ...v, from: e.target.value })}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field inputId={`${uid}-t`} label="Last day" error={errors.to} required>
            {({ describedBy, invalid }) => (
              <Input
                id={`${uid}-t`}
                type="date"
                value={v.to}
                onChange={(e) => setV({ ...v, to: e.target.value })}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field inputId={`${uid}-r`} label="Reason (only you see it)" error={errors.reason}>
            {({ describedBy, invalid }) => (
              <Input
                id={`${uid}-r`}
                value={v.reason}
                onChange={(e) => setV({ ...v, reason: e.target.value })}
                maxLength={80}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          {failure ? (
            <p role="alert" className="text-danger font-medium">
              {failure}
            </p>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}
