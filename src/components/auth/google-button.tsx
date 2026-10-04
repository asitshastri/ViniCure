"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "./notice";

// "Continue with Google" (P2-17). The browser asks our server to start the sign-in; the server
// answers with Google's address and remembers the state. Nothing from Google reaches the page.
// The button is shown only when Google is configured on the server.

type Props = {
  /** "signin": sign in or create an account. "link": add Google to the signed-in account. */
  mode: "signin" | "link";
  label?: string;
  /** Where to land afterwards. A path on this site. */
  returnTo?: string;
};

export function GoogleButton({ mode, label, returnTo }: Props) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setProblem(null);
    const land = returnTo ?? (mode === "signin" ? "/patient/dashboard" : "/patient/settings");
    const fail = mode === "signin" ? "/login" : "/patient/settings";
    try {
      const response = await fetch(
        mode === "signin" ? "/api/auth/sign-in/social" : "/api/auth/link-social",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: "google", callbackURL: land, errorCallbackURL: fail }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { url?: string; code?: string };
      if (response.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setProblem(
        body.code === "FRESH_LOGIN_REQUIRED"
          ? "For your safety, sign in again with your mobile number first, then add Google."
          : "We could not start Google sign-in. Try again in a moment.",
      );
    } catch {
      setProblem("We could not start Google sign-in. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-3">
      <Button variant="secondary" size="lg" loading={busy} onClick={() => void start()}>
        <svg aria-hidden viewBox="0 0 24 24" className="size-5">
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.2 6.9 8.9 4.8 12 4.8Z"
          />
        </svg>
        {label ?? "Continue with Google"}
      </Button>
      {problem ? (
        <Notice tone="warning" title="Google sign-in">
          {problem}
        </Notice>
      ) : null}
    </div>
  );
}
