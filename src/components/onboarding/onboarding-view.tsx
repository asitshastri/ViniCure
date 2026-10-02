"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle, Circle } from "@phosphor-icons/react/ssr";
import { Notice } from "@/components/auth/notice";
import { SectionCard } from "@/components/profile/section-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { saveDraft, submitApplication } from "@/lib/data/application";
import { declarationSchema, detailsSchema } from "@/lib/schemas/application";
import { fieldErrors } from "@/lib/schemas/auth";
import type { ApplicationStatus, DoctorApplication } from "@/lib/types";
import { DetailsForm } from "./details-form";
import { DocumentsPanel } from "./documents-panel";

const STEPS = ["Fill in", "Submitted", "In review", "Approved"];
const stepIndex: Record<ApplicationStatus, number> = {
  draft: 0,
  submitted: 1,
  in_review: 2,
  changes_needed: 2,
  approved: 3,
};

export function OnboardingView({ initial }: { initial: DoctorApplication }) {
  const uid = useId();
  const { toast } = useToast();
  const [status, setStatus] = useState(initial.status);
  const [details, setDetails] = useState(initial.details);
  const [docs, setDocs] = useState(initial.docs);
  const [events, setEvents] = useState(initial.events);
  const [decl, setDecl] = useState({ truthful: false, verify: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [status]);

  const editable = status === "draft" || status === "changes_needed";
  const required = docs.filter((d) => d.required);
  const docsOk = required.every((d) => d.state === "uploaded" || d.state === "accepted");
  const pending = docs.filter((d) => d.state === "replace" || d.state === "rejected").length;
  const ids: Record<string, string> = {
    ...Object.fromEntries(
      [
        "name",
        "specialty",
        "registrationNumber",
        "council",
        "registrationYear",
        "experienceYears",
        "feeRupees",
        "bio",
        "languages",
        "qualifications",
      ].map((k) => [k, `${uid}-${k}`]),
    ),
    truthful: `${uid}-truthful`,
    verify: `${uid}-verify`,
  };

  const checklist = [
    {
      ok: detailsSchema.safeParse(details).success,
      text: "Your professional details are complete",
    },
    { ok: docsOk, text: "All required documents are uploaded" },
    { ok: pending === 0, text: "No document is waiting to be replaced" },
    { ok: decl.truthful && decl.verify, text: "You confirmed the declarations" },
  ];

  async function submit() {
    const found: Record<string, string> = {};
    const d = detailsSchema.safeParse(details);
    if (!d.success) Object.assign(found, fieldErrors(d.error));
    const c = declarationSchema.safeParse(decl);
    if (!c.success) Object.assign(found, fieldErrors(c.error));
    if (Object.keys(found).length) {
      setErrors(found);
      setAttempt((a) => a + 1);
      return;
    }
    setErrors({});
    setBusy("submit");
    await submitApplication();
    setBusy(null);
    setStatus("submitted");
    setDocs((l) => l.map((x) => (x.state === "replace" ? { ...x, state: "uploaded" } : x)));
    setEvents((e) => [
      {
        when: "Just now",
        text:
          status === "changes_needed"
            ? "You sent your changes for review."
            : "You submitted your application.",
      },
      ...e,
    ]);
    toast({
      tone: "success",
      title: "Application submitted",
      description: "We will check your registration and email you.",
    });
  }

  async function save() {
    setBusy("draft");
    await saveDraft();
    setBusy(null);
    toast({ tone: "success", title: "Draft saved" });
  }

  const banner = {
    draft: {
      tone: "info" as const,
      title: "Finish your application",
      text: "Fill in your details, upload your documents and submit. You can save a draft and come back.",
    },
    submitted: {
      tone: "info" as const,
      title: "Application received",
      text: "A reviewer will start soon. [Review time to be confirmed.] We email you at each step.",
    },
    in_review: {
      tone: "info" as const,
      title: "We are checking your registration",
      text: "We confirm your registration with the council and read your documents. You cannot edit while we do.",
    },
    changes_needed: {
      tone: "warning" as const,
      title: "We need a few changes",
      text: "Replace the documents marked below, then send your application again.",
    },
    approved: {
      tone: "info" as const,
      title: "You are approved",
      text: "Your profile is live and patients can book you.",
    },
  }[status];

  return (
    <div className="grid max-w-3xl gap-6">
      <section
        aria-labelledby="status-h"
        className="border-line bg-surface shadow-card grid gap-5 rounded-xl border p-5 sm:p-6"
      >
        <h2
          id="status-h"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          Application status
        </h2>
        <Stepper steps={STEPS} current={stepIndex[status]} />
        <Notice tone={banner.tone} title={banner.title}>
          {banner.text}
        </Notice>
        {status === "approved" ? (
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/doctor/dashboard">Go to dashboard</ButtonLink>
            <ButtonLink href="/doctors/d-1001" variant="secondary">
              See your public profile
            </ButtonLink>
          </div>
        ) : null}
        <details>
          <summary className="text-primary min-h-11 content-center font-semibold">History</summary>
          <ol className="text-ink-muted mt-2 grid gap-2 text-sm">
            {events.map((e) => (
              <li key={e.text + e.when}>
                <span className="text-ink font-medium">{e.when}.</span> {e.text}
              </li>
            ))}
          </ol>
        </details>
      </section>

      <SectionCard
        id="details"
        title="Professional details"
        description={
          editable
            ? "We check these against the medical council. Please enter them exactly as registered."
            : "Locked while we review. Contact support to change something."
        }
      >
        <DetailsForm
          value={details}
          onChange={setDetails}
          readOnly={!editable}
          errors={errors}
          attempt={attempt}
          ids={ids}
        />
      </SectionCard>

      <SectionCard
        id="docs"
        title="Documents"
        description="Private. Only the review team can open them. PDF, JPG or PNG, up to 10 MB each."
      >
        <DocumentsPanel docs={docs} onChange={setDocs} editable={editable} />
      </SectionCard>

      {editable ? (
        <SectionCard
          id="submit"
          title={status === "changes_needed" ? "Send for review again" : "Submit your application"}
        >
          <div className="grid gap-5">
            <div className="grid gap-3">
              <Checkbox
                id={ids.truthful}
                checked={decl.truthful}
                onChange={(e) => setDecl({ ...decl, truthful: e.target.checked })}
                label="I confirm that everything I entered and uploaded is true and mine."
              />
              <Checkbox
                id={ids.verify}
                checked={decl.verify}
                onChange={(e) => setDecl({ ...decl, verify: e.target.checked })}
                label="I agree that ViniCure may check my registration with the medical council."
                description="Draft wording, pending legal review."
              />
              {errors.truthful || errors.verify ? (
                <p role="alert" className="text-danger text-sm">
                  {errors.truthful ?? errors.verify}
                </p>
              ) : null}
            </div>
            <ul aria-label="Before you submit" className="grid gap-2">
              {checklist.map((c) => (
                <li
                  key={c.text}
                  className={`flex items-center gap-2 text-sm ${c.ok ? "text-success" : "text-ink-muted"}`}
                >
                  {c.ok ? (
                    <CheckCircle aria-hidden weight="fill" className="size-5" />
                  ) : (
                    <Circle aria-hidden className="size-5" />
                  )}
                  <span>
                    {c.text}
                    <span className="sr-only">{c.ok ? ", done" : ", not yet"}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                loading={busy === "submit"}
                disabled={!docsOk || pending > 0}
                aria-describedby="submit-note"
                onClick={() => void submit()}
              >
                {status === "changes_needed" ? "Send for review" : "Submit application"}
              </Button>
              {status === "draft" ? (
                <Button
                  size="lg"
                  variant="secondary"
                  loading={busy === "draft"}
                  onClick={() => void save()}
                >
                  Save draft
                </Button>
              ) : null}
            </div>
            <p id="submit-note" className="text-ink-muted text-sm">
              {pending > 0
                ? "Replace the documents marked above first."
                : !docsOk
                  ? "Upload all required documents to submit."
                  : "You can edit again only if we ask for changes."}
            </p>
          </div>
        </SectionCard>
      ) : null}
      <p className="text-ink-muted text-sm">
        Questions?{" "}
        <Link href="/support" className="text-primary underline">
          Contact support
        </Link>
        .
      </p>
    </div>
  );
}
