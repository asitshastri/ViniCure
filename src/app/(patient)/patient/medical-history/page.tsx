import type { Metadata } from "next";
import { HistoryForm } from "@/components/profile/history-form";
import { SectionCard } from "@/components/profile/section-card";
import { PageHeader } from "@/components/shell/page-header";
import { getHistory } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Medical history" };

export default function MedicalHistoryPage() {
  return (
    <>
      <PageHeader
        title="Medical history"
        description="Conditions, allergies and medicines help your doctor treat you safely."
      />
      <div className="max-w-3xl">
        <SectionCard id="history" title="What your doctor should know">
          <HistoryForm initial={getHistory()} />
        </SectionCard>
      </div>
    </>
  );
}
