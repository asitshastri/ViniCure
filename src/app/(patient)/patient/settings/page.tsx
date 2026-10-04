import type { Metadata } from "next";
import { SignInMethodsPanel } from "@/components/profile/sign-in-methods";
import { SectionCard } from "@/components/profile/section-card";
import { ConsentPanel, DataPanel, SessionsPanel } from "@/components/profile/settings-panels";
import { PageHeader } from "@/components/shell/page-header";
import { getConsents, getSessions } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your consent, sign-ins and data. You are in control."
      />
      <div className="grid max-w-3xl gap-6">
        <SectionCard
          id="consent"
          title="Your consent"
          description="Choose how we may use your information. You can change this at any time."
        >
          <ConsentPanel initial={getConsents()} />
        </SectionCard>
        <SectionCard
          id="methods"
          title="Ways to sign in"
          description="Your mobile number, and Google if you add it."
        >
          <SignInMethodsPanel />
        </SectionCard>
        <SectionCard
          id="sessions"
          title="Where you are signed in"
          description="Each device that can open your account."
        >
          <SessionsPanel initial={getSessions()} />
        </SectionCard>
        <SectionCard
          id="data"
          title="Your data"
          description="Download a copy or ask us to delete your account."
        >
          <DataPanel />
        </SectionCard>
      </div>
    </>
  );
}
