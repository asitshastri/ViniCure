import type { Metadata } from "next";
import { PatientAuth } from "@/components/auth/patient-auth";

export const metadata: Metadata = { title: "Create your account" };

export default function RegisterPage() {
  return <PatientAuth mode="signup" />;
}
