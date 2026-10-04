"use client";

import { useId, useState } from "react";
import { Star } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { reviewAppointment } from "@/lib/data/appointments";
import { reviewBooking } from "@/lib/data/appointments-api";
import { reviewForm } from "@/lib/schemas/appointments";
import type { AppointmentView } from "@/lib/types";

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

type Props = {
  appt: AppointmentView | null;
  onClose: () => void;
  onDone: (id: string) => void;
  real?: boolean;
};

export function ReviewDialog({ appt, onClose, onDone, real = false }: Props) {
  const [problem, setProblem] = useState<string>();
  const uid = useId();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<{ rating?: string; comment?: string }>({});
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setRating(0);
    setComment("");
    setErrors({});
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!appt) return;
    const parsed = reviewForm.safeParse({ rating: rating || undefined, comment });
    if (!parsed.success) {
      const next: { rating?: string; comment?: string } = {};
      for (const i of parsed.error.issues) next[i.path[0] as "rating" | "comment"] ??= i.message;
      setErrors(next);
      return;
    }
    setBusy(true);
    if (real) {
      const result = await reviewBooking(appt.id, rating, comment);
      setBusy(false);
      if (result.status !== "ok") {
        setProblem(
          result.status === "refused"
            ? result.message
            : "We could not save your review. Try again in a moment.",
        );
        return;
      }
    } else {
      await reviewAppointment();
      setBusy(false);
    }
    setProblem(undefined);
    onDone(appt.id);
    setRating(0);
    setComment("");
  }

  const formId = `${uid}-review`;
  return (
    <Dialog
      open={Boolean(appt)}
      onClose={close}
      dismissible={!busy}
      variant="sheet"
      title={appt ? `Rate your visit with ${appt.doctorName}` : "Rate your visit"}
      description={
        real
          ? "Your review is checked before it is shown. It never shows your name."
          : "Your review is shown with your first name and initial only."
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Not now
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Submit review
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(e) => void submit(e)} className="grid gap-4">
        {problem ? (
          <p role="alert" className="text-danger font-medium">
            {problem}
          </p>
        ) : null}
        <fieldset>
          <legend className="mb-2 font-semibold">How was it?</legend>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="relative">
                <input
                  type="radio"
                  name="rating"
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
          {errors.rating ? (
            <p role="alert" className="text-danger mt-1 text-sm">
              {errors.rating}
            </p>
          ) : null}
        </fieldset>
        <Field
          inputId={`${uid}-comment`}
          label="Comment (optional)"
          hint="Please do not include medical details or phone numbers."
          error={errors.comment}
        >
          {({ describedBy, invalid }) => (
            <Textarea
              id={`${uid}-comment`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              className="min-h-24"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
