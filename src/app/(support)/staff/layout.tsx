import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getSession } from "@/lib/data/session";

export default function SupportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = getSession("support");
  return (
    <DashboardShell role="support" user={session.user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
