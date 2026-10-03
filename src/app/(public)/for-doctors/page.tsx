import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { DoctorApplyForm } from "@/components/auth/doctor-apply";

export const metadata: Metadata = { title: "Join as a doctor | ViniCure" };

export default function ForDoctorsPage() {
  return (
    <AuthShell
      title="Join ViniCure as a doctor"
      intro="Start with the basics. You add documents after you confirm your email."
      promises={[
        "We check your registration with the medical council before you go live.",
        "You set your own fee and hours.",
        "Your registration number appears on every prescription.",
        "Patient records are visible only for consultations assigned to you.",
      ]}
      footer={
        <p>
          Already applied?{" "}
          <Link href="/login/staff" className="text-primary font-semibold underline">
            Sign in
          </Link>
          .
        </p>
      }
    >
      <DoctorApplyForm />
    </AuthShell>
  );
}
