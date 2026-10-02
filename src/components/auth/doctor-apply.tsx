"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { submitDoctorApplication } from "@/lib/data/auth";
import { doctorApplyForm, fieldErrors } from "@/lib/schemas/auth";
import { ErrorSummary } from "./error-summary";
import { Notice } from "./notice";

export function DoctorApplyForm() {
  const uid = useId();
  const [values, setValues] = useState({ name: "", email: "", phone: "", registrationNumber: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const ids = {
    name: `${uid}-name`,
    email: `${uid}-email`,
    phone: `${uid}-phone`,
    registrationNumber: `${uid}-reg`,
  };

  function bind(key: keyof typeof values) {
    return {
      value: values[key],
      onChange: (e: { target: { value: string } }) =>
        setValues((v) => ({ ...v, [key]: e.target.value })),
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = doctorApplyForm.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    await submitDoctorApplication();
    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="grid gap-5">
        <Notice tone="info" title="Application received">
          We sent a link to confirm your email. After that you can add your documents. Our team
          checks your registration with the medical council before your profile goes live.
        </Notice>
        <ButtonLink href="/" variant="secondary">
          Back to home
        </ButtonLink>
      </div>
    );
  }
  return (
    <form noValidate className="grid gap-5" onSubmit={(e) => void submit(e)}>
      <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      <Field inputId={ids.name} label="Full name" error={errors.name} required>
        {({ describedBy, invalid }) => (
          <Input
            id={ids.name}
            autoComplete="name"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...bind("name")}
          />
        )}
      </Field>
      <Field
        inputId={ids.email}
        label="Work email"
        hint="We use it to sign you in."
        error={errors.email}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.email}
            type="email"
            autoComplete="email"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...bind("email")}
          />
        )}
      </Field>
      <Field inputId={ids.phone} label="Mobile number" error={errors.phone} required>
        {({ describedBy, invalid }) => (
          <Input
            id={ids.phone}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...bind("phone")}
          />
        )}
      </Field>
      <Field
        inputId={ids.registrationNumber}
        label="Medical council registration number"
        hint="It is shown on your profile and every prescription, and checked before you go live."
        error={errors.registrationNumber}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.registrationNumber}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...bind("registrationNumber")}
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Start application
      </Button>
    </form>
  );
}
