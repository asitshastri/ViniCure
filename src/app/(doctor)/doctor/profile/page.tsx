import type { Metadata } from "next";
import Link from "next/link";
import { PrototypeHint } from "@/components/auth/notice";
import { OnboardingView } from "@/components/onboarding/onboarding-view";
import { PageHeader } from "@/components/shell/page-header";
import { getApplication } from "@/lib/data/application";

export const metadata: Metadata = { title: "Profile and verification" };

const STATES = [
  ["", "new application"],
  ["almost", "ready to submit"],
  ["submitted", "submitted"],
  ["review", "in review"],
  ["changes", "changes needed"],
  ["approved", "approved"],
] as const;

export default async function DoctorProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const raw = (await searchParams).state ?? "";
  const state = STATES.some(([k]) => k === raw) ? raw : "";
  return (
    <>
      <PageHeader
        title="Profile and verification"
        description="Patients can book you only after we verify your registration."
      />
      <OnboardingView key={state} initial={getApplication(state)} />
      <PrototypeHint>
        <p>
          Show a state:{" "}
          {STATES.map(([k, label], i) => (
            <span key={label}>
              <Link
                className="underline"
                href={k ? `/doctor/profile?state=${k}` : "/doctor/profile"}
              >
                {label}
              </Link>
              {i < STATES.length - 1 ? ", " : ""}
            </span>
          ))}
          . A file name containing “virus” is rejected by the safety check.
        </p>
      </PrototypeHint>
    </>
  );
}
