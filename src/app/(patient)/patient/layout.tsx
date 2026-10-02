import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getSession } from "@/lib/data/session";

export default function PatientLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = getSession("patient");
  return (
    <DashboardShell role="patient" user={session.user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
