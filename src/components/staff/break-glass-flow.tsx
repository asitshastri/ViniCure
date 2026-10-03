"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ClockCountdown, ShieldCheck, WarningOctagon } from "@phosphor-icons/react/ssr";
import { ErrorSummary } from "@/components/auth/error-summary";
import { Notice } from "@/components/auth/notice";
import {
  clearBreakGlass,
  formatCountdown,
  saveBreakGlass,
  useBreakGlass,
  useNow,
} from "@/components/staff/break-glass-store";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { getBreakGlassRecord, requestBreakGlass } from "@/lib/data/staff";
import { fieldErrors } from "@/lib/schemas/auth";
import { BREAK_GLASS_CATEGORIES, BREAK_GLASS_MINUTES, breakGlassForm } from "@/lib/schemas/staff";
import type { BreakGlassSession } from "@/lib/types";

type Patient = { id: string; name: string };
type Props = {
  patients: Patient[];
  initialPatient?: string;
  initialTicket?: string;
  /** Prototype states: start with a grant that is about to end, or one that already ended. */
  seed?: "expiring" | "expired";
};

export function BreakGlassFlow({ patients, initialPatient, initialTicket, seed }: Props) {
  const session = useBreakGlass();
  const now = useNow(Boolean(session));
  const seeded = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!seed || seeded.current) return;
    seeded.current = true;
    const p = patients[0]!;
    const t = Date.now();
    saveBreakGlass({
      patientId: initialPatient ?? p.id,
      patientName: patients.find((x) => x.id === (initialPatient ?? p.id))?.name ?? p.name,
      category: "ticket",
      reason: "Prototype: checking why a prescription file will not open for the patient.",
      ticket: initialTicket,
      startedAt: t - 14 * 60_000,
      until: seed === "expired" ? t - 60_000 : t + 15_000,
    });
  }, [seed, patients, initialPatient, initialTicket]);

  const expired = Boolean(session) && session!.until - now <= 0;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        {!session ? "Ask for access" : expired ? "Access ended" : "Health record"}
      </h2>
      {!session ? (
        <RequestForm
          patients={patients}
          initialPatient={initialPatient}
          initialTicket={initialTicket}
        />
      ) : expired ? (
        <Expired session={session} />
      ) : (
        <RecordView session={session} left={session.until - now} />
      )}
    </div>
  );
}

function RequestForm({
  patients,
  initialPatient,
  initialTicket,
}: {
  patients: Patient[];
  initialPatient?: string;
  initialTicket?: string;
}) {
  const uid = useId();
  const ids = {
    patientId: `${uid}-patient`,
    category: `${uid}-category`,
    reason: `${uid}-reason`,
    ticket: `${uid}-ticket`,
    minutes: `${uid}-minutes`,
    password: `${uid}-password`,
    understood: `${uid}-understood`,
  };
  const [v, setV] = useState({
    patientId: initialPatient ?? "",
    category: initialTicket ? "ticket" : "",
    reason: "",
    ticket: initialTicket ?? "",
    minutes: 15,
    password: "",
    understood: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = breakGlassForm.safeParse({ ...v, ticket: v.ticket || undefined });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await requestBreakGlass({
      patientId: parsed.data.patientId,
      minutes: parsed.data.minutes,
      password: parsed.data.password,
    });
    setBusy(false);
    if (res.status === "reauth_failed") {
      setErrors({ password: "That password is not right. Try again." });
      setAttempt((a) => a + 1);
      document.getElementById(ids.password)?.focus();
      return;
    }
    const name = patients.find((p) => p.id === parsed.data.patientId)?.name ?? "Patient";
    saveBreakGlass({
      patientId: parsed.data.patientId,
      patientName: name,
      category: parsed.data.category,
      reason: parsed.data.reason,
      ticket: parsed.data.ticket,
      startedAt: Date.now(),
      until: res.until,
    });
    toast({
      title: "Access granted",
      description: `${parsed.data.minutes} minutes. An admin was alerted.`,
      tone: "success",
    });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void submit(e)}
      className="border-line bg-surface grid max-w-2xl gap-5 rounded-xl border p-5"
    >
      <Notice tone="warning" title="This opens a patient's health record">
        Use it only when you cannot fix the problem without it. Access ends on its own. Everything
        you open is logged with your name and the reason below, and an admin is alerted straight
        away.
      </Notice>
      <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      <Field inputId={ids.patientId} label="Patient" error={errors.patientId} required>
        {({ describedBy, invalid }) => (
          <Select
            id={ids.patientId}
            value={v.patientId}
            onChange={(e) => setV({ ...v, patientId: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <option value="">Choose a patient</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        inputId={ids.category}
        label="Why do you need access?"
        error={errors.category}
        required
      >
        {({ describedBy, invalid }) => (
          <Select
            id={ids.category}
            value={v.category}
            onChange={(e) => setV({ ...v, category: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <option value="">Choose a reason</option>
            {BREAK_GLASS_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        inputId={ids.reason}
        label="Explain what you need to check"
        hint="Do not copy health details into this box. The admin team reads it."
        error={errors.reason}
        required
      >
        {({ describedBy, invalid }) => (
          <Textarea
            id={ids.reason}
            rows={3}
            value={v.reason}
            onChange={(e) => setV({ ...v, reason: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field
        inputId={ids.ticket}
        label="Ticket number"
        hint="Optional, for example T-2039."
        error={errors.ticket}
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.ticket}
            value={v.ticket}
            onChange={(e) => setV({ ...v, ticket: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="max-w-48"
          />
        )}
      </Field>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">How long do you need?</legend>
        <div className="flex flex-wrap gap-x-8 gap-y-2" id={ids.minutes}>
          {BREAK_GLASS_MINUTES.map((m) => (
            <Radio
              key={m}
              name="minutes"
              label={`${m} minutes`}
              checked={v.minutes === m}
              onChange={() => setV({ ...v, minutes: m })}
            />
          ))}
        </div>
        <p className="text-ink-muted text-sm">The longest is 30 minutes. You can ask again.</p>
      </fieldset>
      <Field
        inputId={ids.password}
        label="Your password"
        hint="Asked again because this is a sensitive action."
        error={errors.password}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.password}
            type="password"
            autoComplete="current-password"
            value={v.password}
            onChange={(e) => setV({ ...v, password: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="max-w-xs"
          />
        )}
      </Field>
      <div className="grid gap-1">
        <Checkbox
          id={ids.understood}
          checked={v.understood}
          onChange={(e) => setV({ ...v, understood: e.target.checked })}
          aria-invalid={errors.understood ? true : undefined}
          aria-describedby={errors.understood ? `${ids.understood}-err` : undefined}
          label="I understand that my access is logged and reviewed."
        />
        {errors.understood ? (
          <p id={`${ids.understood}-err`} role="alert" className="text-danger text-sm">
            {errors.understood}
          </p>
        ) : null}
      </div>
      <Button type="submit" loading={busy} className="justify-self-start">
        Open the record
      </Button>
      <p className="text-ink-muted text-sm">Prototype only: any password works except “wrong”.</p>
    </form>
  );
}

function RecordView({ session, left }: { session: BreakGlassSession; left: number }) {
  const record = getBreakGlassRecord(session.patientId);
  const [log, setLog] = useState<Array<{ at: string; text: string }>>([
    { at: clock(session.startedAt), text: "Access granted" },
  ]);
  const [open, setOpen] = useState<string | null>(null);

  function toggle(id: string, title: string) {
    const next = open === id ? null : id;
    setOpen(next);
    if (next)
      setLog((l) => [...l, { at: clock(Date.now()), text: `Opened ${title.toLowerCase()}` }]);
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="bg-record" className="min-w-0">
        <h3 id="bg-record" className="text-xl font-semibold">
          {session.patientName}
        </h3>
        <p className="text-ink-muted mb-4 text-sm">
          Sample record for the prototype. Open a section to read it. Each one is logged.
        </p>
        <ul className="grid gap-2">
          {record.sections.map((s) => (
            <li key={s.id} className="border-line bg-surface rounded-xl border">
              <h4>
                <button
                  type="button"
                  aria-expanded={open === s.id}
                  aria-controls={`bg-${s.id}`}
                  onClick={() => toggle(s.id, s.title)}
                  className="hover:bg-primary-tint flex min-h-12 w-full items-center justify-between rounded-xl px-4 text-left font-semibold"
                >
                  {s.title}
                  <span className="text-ink-muted text-sm font-normal">
                    {open === s.id ? "Hide" : "Open"}
                  </span>
                </button>
              </h4>
              {open === s.id ? (
                <ul id={`bg-${s.id}`} className="grid gap-1 px-4 pb-4">
                  {s.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <div className="grid min-w-0 content-start gap-4">
        <div className="border-line bg-surface rounded-xl border p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <ClockCountdown aria-hidden className="size-5" />
            Time left
          </h3>
          <p className="text-3xl font-semibold tabular-nums" aria-hidden>
            {formatCountdown(left)}
          </p>
          <p className="sr-only">About {Math.ceil(left / 60000)} minutes left.</p>
          <p className="text-ink-muted mt-1 text-sm">
            Reason: {session.reason}
            {session.ticket ? ` (${session.ticket})` : ""}
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={clearBreakGlass}>
            End access now
          </Button>
        </div>
        <div className="border-line bg-surface rounded-xl border p-4">
          <h3 className="font-semibold">Your log for this session</h3>
          <ol className="mt-2 grid gap-1 text-sm">
            {log.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-ink-muted tabular-nums">{l.at}</span>
                {l.text}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Expired({ session }: { session: BreakGlassSession }) {
  return (
    <div className="border-line bg-surface grid max-w-xl gap-3 rounded-xl border p-6">
      <WarningOctagon aria-hidden weight="fill" className="text-danger size-8" />
      <h3 className="text-xl font-semibold">Access to {session.patientName} has ended</h3>
      <p className="text-ink-muted">
        The record is closed and nothing was changed. If you still need it, ask again with a reason.
        Your earlier request stays in the log.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => {
            clearBreakGlass();
          }}
        >
          <ShieldCheck aria-hidden className="size-5" />
          Ask again
        </Button>
        <Link
          href="/staff/queue"
          className="text-primary inline-flex min-h-11 items-center font-semibold underline"
        >
          Back to the queue
        </Link>
      </div>
    </div>
  );
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
