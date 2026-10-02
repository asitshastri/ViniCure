"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";
import {
  homePathFor,
  requestPatientOtp,
  verifyPatientOtp,
  type OtpRequestResult,
} from "@/lib/data/auth";
import { fieldErrors, otpSchema, patientPhoneForm, patientRegisterForm } from "@/lib/schemas/auth";
import { MOCK_CODES, MOCK_PHONE_RATE_LIMITED_SUFFIX } from "@/mocks/auth";
import { ErrorSummary } from "./error-summary";
import { Notice, PrototypeHint } from "./notice";
import { useCountdown } from "./use-countdown";

const MAX_ATTEMPTS = 3;

type Step = "details" | "otp" | "done";

export function PatientAuth({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const uid = useId();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rateLimit, setRateLimit] = useState<Extract<
    OtpRequestResult,
    { status: "rate_limited" }
  > | null>(null);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [otpKey, setOtpKey] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [lockedMinutes, setLockedMinutes] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [secondsLeft, startCountdown] = useCountdown();

  const ids = { name: `${uid}-name`, phone: `${uid}-phone`, consent: `${uid}-consent` };
  const cleanPhone = phone.replace(/\D/g, "").slice(-10);
  const masked =
    cleanPhone.length === 10
      ? `+91 ${cleanPhone.slice(0, 2)}••••••${cleanPhone.slice(-2)}`
      : "your number";

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const schema = mode === "register" ? patientRegisterForm : patientPhoneForm;
    const parsed = schema.safeParse({ name, phone, consent });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await requestPatientOtp(parsed.data.phone);
    setBusy(false);
    if (result.status === "rate_limited") {
      setRateLimit(result);
      return;
    }
    setRateLimit(null);
    setPhone(parsed.data.phone);
    setCode("");
    setCodeError("");
    setExpired(false);
    startCountdown(result.resendInSeconds);
    setOtpKey((k) => k + 1);
    setStep("otp");
  }

  async function verify(value: string) {
    const parsed = otpSchema.safeParse(value);
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message ?? "Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setCodeError("");
    const result = await verifyPatientOtp(parsed.data);
    setBusy(false);
    if (result.status === "ok") {
      setStep("done");
      router.push(homePathFor("patient"));
      return;
    }
    setCode("");
    setOtpKey((k) => k + 1);
    if (result.status === "locked") {
      setLockedMinutes(result.retryInMinutes);
    } else if (result.status === "expired") {
      setExpired(true);
      setCodeError("This code has expired. Request a new one.");
    } else {
      const next = wrongCount + 1;
      setWrongCount(next);
      if (next >= MAX_ATTEMPTS) setLockedMinutes(15);
      else
        setCodeError(
          `That code is not correct. ${MAX_ATTEMPTS - next} ${MAX_ATTEMPTS - next === 1 ? "try" : "tries"} left.`,
        );
    }
  }

  if (step === "done") {
    return (
      <p role="status" className="text-ink text-lg">
        Signed in. Taking you to your dashboard.
      </p>
    );
  }

  if (step === "otp") {
    const locked = lockedMinutes !== null;
    return (
      <div>
        <p className="text-ink-muted text-lg">
          If {masked} can sign in, we sent a 6-digit code to it by SMS. It works for 10 minutes.
        </p>

        {locked ? (
          <Notice tone="danger" title="Too many tries" className="mt-6">
            For your safety we paused sign-in for this number. Try again in {lockedMinutes} minutes.
            Need help now?{" "}
            <Link href="/support" className="font-semibold underline">
              Contact support
            </Link>
            .
          </Notice>
        ) : (
          <form
            className="mt-6 grid gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void verify(code);
            }}
          >
            <div className="grid gap-2">
              <p id={`${uid}-otp-label`} className="text-ink text-sm font-medium">
                Enter the code
              </p>
              <OtpInput
                key={otpKey}
                autoFocus
                value={code}
                onChange={setCode}
                onComplete={(v) => void verify(v)}
                invalid={Boolean(codeError)}
                disabled={busy}
                describedBy={codeError ? `${uid}-otp-error` : undefined}
              />
              {codeError ? (
                <p id={`${uid}-otp-error`} role="alert" className="text-danger text-sm font-medium">
                  {codeError}
                </p>
              ) : null}
            </div>
            <Button type="submit" size="lg" loading={busy} disabled={code.length < 6}>
              Verify and continue
            </Button>
          </form>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant="ghost"
            disabled={(secondsLeft > 0 && !expired) || busy || locked}
            onClick={() => void sendCode()}
          >
            {secondsLeft > 0 && !expired ? `Send a new code in ${secondsLeft}s` : "Send a new code"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setStep("details");
              setWrongCount(0);
              setLockedMinutes(null);
            }}
          >
            Change number
          </Button>
        </div>

        <PrototypeHint>
          <p>Any 6 digits sign you in, except:</p>
          <p>
            {MOCK_CODES.wrong}: wrong code, {MOCK_CODES.expired}: expired, {MOCK_CODES.locked}:
            locked.
          </p>
        </PrototypeHint>
      </div>
    );
  }

  const fieldIds = { name: ids.name, phone: ids.phone, consent: ids.consent };
  return (
    <form noValidate onSubmit={(e) => void sendCode(e)} className="grid gap-5">
      <ErrorSummary errors={errors} fieldIds={fieldIds} attempt={attempt} />

      {mode === "register" ? (
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
      ) : null}

      <Field
        inputId={ids.phone}
        label="Mobile number"
        hint="10 digits, without +91. We send a 6-digit code by SMS."
        error={errors.phone}
        required
      >
        {({ describedBy, invalid }) => (
          <div className="flex gap-2">
            <span
              aria-hidden
              className="border-line-strong bg-canvas text-ink-muted flex h-11 items-center rounded-lg border px-3"
            >
              +91
            </span>
            <Input
              id={ids.phone}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          </div>
        )}
      </Field>

      {mode === "register" ? (
        <div>
          <Checkbox
            id={ids.consent}
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={Boolean(errors.consent) || undefined}
            label={
              <>
                I agree to the{" "}
                <Link href="/terms" className="text-primary underline">
                  terms
                </Link>{" "}
                and have read the{" "}
                <Link href="/privacy-policy" className="text-primary underline">
                  privacy policy
                </Link>
                .
              </>
            }
            description="We use your details only to provide care. You can withdraw consent in settings."
          />
          {errors.consent ? (
            <p role="alert" className="text-danger mt-1.5 text-sm">
              {errors.consent}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-ink-muted text-sm">
          By continuing you agree to the{" "}
          <Link href="/terms" className="text-primary underline">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy-policy" className="text-primary underline">
            privacy policy
          </Link>
          .
        </p>
      )}

      {rateLimit ? (
        <Notice tone="warning" title="Too many codes requested">
          Wait {rateLimit.retryInMinutes} minutes before asking for another code.
        </Notice>
      ) : null}

      <Button type="submit" size="lg" loading={busy}>
        {mode === "register" ? "Create account and send code" : "Send code"}
      </Button>

      <PrototypeHint>
        <p>
          A number ending in {MOCK_PHONE_RATE_LIMITED_SUFFIX} shows the “too many codes” message.
        </p>
      </PrototypeHint>
    </form>
  );
}
