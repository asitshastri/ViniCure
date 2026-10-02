import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { ChangePasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Change password | ViniCure" };

// Moves into the signed-in settings area when the real session exists (P2-10). For now it is public so it can be reviewed.
export default function ChangePasswordPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Change password"
        description="Staff accounts only. Patients sign in with a mobile number."
      />
      <div className="border-line bg-surface shadow-card mt-6 rounded-xl border p-6 sm:p-8">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
