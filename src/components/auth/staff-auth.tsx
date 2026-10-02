"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";
import { staffSignIn, verifyBackupCode, verifyTotp } from "@/lib/data/auth";
import { backupCodeSchema, emailSchema, totpSchema } from "@/lib/schemas/auth";
import { AuthCard, DemoHint, Notice } from "./auth-card";
import { formatWait, useCountdown } from "./use-countdown";

type Step = "password" | "totp" | "backup" | "done";

export function StaffAuth() {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [totp, setTotp] = useState("");
  const [backup, setBackup] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockLeft, startLock] = useCountdown();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-auth-heading]")?.focus();
  }, [step]);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const em = emailSchema.safeParse(email);
    const next: Record<string, string> = {};
    if (!em.success) next.email = em.error.issues[0]?.message ?? "";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const res = await staffSignIn(email, password);
    setBusy(false);
    if (res.ok) {
      setStep("totp");
    } else if (res.reason === "locked") {
      startLock(res.retryAfterSeconds ?? 900);
      setFormError("Sign-in is paused after too many attempts.");
    } else {
      // Same message whether the email exists or not.
      setFormError("Email or password is not correct.");
    }
  }

  async function submitTotp(code: string) {
    setFormError(null);
    const parsed = totpSchema.safeParse(code);
    if (!parsed.success) {
      setErrors({ totp: parsed.error.issues[0]?.message ?? "" });
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await verifyTotp(code);
    setBusy(false);
    if (res.ok) setStep("done");
    else {
      setTotp("");
      setFormError("That code is not correct or has expired. Wait for a new code and try again.");
    }
  }

  async function submitBackup(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = backupCodeSchema.safeParse(backup);
    if (!parsed.success) {
      setErrors({ backup: parsed.error.issues[0]?.message ?? "" });
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await verifyBackupCode(backup);
    setBusy(false);
    if (res.ok) setStep("done");
    else setFormError("That backup code is not valid or was already used.");
  }

  if (step === "done") {
    return (
      <div ref={ref}>
        <AuthCard title="You are signed in">
          <p className="text-ink-muted">
            Other devices stay signed in until you sign them out in settings.
          </p>
          <ButtonLink href="/doctor/dashboard" size="lg">
            Continue
          </ButtonLink>
        </AuthCard>
      </div>
    );
  }

  if (step === "totp") {
    return (
      <div ref={ref}>
        <AuthCard
          title="Two-step verification"
          description="Open your authenticator app and enter the 6-digit code for ViniCure."
          footer={
            <button
              type="button"
              className="text-primary min-h-11 font-semibold hover:underline"
              onClick={() => {
                setStep("backup");
                setFormError(null);
                setErrors({});
              }}
            >
              Lost your phone? Use a backup code
            </button>
          }
        >
          {formError ? <Notice>{formError}</Notice> : null}
          <div className="flex flex-col gap-1.5">
            <OtpInput
              value={totp}
              onChange={setTotp}
              onComplete={submitTotp}
              label="Authenticator code"
              invalid={Boolean(errors.totp || formError)}
              disabled={busy}
              describedBy={errors.totp ? "totp-error" : undefined}
            />
            {errors.totp ? (
              <p id="totp-error" role="alert" className="text-danger text-sm">
                {errors.totp}
              </p>
            ) : null}
          </div>
          <Button
            size="lg"
            loading={busy}
            disabled={totp.length < 6}
            onClick={() => submitTotp(totp)}
          >
            Verify
          </Button>
          <DemoHint>the code 123456 works.</DemoHint>
        </AuthCard>
      </div>
    );
  }

  if (step === "backup") {
    return (
      <div ref={ref}>
        <AuthCard
          title="Use a backup code"
          description="Each backup code works once. After signing in, set up your authenticator app again."
          footer={
            <button
              type="button"
              className="text-primary min-h-11 font-semibold hover:underline"
              onClick={() => {
                setStep("totp");
                setFormError(null);
                setErrors({});
              }}
            >
              Back to authenticator code
            </button>
          }
        >
          <form onSubmit={submitBackup} noValidate className="flex flex-col gap-5">
            {formError ? <Notice>{formError}</Notice> : null}
            <Field label="Backup code" required error={errors.backup} hint="Format: ABCD-1234">
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  value={backup}
                  onChange={(e) => setBackup(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={9}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  className="tracking-widest uppercase"
                />
              )}
            </Field>
            <Button type="submit" size="lg" loading={busy}>
              Verify backup code
            </Button>
            <DemoHint>ABCD-1234 works.</DemoHint>
          </form>
        </AuthCard>
      </div>
    );
  }

  return (
    <div ref={ref}>
      <AuthCard
        title="Doctor and staff sign in"
        description="Use your work email. You will also need your authenticator app."
        footer={
          <>
            Patient?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Sign in with your phone
            </Link>
            <br />
            Want to join as a doctor?{" "}
            <Link href="/for-doctors/apply" className="text-primary font-semibold hover:underline">
              Apply here
            </Link>
          </>
        }
      >
        <form onSubmit={submitPassword} noValidate className="flex flex-col gap-5">
          {formError ? (
            <Notice>
              {formError}
              {lockLeft > 0 ? (
                <>
                  {" "}
                  Try again in <span className="tabular-nums">{formatWait(lockLeft)}</span> or{" "}
                  <Link href="/forgot-password" className="underline">
                    reset your password
                  </Link>
                  .
                </>
              ) : null}
            </Notice>
          ) : null}
          <Field label="Email" required error={errors.email}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field label="Password" required error={errors.password}>
            {({ id, describedBy, invalid }) => (
              <div className="relative">
                <Input
                  id={id}
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  className="text-ink-muted absolute inset-y-0 right-0 flex w-11 items-center justify-center"
                >
                  {show ? (
                    <EyeSlash aria-hidden className="size-5" />
                  ) : (
                    <Eye aria-hidden className="size-5" />
                  )}
                </button>
              </div>
            )}
          </Field>
          <Link
            href="/forgot-password"
            className="text-primary -mt-2 inline-flex min-h-11 items-center self-start text-sm font-semibold hover:underline"
          >
            Forgot password?
          </Link>
          <Button type="submit" size="lg" loading={busy} disabled={lockLeft > 0}>
            Continue
          </Button>
          <DemoHint>
            any email and strong password works. Wrong-Password-1! fails, Locked-Account-1! shows a
            lockout.
          </DemoHint>
        </form>
      </AuthCard>
    </div>
  );
}
