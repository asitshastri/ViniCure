import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { PrototypeHint } from "@/components/auth/notice";
import { BreakGlassFlow } from "@/components/staff/break-glass-flow";
import { getPatients } from "@/lib/data/staff";

export const metadata: Metadata = { title: "Break-glass access" };

export default async function BreakGlassPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const patients = getPatients().map((p) => ({ id: p.id, name: p.name }));
  const patient = patients.some((p) => p.id === one("patient")) ? one("patient") : undefined;
  const ticket = /^T-\d{3,6}$/.test(one("ticket") ?? "") ? one("ticket") : undefined;
  const state = one("state");
  return (
    <>
      <PageHeader
        title="Break-glass access"
        description="Support cannot read health records. When you truly need one, ask for time-limited access with a reason."
      />
      <div className="mb-6">
        <PrototypeHint>
          <a className="underline" href="/staff/break-glass?state=expiring&patient=u-1012">
            Access ending in 15 seconds
          </a>
          {" · "}
          <a className="underline" href="/staff/break-glass?state=expired&patient=u-1012">
            Access already ended
          </a>
          {" · "}
          <a className="underline" href="/staff/break-glass">
            Request form
          </a>
        </PrototypeHint>
      </div>
      <BreakGlassFlow
        patients={patients}
        initialPatient={patient}
        initialTicket={ticket}
        seed={state === "expiring" || state === "expired" ? state : undefined}
      />
    </>
  );
}
