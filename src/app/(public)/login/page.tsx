import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { PatientAuth } from "@/components/auth/patient-auth";

export const metadata: Metadata = { title: "Sign in | ViniCure" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in with your mobile number"
      intro="No password to remember. We text you a code."
      promises={[
        "Your number is used to sign you in and to send appointment reminders.",
        "Doctors see your health details only for consultations you book.",
        "Records are encrypted and stored in India.",
        "You can see who opened your records and delete your account any time.",
      ]}
      footer={
        <p>
          New to ViniCure?{" "}
          <Link href="/register" className="text-primary font-semibold underline">
            Create an account
          </Link>
          . Doctor or staff?{" "}
          <Link href="/login/staff" className="text-primary font-semibold underline">
            Sign in here
          </Link>
          .
        </p>
      }
    >
      <PatientAuth mode="login" />
    </AuthShell>
  );
}
