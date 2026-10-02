"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ErrorSummary } from "@/components/auth/error-summary";
import { Notice, PrototypeHint } from "@/components/auth/notice";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SUPPORT_TOPICS, submitSupportRequest } from "@/lib/data/support";
import { fieldErrors } from "@/lib/schemas/auth";
import { supportForm } from "@/lib/schemas/support";

export function SupportForm() {
  const uid = useId();
  const [v, setV] = useState({ name: "", contact: "", topic: "", booking: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const ids = {
    name: `${uid}-name`,
    contact: `${uid}-contact`,
    topic: `${uid}-topic`,
    booking: `${uid}-booking`,
    message: `${uid}-message`,
  };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((cur) => ({ ...cur, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFailed(false);
    const parsed = supportForm.safeParse({ ...v, booking: v.booking || undefined });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await submitSupportRequest({ contact: parsed.data.contact });
    setBusy(false);
    if (result.status === "sent") setTicket(result.ticket);
    else setFailed(true);
  }

  if (ticket) {
    return (
      <div className="grid gap-4">
        <Notice tone="info" title="We got your message">
          Your reference is <strong className="tabular-nums">{ticket}</strong>. We reply within
          [number to be confirmed] working hours, using the contact you gave us.
        </Notice>
        <Button
          variant="secondary"
          className="justify-self-start"
          onClick={() => {
            setTicket(null);
            setV({ name: "", contact: "", topic: "", booking: "", message: "" });
          }}
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-5">
      <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      {failed ? (
        <Notice tone="danger" title="Your message was not sent">
          Something went wrong on our side. Your text is still here. Try again in a minute, or call
          the helpline.
        </Notice>
      ) : null}
      <Notice tone="info" title="Please do not share medical details here">
        This form is for help with the service. To discuss your health, book a consultation. For
        emergencies call 112.
      </Notice>
      <Field inputId={ids.name} label="Your name" error={errors.name} required>
        {({ describedBy, invalid }) => (
          <Input
            id={ids.name}
            value={v.name}
            onChange={set("name")}
            autoComplete="name"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field
        inputId={ids.contact}
        label="Email or mobile number"
        hint="We use it only to reply to you."
        error={errors.contact}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.contact}
            value={v.contact}
            onChange={set("contact")}
            autoComplete="email"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field inputId={ids.topic} label="What is this about?" error={errors.topic} required>
        {({ describedBy, invalid }) => (
          <Select
            id={ids.topic}
            value={v.topic}
            onChange={set("topic")}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <option value="">Choose</option>
            {SUPPORT_TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        inputId={ids.booking}
        label="Booking number (if you have one)"
        hint="For example VC-2026-004217"
        error={errors.booking}
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.booking}
            value={v.booking}
            onChange={set("booking")}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field inputId={ids.message} label="How can we help?" error={errors.message} required>
        {({ describedBy, invalid }) => (
          <Textarea
            id={ids.message}
            value={v.message}
            onChange={set("message")}
            maxLength={1000}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Send message
      </Button>
      <p className="text-ink-muted text-sm">
        By sending this you agree to our{" "}
        <Link href="/privacy-policy" className="text-primary underline">
          privacy policy
        </Link>
        .
      </p>
      <PrototypeHint>
        <p>An email starting with “error@” shows the send-failed state.</p>
      </PrototypeHint>
    </form>
  );
}
