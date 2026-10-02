import type { Metadata } from "next";
import { StaffAuth } from "@/components/auth/staff-auth";

export const metadata: Metadata = { title: "Doctor and staff sign in" };

export default function StaffLoginPage() {
  return <StaffAuth />;
}
