import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { KycBoard } from "@/components/admin/kyc-board";
import { getKyc } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Doctor KYC review" };

export default function KycPage() {
  return (
    <>
      <PageHeader
        title="Doctor review"
        description="Check each application against the medical council register before approving. Every decision and every document opened is logged."
      />
      <KycBoard items={getKyc()} />
    </>
  );
}
