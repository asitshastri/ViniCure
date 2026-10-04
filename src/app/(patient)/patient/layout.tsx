import { DashboardShell } from "@/components/shell/dashboard-shell";
import { requireRole } from "@/modules/identity/page-guard-next";
import { getSession } from "@/lib/data/session";

export default async function PatientLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRole(["patient"]);
  const session = getSession("patient");
  return (
    <DashboardShell role="patient" user={session.user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
