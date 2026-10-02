import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Change password", robots: { index: false } };

// UI only. In P2 this moves under the signed-in staff area and needs a real session (see TODO DISCOVERED).
export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}
