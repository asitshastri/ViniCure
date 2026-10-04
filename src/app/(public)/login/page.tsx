import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { googleErrorText } from "@/components/auth/google-error";
import { Notice } from "@/components/auth/notice";
import { PatientAuth } from "@/components/auth/patient-auth";
import { googleSignInEnabled } from "@/modules/identity";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.login.metaTitle") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { t } = await getT();
  const { error } = await searchParams;
  const google = googleSignInEnabled();
  const errorText = googleErrorText(error);
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
      {errorText ? (
        <Notice tone="warning" title="Google sign-in" className="mb-6">
          {errorText}
        </Notice>
      ) : null}
      <PatientAuth mode="login" />
      {google ? (
        <div className="border-line mt-8 grid gap-4 border-t pt-6">
          <p className="text-ink-muted text-sm">Or continue with Google.</p>
          <GoogleButton mode="signin" />
        </div>
      ) : null}
    </AuthShell>
  );
}
