import { DashboardShell } from "@/components/shell/dashboard-shell";
import { requireRole } from "@/modules/identity/page-guard-next";
import { getSession } from "@/lib/data/session";

export default async function DoctorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const who = await requireRole(["doctor"]);
  const session = getSession("doctor");
  const user = who.displayName ? { ...session.user, name: who.displayName } : session.user;
  return (
    <DashboardShell role="doctor" user={user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
