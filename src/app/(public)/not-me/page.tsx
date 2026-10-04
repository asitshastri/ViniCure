import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { NotMe } from "@/components/auth/not-me";

// The token in the address is the credential: never indexed, never sent on as a Referer.
export const metadata: Metadata = {
  title: "Report a sign-in | ViniCure",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function NotMePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell
      title="Was this you?"
      intro="We noticed a sign-in to your account from a device we did not know."
      promises={[
        "Pressing the button signs out every device at once.",
        "Your health information stays closed until you confirm with a recovery code or Google.",
        "We never ask for a code or a password in a message.",
      ]}
    >
      {token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? (
        <NotMe token={token} />
      ) : (
        <p className="text-ink-muted text-lg">
          This link is not complete. Open it again from the message we sent.
        </p>
      )}
    </AuthShell>
  );
}
