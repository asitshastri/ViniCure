"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";
import { requestOtp, verifyOtp } from "@/lib/data/auth";
import { fieldErrors, otpSchema, patientSignUpSchema, phoneSchema } from "@/lib/schemas/auth";
import { AuthCard, DemoHint, Notice } from "./auth-card";
import { formatWait, useCountdown } from "./use-countdown";

type Mode = "signin" | "signup";
type Step = "phone" | "otp" | "done";

const RESEND_SECONDS = 30;

export function PatientAuth({ mode }: { mode: Mode }) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [consent, setConsent] = useState(false);
  const [otp, setOtp] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendLeft, startResend] = useCountdown();
  const [lockLeft, startLock] = useCountdown();
  const headingRef = useRef<HTMLDivElement>(null);

  // Move focus to the new step heading so screen reader and keyboard users know the screen changed.
  useEffect(() => {
    headingRef.current?.querySelector<HTMLElement>("[data-auth-heading]")?.focus();
  }, [step]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setFormError(null);
    const parsed =
      mode === "signup"
        ? patientSignUpSchema.safeParse({ phone, fullName, consent })
        : phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setErrors(
        mode === "signup" ? fieldErrors(parsed) : { phone: parsed.error.issues[0]?.message ?? "" },
      );
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await requestOtp(phone);
    setBusy(false);
    if (!res.ok) {
      if (res.reason === "rate_limited") {
        startLock(res.retryAfterSeconds ?? 600);
        setFormError("Too many codes requested. Please wait before trying again.");
      } else {
        setFormError("We could not send the code. Check your connection and try again.");
      }
      return;
    }
    setOtp("");
    startResend(RESEND_SECONDS);
    setStep("otp");
  }

  async function submitOtp(code: string) {
    setFormError(null);
    const parsed = otpSchema.safeParse(code);
    if (!parsed.success) {
      setErrors({ otp: parsed.error.issues[0]?.message ?? "" });
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await verifyOtp(code);
    setBusy(false);
    if (res.ok) {
      setStep("done");
      return;
    }
    setOtp("");
    if (res.reason === "locked") {
      setLocked(true);
      startLock(res.retryAfterSeconds ?? 900);
    } else if (res.reason === "expired") {
      setFormError("That code has expired. Request a new one.");
    } else if (res.reason === "invalid") {
      setFormError(
        `That code is not correct. ${res.attemptsLeft ?? 0} ${res.attemptsLeft === 1 ? "try" : "tries"} left.`,
      );
    } else {
      setFormError("Something went wrong. Please try again.");
    }
  }

  if (step === "done") {
    return (
      <div ref={headingRef}>
        <AuthCard title={mode === "signup" ? "You are all set" : "You are signed in"}>
          <p className="text-success flex items-center gap-2 font-medium">
            <CheckCircle aria-hidden weight="fill" className="size-6" /> Phone number verified
          </p>
          <ButtonLink href="/patient/dashboard" size="lg">
            Go to my dashboard
          </ButtonLink>
        </AuthCard>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div ref={headingRef}>
        <AuthCard
          title="Enter the code"
          description={
            <>
              If this number can sign in, we sent a 6-digit code by SMS to{" "}
              <span className="text-ink font-medium tabular-nums">+91 {phone}</span>.
            </>
          }
          footer={
            <button
              type="button"
              className="text-primary min-h-11 font-semibold hover:underline"
              onClick={() => {
                setStep("phone");
                setFormError(null);
                setLocked(false);
              }}
            >
              Use a different number
            </button>
          }
        >
          {locked ? (
            <Notice>
              Too many wrong codes. For your safety, sign-in is paused. Try again in{" "}
              <span className="tabular-nums">{formatWait(lockLeft)}</span>.
            </Notice>
          ) : null}
          {formError && !locked ? <Notice>{formError}</Notice> : null}
          <div className="flex flex-col gap-1.5">
            <OtpInput
              value={otp}
              onChange={setOtp}
              onComplete={submitOtp}
              invalid={Boolean(errors.otp || formError)}
              disabled={busy || locked}
              describedBy={errors.otp ? "otp-error" : undefined}
            />
            {errors.otp ? (
              <p id="otp-error" role="alert" className="text-danger text-sm">
                {errors.otp}
              </p>
            ) : null}
          </div>
          <Button
            size="lg"
            loading={busy}
            disabled={locked || otp.length < 6}
            onClick={() => submitOtp(otp)}
          >
            Verify and continue
          </Button>
          <p className="text-ink-muted text-sm" aria-live="polite">
            {resendLeft > 0 ? (
              <>
                Resend code in <span className="tabular-nums">{resendLeft}</span> s
              </>
            ) : (
              <button
                type="button"
                className="text-primary min-h-11 font-semibold hover:underline"
                disabled={locked}
                onClick={() => sendCode()}
              >
                Resend code
              </button>
            )}
          </p>
          <DemoHint>
            code 123456 works, 000000 shows an expired code, anything else is wrong. Five wrong
            tries lock sign-in.
          </DemoHint>
        </AuthCard>
      </div>
    );
  }

  return (
    <div ref={headingRef}>
      <AuthCard
        title={mode === "signup" ? "Create your account" : "Sign in to ViniCure"}
        description="We will send a one-time code to your mobile number. No password needed."
        footer={
          mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-primary font-semibold hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/register" className="text-primary font-semibold hover:underline">
                Create an account
              </Link>
              <br />
              Doctor or staff?{" "}
              <Link href="/login/staff" className="text-primary font-semibold hover:underline">
                Sign in with email
              </Link>
            </>
          )
        }
      >
        <form onSubmit={sendCode} noValidate className="flex flex-col gap-5">
          {formError ? (
            <Notice>
              {formError}
              {lockLeft > 0 ? (
                <>
                  {" "}
                  Try again in <span className="tabular-nums">{formatWait(lockLeft)}</span>.
                </>
              ) : null}
            </Notice>
          ) : null}
          {mode === "signup" ? (
            <Field label="Full name" required error={errors.fullName}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  maxLength={100}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
          ) : null}
          <Field
            label="Mobile number"
            required
            error={errors.phone}
            hint="Indian mobile numbers only for now."
          >
            {({ id, describedBy, invalid }) => (
              <div className="flex gap-2">
                <span className="border-line-strong bg-canvas text-ink-muted flex h-11 items-center rounded-lg border px-3">
                  +91
                </span>
                <Input
                  id={id}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  className="flex-1 tabular-nums"
                />
              </div>
            )}
          </Field>
          {mode === "signup" ? (
            <div className="flex flex-col gap-1.5">
              <Checkbox
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                label={
                  <>
                    I agree to the{" "}
                    <Link href="/terms" className="text-primary underline">
                      terms
                    </Link>{" "}
                    and the{" "}
                    <Link href="/privacy-policy" className="text-primary underline">
                      privacy policy
                    </Link>
                    . I consent to ViniCure processing my health information to provide
                    consultations.
                  </>
                }
                description="Draft wording, pending legal review. You can withdraw consent in settings."
              />
              {errors.consent ? (
                <p role="alert" className="text-danger text-sm">
                  {errors.consent}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-ink-muted text-sm">
              By continuing you agree to our{" "}
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
          <Button type="submit" size="lg" loading={busy} disabled={lockLeft > 0}>
            Send code
          </Button>
          <DemoHint>any valid 10-digit number works. 9999999999 shows the send limit.</DemoHint>
        </form>
      </AuthCard>
    </div>
  );
}
