import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getSession } from "@/lib/data/session";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = getSession("admin");
  return (
    <DashboardShell role="admin" user={session.user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
