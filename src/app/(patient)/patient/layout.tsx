import { DashboardShell } from "@/components/shell/dashboard-shell";
import { requireRole } from "@/modules/identity/page-guard-next";
import { getSession } from "@/lib/data/session";

export default async function PatientLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const who = await requireRole(["patient"]);
  const session = getSession("patient");
  const user = who.displayName ? { ...session.user, name: who.displayName } : session.user;
  return (
    <DashboardShell role="patient" user={user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
