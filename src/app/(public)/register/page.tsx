import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { PatientAuth } from "@/components/auth/patient-auth";
import { googleSignInEnabled } from "@/modules/identity";

export const metadata: Metadata = { title: "Create account | ViniCure" };

export default function RegisterPage() {
  const google = googleSignInEnabled();
  return (
    <AuthShell
      title="Create your account"
      intro="Takes about a minute. You only need a mobile number."
      promises={[
        "We ask for your name and mobile number only. No Aadhaar or PAN.",
        "Add medical history later, only when you want to share it.",
        "You choose which doctor can see which record.",
        "Withdraw consent or delete your data from settings.",
      ]}
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-semibold underline">
            Sign in
          </Link>
          .
        </p>
      }
    >
      <PatientAuth mode="register" />
      {google ? (
        <div className="border-line mt-8 grid gap-4 border-t pt-6">
          <p className="text-ink-muted text-sm">
            Or start with Google. You can add your mobile number afterwards.
          </p>
          <GoogleButton mode="signin" label="Sign up with Google" />
        </div>
      ) : null}
    </AuthShell>
  );
}
