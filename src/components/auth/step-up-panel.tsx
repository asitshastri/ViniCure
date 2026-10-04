"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LockKey } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { GoogleButton } from "./google-button";
import { Notice } from "./notice";

// Shown instead of the patient's pages when a phone sign-in looked risky (new device, long
// silence, a changed number) and no second method has been proven yet (P2-18, D-019). Nothing
// stored about the patient is available until it is.

export function StepUpPanel({ googleAvailable }: { googleAvailable: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length < 10) {
      setError("Enter one of your recovery codes, like ABCDE-FGHJK.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/me/step-up/recovery-code", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (response.ok) {
        setCode("");
        router.refresh();
        return;
      }
      setError(
        response.status === 429
          ? "Too many tries. Wait 15 minutes and try again."
          : "That code is not valid or was already used.",
      );
    } catch {
      setError("We could not check the code. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className="border-line bg-surface shadow-card mx-auto grid max-w-2xl gap-6 rounded-[20px] border p-6 sm:p-10"
    >
      <div className="flex items-center gap-3">
        <LockKey aria-hidden className="text-primary size-8" />
        <h1 id={`${uid}-title`} className="text-ink text-2xl font-semibold sm:text-3xl">
          Confirm it is you
        </h1>
      </div>
      <p className="text-ink-muted text-lg">
        You signed in with your mobile number from a device we do not know, or after a long time.
        Mobile numbers can be given to someone else, so we keep your health information closed until
        you confirm with something only you have.
      </p>
      <form noValidate className="grid gap-4" onSubmit={(e) => void submit(e)}>
        <Field
          inputId={`${uid}-code`}
          label="Recovery code"
          hint="One of the ten codes you saved. Each works once."
          error={error ?? undefined}
          required
        >
          {({ describedBy, invalid }) => (
            <Input
              id={`${uid}-code`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy}>
          Confirm with recovery code
        </Button>
      </form>
      {googleAvailable ? (
        <div className="border-line grid gap-3 border-t pt-6">
          <p className="text-ink-muted">Or use the Google account you added before.</p>
          <GoogleButton mode="signin" />
        </div>
      ) : null}
      <Notice tone="info" title="No code and no Google?">
        You can still sign out. To get back into your records, contact support so we can check who
        you are. We will never ask for a code over the phone or in a message.
      </Notice>
    </section>
  );
}
