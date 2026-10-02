import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/auth/notice";
import { ConsoleFlow } from "@/components/console/console-flow";
import { ButtonLink } from "@/components/ui/button";
import { getConsultContext } from "@/lib/data/console";

export const metadata: Metadata = { title: "Consultation console", robots: { index: false } };

// Only the assigned doctor may open this. The Phase F page trusts the URL; P7 checks the session and the assignment.
export default async function ConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = getConsultContext((await params).id);
  if (!ctx) notFound();
  if (ctx.consult.status !== "upcoming") {
    return (
      <div className="mx-auto grid max-w-xl gap-4 px-4 py-16">
        <Notice tone="warning" title="This consultation is closed">
          It has finished, was cancelled, or the patient did not join.
        </Notice>
        <div>
          <ButtonLink href="/doctor/consultations">Back to consultations</ButtonLink>
        </div>
      </div>
    );
  }
  return <ConsoleFlow ctx={ctx} />;
}
