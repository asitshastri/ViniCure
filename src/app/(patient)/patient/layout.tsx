import { StepUpPanel } from "@/components/auth/step-up-panel";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { requireRole } from "@/modules/identity/page-guard-next";
import { getSession } from "@/lib/data/session";
import { googleSignInEnabled } from "@/modules/identity";

export default async function PatientLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const who = await requireRole(["patient"]);
  const session = getSession("patient");
  const user = who.displayName ? { ...session.user, name: who.displayName } : session.user;
  return (
    <DashboardShell role="patient" user={user} notifications={session.notifications}>
      {/* A limited session sees only the confirm-it-is-you card: no page of the patient's data. */}
      {who.limited ? <StepUpPanel googleAvailable={googleSignInEnabled()} /> : children}
    </DashboardShell>
  );
}
