"use client";

import { useState } from "react";
import { Notice } from "./notice";
import { Button } from "@/components/ui/button";

// The "this was not me" link from a new-device notice (P2-18). One press ends every session and
// forgets every device; the next phone sign-in will have to confirm with a second method.

export function NotMe({ token }: { token: string }) {
  const [state, setState] = useState<"ask" | "busy" | "done" | "invalid">("ask");

  async function confirm() {
    setState("busy");
    try {
      const response = await fetch("/api/v1/security/not-me", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(response.ok ? "done" : "invalid");
    } catch {
      setState("invalid");
    }
  }

  if (state === "done") {
    return (
      <Notice tone="info" title="You are signed out everywhere">
        Every device was signed out. To open your account again you will need a recovery code or
        Google. If you do not have one, contact support.
      </Notice>
    );
  }
  if (state === "invalid") {
    return (
      <Notice tone="danger" title="This link is not valid">
        It may have expired or been used already. If you think someone else is using your account,
        sign in and choose “sign out of all devices” in settings, or contact support.
      </Notice>
    );
  }
  return (
    <div className="grid gap-5">
      <p className="text-ink text-lg">
        If you did not sign in, press the button. We will sign every device out and ask for extra
        proof the next time someone signs in with your number.
      </p>
      <Button variant="danger" size="lg" loading={state === "busy"} onClick={() => void confirm()}>
        This was not me. Sign everything out
      </Button>
    </div>
  );
}
