import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { PatientAuth } from "@/components/auth/patient-auth";

export const metadata: Metadata = { title: "Create account | ViniCure" };

export default function RegisterPage() {
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
    </AuthShell>
  );
}
