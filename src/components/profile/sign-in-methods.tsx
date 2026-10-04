"use client";

import { useEffect, useState } from "react";
import { CheckCircle, DeviceMobile } from "@phosphor-icons/react/ssr";
import { GoogleButton } from "@/components/auth/google-button";
import { Badge } from "@/components/ui/badge";

type Methods = { phone: boolean; google: boolean; googleAvailable: boolean };

/** The ways this account can be opened. Adding Google needs a sign-in within the last 15 minutes. */
export function SignInMethodsPanel() {
  const [methods, setMethods] = useState<Methods | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/me/sign-in-methods", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("not ok");
        return (await response.json()) as Methods;
      })
      .then((value) => !cancelled && setMethods(value))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p role="alert" className="text-danger">
        We could not load your sign-in methods. Refresh the page to try again.
      </p>
    );
  }
  if (!methods) {
    return (
      <p role="status" className="text-ink-muted">
        Loading your sign-in methods.
      </p>
    );
  }
  return (
    <ul className="divide-line border-line divide-y rounded-xl border">
      <li className="flex flex-wrap items-center gap-3 p-4">
        <DeviceMobile aria-hidden className="text-primary size-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Mobile number and code</p>
          <p className="text-ink-muted text-sm">We send a 6 digit code each time you sign in.</p>
        </div>
        {methods.phone ? (
          <Badge tone="success">
            <CheckCircle aria-hidden weight="fill" className="size-4" /> Verified
          </Badge>
        ) : (
          <Badge tone="warning">Not verified</Badge>
        )}
      </li>
      {methods.googleAvailable ? (
        <li className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Google</p>
            <p className="text-ink-muted text-sm">
              A second way to open your account if your number changes.
            </p>
          </div>
          {methods.google ? (
            <Badge tone="success">Added</Badge>
          ) : (
            <div className="min-w-48">
              <GoogleButton mode="link" label="Add Google" />
            </div>
          )}
        </li>
      ) : null}
    </ul>
  );
}
