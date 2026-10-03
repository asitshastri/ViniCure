import type { Metadata } from "next";
import { ReferralView } from "@/components/profile/referral-view";
import { PageHeader } from "@/components/shell/page-header";
import { getReferral } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Refer a friend" };

export default function ReferralPage() {
  return (
    <>
      <PageHeader
        title="Refer a friend"
        description="Help someone you care about reach a registered doctor."
      />
      <ReferralView info={getReferral()} />
    </>
  );
}
