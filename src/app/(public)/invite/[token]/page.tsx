import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { InviteAccept } from "@/components/auth/invite-accept";

// The link in an invitation email. The token is the credential: the page is never indexed, sends
// no Referer, and the token is only used by the two calls in InviteAccept.
export const metadata: Metadata = {
  title: "Set up your staff account | ViniCure",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell
      variant="staff"
      title="Set up your staff account"
      intro="You were invited to ViniCure. Add an authenticator app, then choose a password."
      promises={[
        "Your account needs two steps at every sign-in: your password and a code from your authenticator app.",
        "Save your backup codes. They are the only way in if you lose your phone.",
        "This link works once and expires 72 hours after it was sent.",
        "Never share this link, your password or your codes with anyone.",
      ]}
    >
      <InviteAccept token={token} />
    </AuthShell>
  );
}
