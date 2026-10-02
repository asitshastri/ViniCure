"use client";

import { useId, useState } from "react";
import { Trash } from "@phosphor-icons/react/ssr";
import { ErrorSummary } from "@/components/auth/error-summary";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fieldErrors } from "@/lib/schemas/auth";
import { detailsSchema, qualificationSchema } from "@/lib/schemas/application";
import type { DoctorApplication } from "@/lib/types";
import { COUNCILS, LANGUAGE_CHOICES, SPECIALTIES_FOR_APPLICATION } from "@/mocks/application";

type Details = DoctorApplication["details"];

export type DetailsFormApi = { validate: () => boolean };

type Props = {
  value: Details;
  onChange: (d: Details) => void;
  readOnly: boolean;
  errors: Record<string, string>;
  attempt: number;
  ids: Record<string, string>;
};

/** Controlled form. The parent owns the values and the errors, so the whole application can be checked at submit. */
export function DetailsForm({ value: v, onChange, readOnly, errors, attempt, ids }: Props) {
  const uid = useId();
  const [q, setQ] = useState({ degree: "", college: "", year: "" });
  const [qErr, setQErr] = useState<Record<string, string>>({});
  const set = <K extends keyof Details>(k: K, val: Details[K]) => onChange({ ...v, [k]: val });
  const text = (k: keyof Details) => (e: { target: { value: string } }) =>
    set(k, e.target.value as never);

  function addQualification() {
    const p = qualificationSchema.safeParse(q);
    if (!p.success) return setQErr(fieldErrors(p.error));
    setQErr({});
    set("qualifications", [...v.qualifications, { id: `q-${Date.now()}`, ...p.data }]);
    setQ({ degree: "", college: "", year: "" });
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      </div>
      <Field
        inputId={ids.name!}
        label="Full name"
        hint="As on your registration."
        error={errors.name}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.name}
            value={v.name}
            disabled={readOnly}
            onChange={text("name")}
            autoComplete="name"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field inputId={ids.specialty!} label="Specialty" error={errors.specialty} required>
        {({ describedBy, invalid }) => (
          <Select
            id={ids.specialty}
            value={v.specialty}
            disabled={readOnly}
            onChange={text("specialty")}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <option value="">Choose</option>
            {SPECIALTIES_FOR_APPLICATION.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        inputId={ids.registrationNumber!}
        label="Medical council registration number"
        hint="Shown on your profile and every prescription."
        error={errors.registrationNumber}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.registrationNumber}
            value={v.registrationNumber}
            disabled={readOnly}
            onChange={text("registrationNumber")}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field inputId={ids.council!} label="Medical council" error={errors.council} required>
        {({ describedBy, invalid }) => (
          <Select
            id={ids.council}
            value={v.council}
            disabled={readOnly}
            onChange={text("council")}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <option value="">Choose</option>
            {COUNCILS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        inputId={ids.registrationYear!}
        label="Year registered"
        error={errors.registrationYear}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.registrationYear}
            value={v.registrationYear}
            disabled={readOnly}
            onChange={text("registrationYear")}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field
        inputId={ids.experienceYears!}
        label="Years of experience"
        error={errors.experienceYears}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.experienceYears}
            value={v.experienceYears}
            disabled={readOnly}
            onChange={text("experienceYears")}
            inputMode="numeric"
            maxLength={2}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field
        inputId={ids.feeRupees!}
        label="Consultation fee (₹)"
        hint="For a video consultation. You can change it later."
        error={errors.feeRupees}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.feeRupees}
            value={v.feeRupees}
            disabled={readOnly}
            onChange={text("feeRupees")}
            inputMode="numeric"
            maxLength={5}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>

      <fieldset id={ids.languages} tabIndex={-1} className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">
          Languages you consult in{" "}
          <span aria-hidden className="text-danger">
            *
          </span>
        </legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
          {LANGUAGE_CHOICES.map((l) => (
            <Checkbox
              key={l}
              label={l}
              checked={v.languages.includes(l)}
              disabled={readOnly}
              onChange={(e) =>
                set(
                  "languages",
                  e.target.checked ? [...v.languages, l] : v.languages.filter((x) => x !== l),
                )
              }
              className="min-h-11"
            />
          ))}
        </div>
        {errors.languages ? (
          <p role="alert" className="text-danger mt-1 text-sm">
            {errors.languages}
          </p>
        ) : null}
      </fieldset>

      <Field
        inputId={ids.bio!}
        label="About you (optional)"
        hint="Patients read this on your profile. Plain words work best."
        error={errors.bio}
        className="sm:col-span-2"
      >
        {({ describedBy, invalid }) => (
          <Textarea
            id={ids.bio}
            value={v.bio}
            disabled={readOnly}
            onChange={text("bio")}
            maxLength={500}
            className="min-h-24"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>

      <fieldset id={ids.qualifications} tabIndex={-1} className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">
          Qualifications{" "}
          <span aria-hidden className="text-danger">
            *
          </span>
        </legend>
        {v.qualifications.length ? (
          <ul className="divide-line border-line mb-3 divide-y rounded-xl border">
            {v.qualifications.map((x) => (
              <li key={x.id} className="flex items-center gap-3 p-3">
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{x.degree}</span>
                  <span className="text-ink-muted">
                    . {x.college}, {x.year}
                  </span>
                </p>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    aria-label={`Remove ${x.degree}`}
                    onClick={() =>
                      set(
                        "qualifications",
                        v.qualifications.filter((y) => y.id !== x.id),
                      )
                    }
                  >
                    <Trash aria-hidden className="size-4" /> Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {errors.qualifications ? (
          <p role="alert" className="text-danger mb-2 text-sm">
            {errors.qualifications}
          </p>
        ) : null}
        {!readOnly ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem_auto] sm:items-end">
            <Field inputId={`${uid}-qd`} label="Degree" error={qErr.degree}>
              {({ describedBy, invalid }) => (
                <Input
                  id={`${uid}-qd`}
                  value={q.degree}
                  onChange={(e) => setQ({ ...q, degree: e.target.value })}
                  autoComplete="off"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
            <Field inputId={`${uid}-qc`} label="College" error={qErr.college}>
              {({ describedBy, invalid }) => (
                <Input
                  id={`${uid}-qc`}
                  value={q.college}
                  onChange={(e) => setQ({ ...q, college: e.target.value })}
                  autoComplete="off"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
            <Field inputId={`${uid}-qy`} label="Year" error={qErr.year}>
              {({ describedBy, invalid }) => (
                <Input
                  id={`${uid}-qy`}
                  value={q.year}
                  onChange={(e) => setQ({ ...q, year: e.target.value })}
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
            <Button type="button" variant="secondary" onClick={addQualification}>
              Add
            </Button>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}

export { detailsSchema };
