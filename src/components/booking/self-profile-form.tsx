"use client";

import { useId, useState, type FormEvent } from "react";
import { ErrorSummary } from "@/components/auth/error-summary";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import * as patients from "@/lib/data/patients-api";
import { fieldErrors } from "@/lib/schemas/auth";
import { selfProfileForm } from "@/lib/schemas/booking";

export type NewSelf = { id: string; name: string };

/**
 * Shown once, when a patient with no profile of their own books for the first time. The doctor
 * needs the patient's name and date of birth (identity checks in the telemedicine guidelines), so
 * the booking cannot go on without them.
 */
export function SelfProfileForm({
  defaultName,
  onCreated,
}: {
  defaultName: string;
  onCreated: (profile: NewSelf & { dob: string; isMinor: boolean }) => void;
}) {
  const uid = useId();
  const [name, setName] = useState(defaultName);
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const ids = { name: `${uid}-name`, dob: `${uid}-dob`, gender: `${uid}-gender` };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = selfProfileForm.safeParse({ name, dob, gender });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    const result = await patients.create({
      relation: "self",
      fullName: parsed.data.name,
      dob: parsed.data.dob,
      gender: parsed.data.gender,
    });
    setBusy(false);
    if (result.status === "ok") {
      onCreated({
        id: result.patient.id,
        name: result.patient.fullName,
        dob: result.patient.dob,
        isMinor: result.patient.isMinor,
      });
    } else if (result.status === "fields") {
      setErrors(result.errors);
      setAttempt((a) => a + 1);
    } else {
      setFailure(result.message);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-6">
      <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      <p className="text-ink-muted text-lg">
        The doctor needs to know who they are talking to. Add your details once. They stay private
        and are used only for your care.
      </p>
      <Field inputId={ids.name} label="Your full name" error={errors.name} required>
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
      <Field
        inputId={ids.dob}
        label="Date of birth"
        hint="Use the format YYYY-MM-DD, for example 1990-04-12."
        error={errors.dob}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.dob}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            inputMode="numeric"
            autoComplete="bday"
            placeholder="YYYY-MM-DD"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field inputId={ids.gender} label="Sex" error={errors.gender} required>
        {({ describedBy, invalid }) => (
          <Select
            id={ids.gender}
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <option value="">Choose</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="undisclosed">Prefer not to say</option>
          </Select>
        )}
      </Field>
      {failure ? (
        <p role="alert" className="text-danger font-medium">
          {failure}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={busy} className="justify-self-start">
        Save and continue
      </Button>
    </form>
  );
}
