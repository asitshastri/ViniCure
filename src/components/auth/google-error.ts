/** Words for the error Better Auth puts in the address when a Google sign-in is refused. */
export function googleErrorText(code: string | undefined): string | null {
  if (!code) return null;
  if (
    code === "account_not_linked" ||
    code === "email_does_not_match" ||
    code === "unable_to_link_account"
  ) {
    return "That Google account could not be used. If you already have a ViniCure account, sign in with your mobile number, then add Google from your settings.";
  }
  if (code === "access_denied") return "Google sign-in was cancelled.";
  return "Google sign-in did not work. Try again, or use your mobile number.";
}
