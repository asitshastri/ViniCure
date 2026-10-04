"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";
import { acceptInvitation, enrolInvitation, type EnrolResult } from "@/lib/data/auth-api";
import { fieldErrors, nameSchema, otpSchema, strongPasswordSchema } from "@/lib/schemas/auth";
import { z } from "zod";
import { ErrorSummary } from "./error-summary";
import { Notice } from "./notice";
import { PasswordField } from "./password-field";

type Enrolled = Extract<EnrolResult, { status: "ok" }>;
type Step = "start" | "setup" | "done" | "invalid";

const acceptForm = z
  .object({
    name: nameSchema,
    password: strongPasswordSchema,
    confirm: z.string(),
    code: otpSchema,
    saved: z.literal(true, "Confirm that you saved your backup codes."),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords do not match.",
    path: ["confirm"],
  });

/** The secret as the authenticator app shows it, for people who cannot scan the QR code. */
function manualKey(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function InviteAccept({ token }: { token: string }) {
  const uid = useId();
  const [step, setStep] = useState<Step>("start");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<Enrolled | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [otpKey, setOtpKey] = useState(0);

  const ids = {
    name: `${uid}-name`,
    password: `${uid}-password`,
    confirm: `${uid}-confirm`,
    code: `${uid}-code`,
    saved: `${uid}-saved`,
  };

  // The QR code is drawn here in the browser from the address the server sent, as an image.
  useEffect(() => {
    if (!enrolled) return;
    let cancelled = false;
    void QRCode.toDataURL(enrolled.totpUri, {
      margin: 1,
      width: 224,
      errorCorrectionLevel: "M",
    }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [enrolled]);

  async function start() {
    setBusy(true);
    setProblem(null);
    const result = await enrolInvitation(token);
    setBusy(false);
    if (result.status === "ok") {
      setEnrolled(result);
      setSaved(false);
      setStep("setup");
    } else if (result.status === "invalid_link") setStep("invalid");
    else if (result.status === "rate_limited")
      setProblem(`Too many tries. Wait ${result.retryInMinutes} minutes and try again.`);
    else setProblem("We could not start the set-up. Try again in a moment.");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = acceptForm.safeParse({ name, password, confirm, code, saved });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setProblem(null);
    setBusy(true);
    const result = await acceptInvitation({
      token,
      name: parsed.data.name,
      password: parsed.data.password,
      code: parsed.data.code,
    });
    setBusy(false);
    if (result.status === "ok") {
      setPassword("");
      setConfirm("");
      setStep("done");
    } else if (result.status === "invalid_link") setStep("invalid");
    else if (result.status === "fields") {
      setErrors(result.errors);
      setAttempt((a) => a + 1);
      if (result.errors.code) {
        setCode("");
        setOtpKey((k) => k + 1);
      }
    } else if (result.status === "rate_limited")
      setProblem(`Too many tries. Wait ${result.retryInMinutes} minutes and try again.`);
    else setProblem("We could not finish the set-up. Try again in a moment.");
  }

  if (step === "invalid") {
    return (
      <Notice tone="danger" title="This invitation link is not valid">
        It may have expired, been used already, or been replaced by a newer invitation. Ask the
        person who invited you to send a new one.
      </Notice>
    );
  }

  if (step === "done") {
    return (
      <div className="grid gap-5">
        <Notice tone="info" title="Your account is ready">
          Sign in with your email, your password and a code from your authenticator app.
        </Notice>
        <Link
          href="/login/staff"
          className="bg-primary hover:bg-primary-hover inline-flex min-h-12 items-center justify-center rounded-lg px-6 font-semibold text-white"
        >
          Go to staff sign in
        </Link>
      </div>
    );
  }

  if (step === "start" || !enrolled) {
    return (
      <div className="grid gap-5">
        <p className="text-ink text-lg">
          You need an authenticator app on your phone, for example Google Authenticator, Microsoft
          Authenticator or Authy.
        </p>
        {problem ? (
          <Notice tone="warning" title="Could not start">
            {problem}
          </Notice>
        ) : null}
        <Button size="lg" loading={busy} onClick={() => void start()}>
          Start set-up
        </Button>
      </div>
    );
  }

  return (
    <form noValidate className="grid gap-8" onSubmit={(e) => void submit(e)}>
      <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />

      <section aria-labelledby={`${uid}-h1`} className="grid gap-4">
        <h2 id={`${uid}-h1`} className="text-ink text-xl font-semibold">
          Add the account to your authenticator app
        </h2>
        <p className="text-ink-muted">
          Scan this code with the app, or type the key by hand. The account is{" "}
          <strong className="text-ink">{enrolled.email}</strong>.
        </p>
        <div className="flex flex-wrap items-center gap-6">
          {qr ? (
            // A data: image made in the browser; there is nothing to load from another site.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="QR code for your authenticator app"
              width={224}
              height={224}
              className="border-line rounded-xl border bg-white p-2"
            />
          ) : (
            <div aria-hidden className="bg-canvas size-56 rounded-xl" />
          )}
          <div>
            <p className="text-ink-muted text-sm">Key to type by hand</p>
            <p data-testid="manual-key" className="text-ink font-mono text-lg tracking-wide">
              {manualKey(enrolled.totpUri)}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby={`${uid}-h2`} className="grid gap-4">
        <h2 id={`${uid}-h2`} className="text-ink text-xl font-semibold">
          Save your backup codes
        </h2>
        <p className="text-ink-muted">
          Each code works once if you cannot use your app. They are shown only now. Keep them
          somewhere private, not in your email.
        </p>
        <ul
          data-testid="backup-codes"
          className="border-line bg-canvas grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border p-4 font-mono sm:grid-cols-3"
        >
          {enrolled.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div>
          <Checkbox
            id={ids.saved}
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            aria-invalid={Boolean(errors.saved) || undefined}
            label="I have saved my backup codes"
          />
          {errors.saved ? (
            <p role="alert" className="text-danger mt-1.5 text-sm">
              {errors.saved}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby={`${uid}-h3`} className="grid gap-5">
        <h2 id={`${uid}-h3`} className="text-ink text-xl font-semibold">
          Your name and password
        </h2>
        <Field inputId={ids.name} label="Full name" error={errors.name} required>
          {({ describedBy, invalid }) => (
            <Input
              id={ids.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <PasswordField
          inputId={ids.password}
          label="Password"
          hint="At least 12 characters with upper and lower case letters, a number and a symbol."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="new-password"
        />
        <PasswordField
          inputId={ids.confirm}
          label="Type the password again"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          autoComplete="new-password"
        />
        <div className="grid gap-2">
          <p id={`${ids.code}-label`} className="text-ink text-sm font-medium">
            Code from your app
          </p>
          <OtpInput
            key={otpKey}
            value={code}
            onChange={setCode}
            invalid={Boolean(errors.code)}
            disabled={busy}
            describedBy={errors.code ? `${ids.code}-error` : undefined}
            label="Code from your authenticator app"
          />
          {errors.code ? (
            <p id={`${ids.code}-error`} role="alert" className="text-danger text-sm font-medium">
              {errors.code}
            </p>
          ) : null}
        </div>
      </section>

      {problem ? (
        <Notice tone="warning" title="Could not finish">
          {problem}
        </Notice>
      ) : null}

      <Button type="submit" size="lg" loading={busy}>
        Create my account
      </Button>
    </form>
  );
}
