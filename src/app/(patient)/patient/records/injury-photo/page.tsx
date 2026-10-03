import type { Metadata } from "next";
import { InjuryPhotoFlow } from "@/components/records/injury-photo-flow";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { getShareTargets } from "@/lib/data/records";

export const metadata: Metadata = { title: "Send an injury photo" };

export default async function InjuryPhotoPage({
  searchParams,
}: {
  searchParams: Promise<{ doctor?: string | string[] }>;
}) {
  const raw = (await searchParams).doctor;
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  const targets = getShareTargets();
  // Only a doctor the patient has an appointment with is accepted from the URL.
  const initial =
    targets.find((t) => t.doctorId === wanted)?.doctorId ?? targets[0]?.doctorId ?? "";
  return (
    <>
      <Breadcrumbs
        items={[{ label: "Health records", href: "/patient/records" }, { label: "Injury photo" }]}
        className="mb-3"
      />
      <PageHeader
        title="Send an injury photo"
        description="A clear photo helps your doctor understand the problem before the call."
      />
      <InjuryPhotoFlow targets={targets} initialDoctor={initial} />
    </>
  );
}
