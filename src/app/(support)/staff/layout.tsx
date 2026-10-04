import { DashboardShell } from "@/components/shell/dashboard-shell";
import { BreakGlassBanner } from "@/components/staff/break-glass-banner";
import { requireRole } from "@/modules/identity/page-guard-next";
import { getSession } from "@/lib/data/session";

export default async function SupportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const who = await requireRole(["support"]);
  const session = getSession("support");
  const user = who.displayName ? { ...session.user, name: who.displayName } : session.user;
  return (
    <DashboardShell role="support" user={user} notifications={session.notifications}>
      <BreakGlassBanner />
      {children}
    </DashboardShell>
  );
}
