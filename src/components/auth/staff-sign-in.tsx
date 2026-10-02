"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";
import {
  signInStaff,
  verifyStaffBackupCode,
  verifyStaffTotp,
  type StaffCodeResult,
} from "@/lib/data/auth";
import { backupCodeSchema, fieldErrors, otpSchema, staffSignInForm } from "@/lib/schemas/auth";
import { MOCK_BACKUP, MOCK_CODES, MOCK_STAFF } from "@/mocks/auth";
import { ErrorSummary } from "./error-summary";
import { Notice, PrototypeHint } from "./notice";
import { PasswordField } from "./password-field";

type Step = "credentials" | "totp" | "backup" | "done";

export function StaffSignIn() {
  const router = useRouter();
  const uid = useId();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [otpKey, setOtpKey] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [lockedMinutes, setLockedMinutes] = useState<number | null>(null);

  const ids = { email: `${uid}-email`, password: `${uid}-password` };

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    const parsed = staffSignInForm.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    const result = await signInStaff(parsed.data.email, parsed.data.password);
    setBusy(false);
    if (result.status === "locked") setLockedMinutes(result.retryInMinutes);
    else if (result.status === "invalid") {
      setPassword("");
      // One message for every kind of failure, so it never reveals which accounts exist.
      setFailure("The email or password is not correct. Check both and try again.");
    } else setStep("totp");
  }

  function handleCodeResult(result: StaffCodeResult) {
    if (result.status === "ok") {
      setStep("done");
      router.push(result.redirectTo);
    } else if (result.status === "locked") {
      setLockedMinutes(result.retryInMinutes);
    } else {
      setCode("");
      setOtpKey((k) => k + 1);
      setFailure(
        step === "backup"
          ? "That backup code is not valid or was already used."
          : "That code is not correct. Wait for the next code in your app and try again.",
      );
    }
  }

  async function submitTotp(value: string) {
    const parsed = otpSchema.safeParse(value);
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? "Enter the 6-digit code.");
      return;
    }
    setFailure(null);
    setBusy(true);
    handleCodeResult(await verifyStaffTotp(parsed.data));
    setBusy(false);
  }

  async function submitBackup(e: FormEvent) {
    e.preventDefault();
    const parsed = backupCodeSchema.safeParse(backup);
    if (!parsed.success) {
      setFailure(parsed.error.issues[0]?.message ?? "Enter your backup code.");
      return;
    }
    setFailure(null);
    setBusy(true);
    handleCodeResult(await verifyStaffBackupCode(parsed.data));
    setBusy(false);
  }

  if (lockedMinutes !== null) {
    return (
      <Notice tone="danger" title="Sign-in paused">
        Too many failed attempts. For security, this account is locked for {lockedMinutes} minutes.
        If this was not you, tell your administrator. You can also{" "}
        <Link href="/forgot-password" className="font-semibold underline">
          reset your password
        </Link>
        .
      </Notice>
    );
  }

  if (step === "done") {
    return (
      <p role="status" className="text-ink text-lg">
        Signed in. Opening your workspace.
      </p>
    );
  }

  if (step === "totp") {
    return (
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submitTotp(code);
        }}
      >
        <p className="text-ink-muted text-lg">
          Open your authenticator app and enter the 6-digit code for ViniCure.
        </p>
        <div className="grid gap-2">
          <OtpInput
            key={otpKey}
            autoFocus
            label="Authenticator code"
            value={code}
            onChange={setCode}
            onComplete={(v) => void submitTotp(v)}
            invalid={Boolean(failure)}
            disabled={busy}
            describedBy={failure ? `${uid}-fail` : undefined}
          />
          {failure ? (
            <p id={`${uid}-fail`} role="alert" className="text-danger text-sm font-medium">
              {failure}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" loading={busy} disabled={code.length < 6}>
          Verify and sign in
        </Button>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Button
            variant="ghost"
            onClick={() => {
              setFailure(null);
              setStep("backup");
            }}
          >
            Use a backup code instead
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setFailure(null);
              setCode("");
              setStep("credentials");
            }}
          >
            Back
          </Button>
        </div>
        <PrototypeHint>
          <p>
            Any 6 digits work, except {MOCK_CODES.wrong} (wrong) and {MOCK_CODES.locked} (locked).
          </p>
        </PrototypeHint>
      </form>
    );
  }

  if (step === "backup") {
    return (
      <form className="grid gap-5" noValidate onSubmit={(e) => void submitBackup(e)}>
        <p className="text-ink-muted text-lg">
          Enter one of the backup codes you saved when you set up two-step sign-in. Each code works
          once.
        </p>
        <Field
          label="Backup code"
          hint="Looks like ab12-cd34"
          error={failure ?? undefined}
          required
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={backup}
              onChange={(e) => setBackup(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy}>
          Use backup code
        </Button>
        <Button
          variant="ghost"
          className="justify-self-start"
          onClick={() => {
            setFailure(null);
            setStep("totp");
          }}
        >
          Use my authenticator app instead
        </Button>
        <PrototypeHint>
          <p>Any 8-character code like ab12-cd34 works, except {MOCK_BACKUP.invalid} (invalid).</p>
        </PrototypeHint>
      </form>
    );
  }

  return (
    <form noValidate className="grid gap-5" onSubmit={(e) => void submitCredentials(e)}>
      <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      {failure ? (
        <Notice tone="danger" title="Could not sign in">
          {failure}
        </Notice>
      ) : null}
      <Field inputId={ids.email} label="Work email" error={errors.email} required>
        {({ describedBy, invalid }) => (
          <Input
            id={ids.email}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <PasswordField
        label="Password"
        inputId={ids.password}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        error={errors.password}
      />
      <Link
        href="/forgot-password"
        className="text-primary justify-self-start font-semibold underline"
      >
        Forgot your password?
      </Link>
      <Button type="submit" size="lg" loading={busy}>
        Continue
      </Button>
      <PrototypeHint>
        <p>
          Email containing “admin” opens the admin console, “support” the support console, anything
          else the doctor workspace.
        </p>
        <p>
          Password {MOCK_STAFF.wrongPassword} shows the wrong-password message. An email starting
          with “{MOCK_STAFF.lockedEmailPrefix}” shows the lockout.
        </p>
      </PrototypeHint>
    </form>
  );
}
