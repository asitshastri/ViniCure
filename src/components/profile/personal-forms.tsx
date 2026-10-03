"use client";

import { useId, useState, type FormEvent } from "react";
import { ErrorSummary } from "@/components/auth/error-summary";
import { PrototypeHint } from "@/components/auth/notice";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveProfile, saveSimple } from "@/lib/data/profile";
import { fieldErrors } from "@/lib/schemas/auth";
import { EMERGENCY_RELATIONS, LANGUAGES, emergencyForm, personalForm } from "@/lib/schemas/profile";
import type { PatientProfile } from "@/lib/types";
import { SaveRow } from "./save-row";

export function PersonalForm({ profile }: { profile: PatientProfile }) {
  const uid = useId();
  const { toast } = useToast();
  const [v, setV] = useState({
    name: profile.name,
    email: profile.email,
    dob: profile.dob,
    sex: profile.sex as string,
    language: profile.language,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ids = {
    name: `${uid}-name`,
    email: `${uid}-email`,
    dob: `${uid}-dob`,
    sex: `${uid}-sex`,
    language: `${uid}-lang`,
  };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((c) => ({ ...c, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFailed(false);
    const parsed = personalForm.safeParse(v);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    const r = await saveProfile({ name: parsed.data.name });
    setBusy(false);
    if (r.status === "error") setFailed(true);
    else toast({ tone: "success", title: "Details saved" });
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      </div>
      <Field inputId={ids.name} label="Full name" error={errors.name} required>
        {({ describedBy, invalid }) => (
          <Input
            id={ids.name}
            value={v.name}
            onChange={set("name")}
            autoComplete="name"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field label="Mobile number" hint="To change it, we send a code to the new number.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            value={profile.phoneMasked}
            readOnly
            aria-describedby={describedBy}
            className="bg-canvas"
          />
        )}
      </Field>
      <Field
        inputId={ids.email}
        label="Email (optional)"
        hint="For receipts. Never used for sign-in."
        error={errors.email}
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.email}
            type="email"
            value={v.email}
            onChange={set("email")}
            autoComplete="email"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field inputId={ids.dob} label="Date of birth (optional)" error={errors.dob}>
        {({ describedBy, invalid }) => (
          <Input
            id={ids.dob}
            type="date"
            value={v.dob}
            onChange={set("dob")}
            autoComplete="bday"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field inputId={ids.sex} label="Sex (optional)" error={errors.sex}>
        {({ describedBy, invalid }) => (
          <Select
            id={ids.sex}
            value={v.sex}
            onChange={set("sex")}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
        )}
      </Field>
      <Field inputId={ids.language} label="Preferred language" error={errors.language} required>
        {({ describedBy, invalid }) => (
          <Select
            id={ids.language}
            value={v.language}
            onChange={set("language")}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
        )}
      </Field>
      <div className="sm:col-span-2">
        <SaveRow busy={busy} failed={failed} />
      </div>
      <div className="sm:col-span-2">
        <PrototypeHint>
          <p>Set the name to “Simulate Error” to see a failed save.</p>
        </PrototypeHint>
      </div>
    </form>
  );
}

export function EmergencyForm({ profile }: { profile: PatientProfile }) {
  const uid = useId();
  const { toast } = useToast();
  const [v, setV] = useState({ ...profile.emergency });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const ids = { name: `${uid}-ename`, relation: `${uid}-erel`, phone: `${uid}-ephone` };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((c) => ({ ...c, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = emergencyForm.safeParse(v);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy(true);
    await saveSimple();
    setBusy(false);
    toast({ tone: "success", title: "Emergency contact saved" });
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <ErrorSummary errors={errors} fieldIds={ids} attempt={attempt} />
      </div>
      <Field inputId={ids.name} label="Contact name" error={errors.name} required>
        {({ describedBy, invalid }) => (
          <Input
            id={ids.name}
            value={v.name}
            onChange={set("name")}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <Field inputId={ids.relation} label="Relation" error={errors.relation} required>
        {({ describedBy, invalid }) => (
          <Select
            id={ids.relation}
            value={v.relation}
            onChange={set("relation")}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          >
            <option value="">Choose</option>
            {EMERGENCY_RELATIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        inputId={ids.phone}
        label="Mobile number"
        hint="10 digits, without +91."
        error={errors.phone}
        required
      >
        {({ describedBy, invalid }) => (
          <Input
            id={ids.phone}
            type="tel"
            inputMode="numeric"
            value={v.phone}
            onChange={set("phone")}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <div className="sm:col-span-2">
        <SaveRow busy={busy} label="Save contact" />
      </div>
    </form>
  );
}
