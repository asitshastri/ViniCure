import { DashboardShell } from "@/components/shell/dashboard-shell";
import { requireRole } from "@/modules/identity/page-guard-next";
import { getSession } from "@/lib/data/session";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const who = await requireRole(["admin", "super_admin"]);
  const session = getSession("admin");
  const user = who.displayName ? { ...session.user, name: who.displayName } : session.user;
  return (
    <DashboardShell role="admin" user={user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
