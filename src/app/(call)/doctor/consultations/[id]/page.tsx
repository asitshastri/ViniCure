import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/auth/notice";
import { ConsoleFlow } from "@/components/console/console-flow";
import { ButtonLink } from "@/components/ui/button";
import { getConsultContext } from "@/lib/data/console";
import { loadRealConsole } from "@/lib/data/console-real";
import { isRealDirectory } from "@/lib/data/directory-real";

export const metadata: Metadata = { title: "Consultation console", robots: { index: false } };

// Only the assigned doctor may open this. The Phase F page trusts the URL; P7 checks the session and the assignment.
export default async function ConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  // With the database configured this is the doctor's own booking (anyone else's is a 404, and
  // opening it is logged); without it the sample consultation stands in.
  if (isRealDirectory()) {
    const loaded = await loadRealConsole(id);
    if (loaded.status === "not_found") notFound();
    if (loaded.status === "closed") {
      return (
        <div className="mx-auto grid max-w-xl gap-4 px-4 py-16">
          <h1 className="sr-only">Consultation</h1>
          <Notice tone="warning" title="This consultation is closed">
            It has finished or was cancelled.
          </Notice>
          <div>
            <ButtonLink href="/doctor/consultations">Back to consultations</ButtonLink>
          </div>
        </div>
      );
    }
    return <ConsoleFlow ctx={loaded.ctx} real={{ appointmentId: loaded.appointmentId }} />;
  }
  const ctx = getConsultContext(id);
  if (!ctx) notFound();
  if (ctx.consult.status !== "upcoming") {
    return (
      <div className="mx-auto grid max-w-xl gap-4 px-4 py-16">
        <h1 className="sr-only">Consultation</h1>
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
