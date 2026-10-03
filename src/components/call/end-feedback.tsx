"use client";

import { useId, useState } from "react";
import { Star } from "@phosphor-icons/react/ssr";
import { Notice } from "@/components/auth/notice";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { reviewForm } from "@/lib/schemas/appointments";
import type { Appointment } from "@/lib/types";

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const TAGS = [
  "Clear audio",
  "Clear video",
  "Doctor listened",
  "Easy to join",
  "Had connection problems",
  "Started late",
];
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function EndFeedback({ appt, seconds }: { appt: Appointment; seconds: number }) {
  const uid = useId();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<{ rating?: string; comment?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const mins = Math.max(1, Math.round(seconds / 60));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = reviewForm.safeParse({ rating: rating || undefined, comment });
    if (!p.success) {
      const next: typeof err = {};
      for (const i of p.error.issues) next[i.path[0] as "rating" | "comment"] ??= i.message;
      return setErr(next);
    }
    setBusy(true);
    await delay(600);
    setBusy(false);
    setDone(true);
  }

  return (
    <div className="mx-auto grid max-w-xl gap-6 px-4 py-10">
      <div>
        <h1 tabIndex={-1} id="stage-h" className="text-3xl font-semibold outline-none">
          Your consultation has ended
        </h1>
        <p className="text-ink-muted mt-2 text-lg">
          {appt.doctorName}. About {mins} {mins === 1 ? "minute" : "minutes"}.
        </p>
      </div>
      <Notice tone="info" title="What happens next">
        Your prescription and advice appear in your records in a few minutes, with the doctor’s
        registration number. We will message you when they are ready.
      </Notice>

      {done ? (
        <Notice tone="info" title="Thank you for your feedback">
          It helps us and other patients.
        </Notice>
      ) : (
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="border-line bg-surface shadow-card grid gap-5 rounded-xl border p-5"
        >
          <h2 className="text-xl font-semibold">How was it?</h2>
          <fieldset>
            <legend className="sr-only">Star rating</legend>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="relative">
                  <input
                    type="radio"
                    name="rate"
                    value={n}
                    checked={rating === n}
                    onChange={() => setRating(n)}
                    className="peer sr-only"
                  />
                  <span className="peer-focus-visible:outline-primary flex size-11 cursor-pointer items-center justify-center rounded-lg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                    <Star
                      aria-hidden
                      weight={n <= rating ? "fill" : "regular"}
                      className={cn("size-8", n <= rating ? "text-warning" : "text-ink-faint")}
                    />
                    <span className="sr-only">
                      {n} {n === 1 ? "star" : "stars"}, {WORDS[n]}
                    </span>
                  </span>
                </label>
              ))}
              <span aria-hidden className="text-ink-muted ml-2 text-sm">
                {WORDS[rating]}
              </span>
            </div>
            {err.rating ? (
              <p role="alert" className="text-danger mt-1 text-sm">
                {err.rating}
              </p>
            ) : null}
          </fieldset>
          <fieldset>
            <legend className="mb-2 font-medium">What stood out? (optional)</legend>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTags((l) => (on ? l.filter((x) => x !== t) : [...l, t]))}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm font-medium",
                      on
                        ? "bg-primary border-primary text-white"
                        : "border-line-strong bg-surface hover:bg-primary-soft",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Field
            inputId={`${uid}-c`}
            label="Anything else? (optional)"
            hint="Please do not include medical details or phone numbers."
            error={err.comment}
          >
            {({ describedBy, invalid }) => (
              <Textarea
                id={`${uid}-c`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                className="min-h-24"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy}>
              Send feedback
            </Button>
            <ButtonLink href="/patient/dashboard" variant="ghost">
              Skip
            </ButtonLink>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/patient/records?type=prescriptions" size="lg">
          Go to my prescriptions
        </ButtonLink>
        <ButtonLink href="/patient/dashboard" variant="secondary" size="lg">
          Back to dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
