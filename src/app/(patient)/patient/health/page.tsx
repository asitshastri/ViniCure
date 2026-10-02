import type { Metadata } from "next";
import { VitalsView } from "@/components/profile/vitals-view";
import { PageHeader } from "@/components/shell/page-header";
import { getVitals } from "@/lib/data/profile";

export const metadata: Metadata = { title: "Vitals" };

export default function VitalsPage() {
  return (
    <>
      <PageHeader
        title="Vitals"
        description="Keep track of blood pressure, sugar, weight and more between consultations."
      />
      <VitalsView initial={getVitals()} />
    </>
  );
}
