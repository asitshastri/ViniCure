"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { changePassword, requestPasswordReset, resetPassword } from "@/lib/data/auth";
import {
  changePasswordSchema,
  emailSchema,
  fieldErrors,
  staffPasswordSchema,
} from "@/lib/schemas/auth";
import { AuthCard, DemoHint, Notice } from "./auth-card";

function PasswordRules() {
  // Rendered inside the Field hint paragraph, so it must be inline.
  return (
    <>At least 12 characters with an uppercase letter, a lowercase letter, a number and a symbol.</>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setBusy(true);
    await requestPasswordReset(email);
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <Notice tone="info">
          If an account exists for that email, we sent a link to reset the password. The link works
          once and expires in 30 minutes.
        </Notice>
        <ButtonLink href="/login/staff" variant="secondary">
          Back to sign in
        </ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="For doctors and staff. Patients sign in with a phone code and have no password."
      footer={
        <Link href="/login/staff" className="text-primary font-semibold hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label="Work email" required error={error}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expired, setExpired] = useState(!token || token === "expired");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = staffPasswordSchema.safeParse(password);
    const next: Record<string, string> = {};
    if (!p.success) next.password = p.error.issues[0]?.message ?? "";
    if (password !== confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const res = await resetPassword(token ?? "", password);
    setBusy(false);
    if (res.ok) setDone(true);
    else setExpired(true);
  }

  if (done) {
    return (
      <AuthCard title="Password updated">
        <p className="text-success flex items-center gap-2 font-medium">
          <CheckCircle aria-hidden weight="fill" className="size-6" /> Done
        </p>
        <p className="text-ink-muted">For your safety, you were signed out of all other devices.</p>
        <ButtonLink href="/login/staff" size="lg">
          Sign in
        </ButtonLink>
      </AuthCard>
    );
  }

  if (expired) {
    return (
      <AuthCard title="This link is not valid">
        <Notice>The reset link has expired or was already used. Request a new one.</Notice>
        <ButtonLink href="/forgot-password" size="lg">
          Request a new link
        </ButtonLink>
        <DemoHint>open /reset-password?token=abc to see the form.</DemoHint>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label="New password" required error={errors.password} hint={<PasswordRules />}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field label="Confirm new password" required error={errors.confirm}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}

export function ChangePasswordForm() {
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed));
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await changePassword(values.current, values.next);
    setBusy(false);
    if (res.ok) setDone(true);
    else setFormError("Your current password is not correct.");
  }

  if (done) {
    return (
      <AuthCard title="Password changed">
        <Notice tone="info">All your other sessions were signed out.</Notice>
        <ButtonLink href="/doctor/dashboard">Back to dashboard</ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Change password" description="You will be signed out of your other devices.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {formError ? <Notice>{formError}</Notice> : null}
        <Field label="Current password" required error={errors.current}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              value={values.current}
              onChange={set("current")}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field label="New password" required error={errors.next} hint={<PasswordRules />}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={values.next}
              onChange={set("next")}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field label="Confirm new password" required error={errors.confirm}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={values.confirm}
              onChange={set("confirm")}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy}>
          Change password
        </Button>
        <DemoHint>Wrong-Password-1! as the current password shows the error.</DemoHint>
      </form>
    </AuthCard>
  );
}
