import { withApi } from "@/lib/api/with-api";
import { googleSignInEnabled, signInMethodsOf } from "@/modules/identity";

// Which ways of signing in the caller's account has (P2-17), for the settings page. Booleans
// only: nothing about the Google account itself is stored or shown.

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/me/sign-in-methods",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "auth_read",
    doc: { summary: "Which sign-in methods the account has", tags: ["identity"] },
  },
  async ({ actor }) => {
    const methods = await signInMethodsOf(actor.userId);
    return { phone: methods.phone, google: methods.google, googleAvailable: googleSignInEnabled() };
  },
);
