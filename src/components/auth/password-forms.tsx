"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { CheckCircle, Circle } from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { MOCK_AUTH, requestPasswordReset, submitNewPassword } from "@/lib/data/auth";
import {
  changePasswordForm,
  fieldErrors,
  forgotPasswordForm,
  resetPasswordForm,
} from "@/lib/schemas/auth";
import { MOCK_STAFF } from "@/mocks/auth";
import { ErrorSummary } from "./error-summary";
import { Notice, PrototypeHint } from "./notice";
import { PasswordField } from "./password-field";

const rules = [
  { label: "At least 12 characters", test: (v: string) => v.length >= 12 },
  {
    label: "A lowercase and an uppercase letter",
    test: (v: string) => /[a-z]/.test(v) && /[A-Z]/.test(v),
  },
  { label: "A number", test: (v: string) => /\d/.test(v) },
  { label: "A symbol, like ! or #", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

/** Live checklist. Every rule has words and an icon, never colour alone. */
function PasswordRules({ value }: { value: string }) {
  return (
    <ul aria-label="Password rules" className="grid gap-1 text-sm">
      {rules.map((r) => {
        const ok = r.test(value);
        const Icon = ok ? CheckCircle : Circle;
        return (
          <li
            key={r.label}
            className={
              ok ? "text-success flex items-center gap-2" : "text-ink-muted flex items-center gap-2"
            }
          >
            <Icon aria-hidden weight={ok ? "fill" : "regular"} className="size-4 shrink-0" />
            <span>
              {r.label}
              <span className="sr-only">{ok ? ", done" : ", not yet"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ForgotPasswordForm() {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordForm.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setBusy(true);
    const result = await requestPasswordReset(parsed.data.email);
    setBusy(false);
    if (result.status === "rate_limited") {
      setError(`Too many requests. Try again in ${result.retryInMinutes} minutes.`);
      return;
    }
    if (result.status === "unavailable") {
      setError("We could not send the request. Try again in a moment.");
      return;
    }
    // The same message appears whether or not the email belongs to an account.
    setSent(true);
  }

  if (sent) {
    // The same message appears whether or not the email belongs to an account.
    return (
      <div className="grid gap-5">
        <Notice tone="info" title="Check your email">
          If an account uses that email, we sent a link to reset the password. It works for 30
          minutes.
        </Notice>
        <ButtonLink href="/login/staff" variant="secondary">
          Back to sign in
        </ButtonLink>
        <Button variant="ghost" className="justify-self-start" onClick={() => setSent(false)}>
          Use a different email
        </Button>
      </div>
    );
  }
  return (
    <form noValidate className="grid gap-5" onSubmit={(e) => void submit(e)}>
      <Field inputId={`${uid}-email`} label="Work email" error={error} required>
        {({ describedBy, invalid }) => (
          <Input
            id={`${uid}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Send reset link
      </Button>
      <Link href="/login/staff" className="text-primary justify-self-start font-semibold underline">
        Back to sign in
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ expired, token }: { expired: boolean; token?: string }) {
  const uid = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [linkGone, setLinkGone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ids = { password: `${uid}-password`, confirm: `${uid}-confirm` };

  if (expired || linkGone || (!MOCK_AUTH && !token)) {
    return (
      <div className="grid gap-5">
        <Notice tone="warning" title="This link has expired or was already used">
          Reset links work once and for 30 minutes. Ask for a new one.
        </Notice>
        <ButtonLink href="/forgot-password">Send a new link</ButtonLink>
        {MOCK_AUTH ? (
          <PrototypeHint>
            <p>
              Open this page without <code>?state=expired</code> to see the form.
            </p>
          </PrototypeHint>
        ) : null}
      </div>
    );
  }
  if (done) {
    return (
      <div className="grid gap-5">
        <Notice tone="info" title="Password changed">
          You were signed out on all other devices. Sign in with your new password.
        </Notice>
        <ButtonLink href="/login/staff">Go to sign in</ButtonLink>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = resetPasswordForm.safeParse({ password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setProblem(null);
    setBusy(true);
    const result = await submitNewPassword({
      password: parsed.data.password,
      ...(token ? { token } : {}),
    });
    setBusy(false);
    if (result.status === "ok") setDone(true);
    else if (result.status === "link_expired") setLinkGone(true);
    else if (result.status === "weak") setErrors({ password: result.message });
    else if (result.status === "rate_limited")
      setProblem(`Too many tries. Wait ${result.retryInMinutes} minutes and try again.`);
    else setProblem("We could not save the password. Try again in a moment.");
  }

  return (
    <form noValidate className="grid gap-5" onSubmit={(e) => void submit(e)}>
      <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      <PasswordField
        label="New password"
        inputId={ids.password}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        error={errors.password}
      />
      <PasswordRules value={password} />
      <PasswordField
        label="Repeat the new password"
        inputId={ids.confirm}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        error={errors.confirm}
      />
      {problem ? (
        <Notice tone="warning" title="Could not save">
          {problem}
        </Notice>
      ) : null}
      <Button type="submit" size="lg" loading={busy}>
        Save new password
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const uid = useId();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const ids = { current: `${uid}-current`, password: `${uid}-password`, confirm: `${uid}-confirm` };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = changePasswordForm.safeParse({ current, password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await submitNewPassword({ current, password: parsed.data.password });
    setBusy(false);
    if (result.status === "wrong_current") {
      setErrors({ current: "The current password is not correct." });
      return;
    }
    if (result.status === "weak") {
      setErrors({ password: result.message });
      return;
    }
    if (result.status === "rate_limited") {
      setErrors({
        current: `Too many tries. Wait ${result.retryInMinutes} minutes and try again.`,
      });
      return;
    }
    if (result.status !== "ok") {
      setErrors({ current: "We could not change the password. Try again in a moment." });
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Notice tone="info" title="Password changed">
        Every other device was signed out. This device stays signed in.
      </Notice>
    );
  }
  return (
    <form noValidate className="grid max-w-lg gap-5" onSubmit={(e) => void submit(e)}>
      <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      <PasswordField
        label="Current password"
        inputId={ids.current}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
        error={errors.current}
      />
      <PasswordField
        label="New password"
        inputId={ids.password}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        error={errors.password}
      />
      <PasswordRules value={password} />
      <PasswordField
        label="Repeat the new password"
        inputId={ids.confirm}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        error={errors.confirm}
      />
      <Button type="submit" size="lg" loading={busy}>
        Change password
      </Button>
      {MOCK_AUTH ? (
        <PrototypeHint>
          <p>Current password {MOCK_STAFF.wrongPassword} shows the wrong-password error.</p>
        </PrototypeHint>
      ) : null}
    </form>
  );
}
