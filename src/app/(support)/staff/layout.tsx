import { DashboardShell } from "@/components/shell/dashboard-shell";
import { BreakGlassBanner } from "@/components/staff/break-glass-banner";
import { getSession } from "@/lib/data/session";

export default function SupportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = getSession("support");
  return (
    <DashboardShell role="support" user={session.user} notifications={session.notifications}>
      <BreakGlassBanner />
      {children}
    </DashboardShell>
  );
}
