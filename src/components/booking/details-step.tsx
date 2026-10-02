"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ErrorSummary } from "@/components/auth/error-summary";
import { fieldErrors } from "@/lib/schemas/auth";
import { bookingDetailsSchema, newPersonSchema, RELATIONS } from "@/lib/schemas/booking";
import type { FamilyMember } from "@/lib/types";

export type PatientChoice =
  | { kind: "self" }
  | { kind: "family"; member: FamilyMember }
  | { kind: "other"; name: string; age: number; relation: string };

type Props = {
  selfName: string;
  family: FamilyMember[];
  initial: { who: string; reason: string; consent: boolean };
  onBack: () => void;
  onNext: (choice: PatientChoice, reason: string) => void;
};

const QUICK_REASONS = [
  "Fever",
  "Cough or cold",
  "Skin problem",
  "Follow-up on reports",
  "Second opinion",
];

export function DetailsStep({ selfName, family, initial, onBack, onNext }: Props) {
  const uid = useId();
  const [who, setWho] = useState(initial.who);
  const [person, setPerson] = useState({ name: "", age: "", relation: "" });
  const [reason, setReason] = useState(initial.reason);
  const [consent, setConsent] = useState(initial.consent);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const ids = {
    name: `${uid}-pname`,
    age: `${uid}-page`,
    relation: `${uid}-prel`,
    reason: `${uid}-reason`,
    consent: `${uid}-consent`,
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    let choice: PatientChoice = { kind: "self" };
    if (who === "other") {
      const p = newPersonSchema.safeParse(person);
      if (!p.success) Object.assign(found, fieldErrors(p.error));
      else choice = { kind: "other", ...p.data };
    } else if (who.startsWith("fm-")) {
      const member = family.find((m) => m.id === who);
      if (member) choice = { kind: "family", member };
    }
    const d = bookingDetailsSchema.safeParse({ reason, consent });
    if (!d.success) Object.assign(found, fieldErrors(d.error));
    if (Object.keys(found).length) {
      setErrors(found);
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    onNext(choice, reason.trim());
  }

  const minor =
    (who.startsWith("fm-") && (family.find((m) => m.id === who)?.age ?? 99) < 18) ||
    (who === "other" && Number(person.age) > 0 && Number(person.age) < 18);

  return (
    <form noValidate onSubmit={submit} className="grid gap-8">
      <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-lg font-semibold">Who is the consultation for?</legend>
        <Radio
          name="who"
          label={`Myself (${selfName})`}
          checked={who === "self"}
          onChange={() => setWho("self")}
        />
        {family.map((m) => (
          <Radio
            key={m.id}
            name="who"
            label={`${m.name}`}
            description={`${m.relation}, ${m.age} years`}
            checked={who === m.id}
            onChange={() => setWho(m.id)}
          />
        ))}
        <Radio
          name="who"
          label="Someone else"
          checked={who === "other"}
          onChange={() => setWho("other")}
        />
      </fieldset>

      {who === "other" ? (
        <div className="border-line grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
          <Field
            inputId={ids.name}
            label="Full name"
            error={errors.name}
            required
            className="sm:col-span-2"
          >
            {({ describedBy, invalid }) => (
              <Input
                id={ids.name}
                value={person.name}
                onChange={(e) => setPerson({ ...person, name: e.target.value })}
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field inputId={ids.age} label="Age in years" error={errors.age} required>
            {({ describedBy, invalid }) => (
              <Input
                id={ids.age}
                value={person.age}
                onChange={(e) => setPerson({ ...person, age: e.target.value })}
                inputMode="numeric"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field inputId={ids.relation} label="Relation to you" error={errors.relation} required>
            {({ describedBy, invalid }) => (
              <Select
                id={ids.relation}
                value={person.relation}
                onChange={(e) => setPerson({ ...person, relation: e.target.value })}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              >
                <option value="">Choose</option>
                {RELATIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      ) : null}

      {minor ? (
        <p role="note" className="bg-info-soft text-info rounded-xl p-4 font-medium">
          For a child under 18, a parent or guardian must be with them during the call.
        </p>
      ) : null}

      <div className="grid gap-3">
        <Field
          inputId={ids.reason}
          label="What do you need help with?"
          hint="A few words are enough. The doctor sees this before the call. Do not include phone numbers or IDs."
          error={errors.reason}
          required
        >
          {({ describedBy, invalid }) => (
            <Textarea
              id={ids.reason}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick reasons">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason((cur) => (cur ? `${cur.replace(/[.\s]+$/, "")}. ${r}` : r))}
              className="border-line-strong bg-surface text-ink hover:bg-primary-soft min-h-11 rounded-full border px-4 text-sm font-medium"
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Checkbox
          id={ids.consent}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          label={
            <>
              I understand this is an online consultation, not for emergencies, and the doctor may
              ask me to visit in person. I agree to the{" "}
              <Link href="/terms" className="text-primary underline">
                terms
              </Link>
              .
            </>
          }
          description="Draft wording, pending legal review."
        />
        {errors.consent ? (
          <p role="alert" className="text-danger mt-1.5 text-sm">
            {errors.consent}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="lg" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" size="lg">
          Review and pay
        </Button>
      </div>
    </form>
  );
}
