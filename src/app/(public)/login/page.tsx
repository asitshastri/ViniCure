import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { PatientAuth } from "@/components/auth/patient-auth";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.login.metaTitle") };
}

export default async function LoginPage() {
  const { t } = await getT();
  return (
    <AuthShell
      title={t("auth.login.title")}
      intro={t("auth.login.intro")}
      privacyTitle={t("auth.privacyTitle")}
      promises={[t("auth.login.p1"), t("auth.login.p2"), t("auth.login.p3"), t("auth.login.p4")]}
      footer={
        <p>
          {t("auth.login.newTo")}{" "}
          <Link href="/register" className="text-primary font-semibold underline">
            {t("auth.login.createAccount")}
          </Link>
          . {t("auth.login.doctorOrStaff")}{" "}
          <Link href="/login/staff" className="text-primary font-semibold underline">
            {t("auth.login.signInHere")}
          </Link>
          .
        </p>
      }
    >
      <PatientAuth mode="login" />
    </AuthShell>
  );
}
