import { DashboardShell } from "@/components/shell/dashboard-shell";
import { requireRole } from "@/modules/identity/page-guard-next";
import { getSession } from "@/lib/data/session";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRole(["admin", "super_admin"]);
  const session = getSession("admin");
  return (
    <DashboardShell role="admin" user={session.user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
