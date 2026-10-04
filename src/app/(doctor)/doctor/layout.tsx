import { DashboardShell } from "@/components/shell/dashboard-shell";
import { requireRole } from "@/modules/identity/page-guard-next";
import { getSession } from "@/lib/data/session";

export default async function DoctorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRole(["doctor"]);
  const session = getSession("doctor");
  return (
    <DashboardShell role="doctor" user={session.user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
