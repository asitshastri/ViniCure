import { DashboardShell } from "@/components/shell/dashboard-shell";
import { getSession } from "@/lib/data/session";

export default function DoctorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = getSession("doctor");
  return (
    <DashboardShell role="doctor" user={session.user} notifications={session.notifications}>
      {children}
    </DashboardShell>
  );
}
