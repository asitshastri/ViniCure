import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { StaffSignIn } from "@/components/auth/staff-sign-in";

export const metadata: Metadata = { title: "Staff sign in | ViniCure" };

export default function StaffLoginPage() {
  return (
    <AuthShell
      variant="staff"
      title="Doctor and staff sign in"
      intro="Use your work email. We ask for a second step every time."
      promises={[
        "Every sign-in needs your password and a code from your authenticator app.",
        "Access to patient information is logged and reviewed.",
        "Never share your code or backup codes, not even with ViniCure staff.",
        "Sign out when you leave a shared computer.",
      ]}
      footer={
        <p>
          Patient?{" "}
          <Link href="/login" className="text-primary font-semibold underline">
            Sign in with your mobile number
          </Link>
          . New doctor?{" "}
          <Link href="/for-doctors" className="text-primary font-semibold underline">
            Apply to join
          </Link>
          .
        </p>
      }
    >
      <StaffSignIn />
    </AuthShell>
  );
}
