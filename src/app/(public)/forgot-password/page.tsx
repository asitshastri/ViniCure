import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Reset password | ViniCure" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      variant="staff"
      title="Reset your password"
      intro="Enter your work email and we send a reset link."
      promises={[
        "The link works once and expires in 30 minutes.",
        "We never say whether an email has an account.",
        "After a reset you are signed out on every device.",
        "Patients sign in with a mobile number and have no password to reset.",
      ]}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
