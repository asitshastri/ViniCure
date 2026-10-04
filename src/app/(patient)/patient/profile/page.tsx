import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyForm, PersonalForm } from "@/components/profile/personal-forms";
import { FamilyManager } from "@/components/profile/family-manager";
import { SectionCard } from "@/components/profile/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { getProfile } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Profile and family" };

export default function ProfilePage() {
  const profile = getProfile();
  return (
    <>
      <PageHeader
        title="Profile and family"
        description="Keep your details up to date. We ask only for what we need."
      />
      <div className="grid max-w-3xl gap-6">
        <SectionCard
          id="personal"
          title="Your details"
          description="Your doctor sees your name, age and language before a consultation."
        >
          <PersonalForm profile={profile} />
        </SectionCard>
        <SectionCard
          id="emergency"
          title="Emergency contact"
          description="Someone we can reach if there is a problem during a consultation."
        >
          <EmergencyForm profile={profile} />
        </SectionCard>
        <SectionCard
          id="family"
          title="Family members"
          description="Add parents or children to book care for them. Children under 18 are managed by you."
        >
          <FamilyManager />
        </SectionCard>
        <p className="text-ink-muted text-sm">
          We do not ask for your address, Aadhaar or PAN. Manage consent and sign-ins in{" "}
          <Link href="/patient/settings" className="text-primary underline">
            settings
          </Link>
          .
        </p>
      </div>
    </>
  );
}
