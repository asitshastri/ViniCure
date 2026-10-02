"use client";

import { useId, useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveTimeOff } from "@/lib/data/doctor";
import { formatSlotDay } from "@/lib/data/doctors";
import { timeOffForm } from "@/lib/schemas/doctor";
import type { TimeOff } from "@/lib/types";

export function TimeOffManager({ initial }: { initial: TimeOff[] }) {
  const uid = useId();
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ from: "", to: "", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const p = timeOffForm.safeParse(v);
    if (!p.success) {
      const next: Record<string, string> = {};
      for (const i of p.error.issues) next[String(i.path[0])] ??= i.message;
      return setErrors(next);
    }
    setErrors({});
    setBusy(true);
    await saveTimeOff();
    setBusy(false);
    setItems((l) => [...l, { id: `t-${l.length + 1}-${p.data.from}`, ...p.data }]);
    setOpen(false);
    setV({ from: "", to: "", reason: "" });
    toast({
      tone: "success",
      title: "Time off added",
      description: "Patients cannot book these days.",
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
                onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}
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
        </form>
      </Dialog>
    </div>
  );
}
