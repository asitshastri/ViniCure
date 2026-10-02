import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PatientAuth } from "@/components/auth/patient-auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  if (role === "staff") redirect("/login/staff");
  return <PatientAuth mode="signin" />;
}
