import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Choose a new password | ViniCure" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  return (
    <AuthShell
      variant="staff"
      title="Choose a new password"
      intro="Pick something you do not use anywhere else."
      promises={[
        "Use 12 or more characters with letters, a number and a symbol.",
        "A password manager is the easiest way to keep it safe.",
        "Your two-step sign-in stays on.",
      ]}
    >
      <ResetPasswordForm expired={state === "expired"} />
    </AuthShell>
  );
}
