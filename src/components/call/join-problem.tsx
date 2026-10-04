"use client";

import { useEffect } from "react";
import { Notice } from "@/components/auth/notice";
import { Button, ButtonLink } from "@/components/ui/button";
import { PermissionHelp } from "./permission-help";

export type ProblemKind =
  | "outside_window"
  | "not_paid"
  | "step_up"
  | "not_open"
  | "ended"
  | "not_found"
  | "unavailable"
  | "error"
  | "permission"
  | "device"
  | "network"
  | "token";

const COPY: Record<ProblemKind, { title: string; body: string; retry: boolean }> = {
  outside_window: {
    title: "It is not time to join yet",
    body: "You can join a few minutes before the booked time, and until a little after it ends. Come back then.",
    retry: true,
  },
  not_paid: {
    title: "Payment is needed before you can join",
    body: "This booking is not paid. Open your appointments to finish the payment.",
    retry: false,
  },
  step_up: {
    title: "Confirm it is you first",
    body: "For your safety, confirm with a recovery code or Google before joining. You can do this from your settings.",
    retry: false,
  },
  not_open: {
    title: "This consultation cannot be joined",
    body: "It may have been cancelled or finished. Look at your appointments for what to do next.",
    retry: false,
  },
  ended: {
    title: "This consultation has ended",
    body: "The doctor has closed it. Your records will show anything the doctor shared.",
    retry: false,
  },
  not_found: {
    title: "We could not find this consultation",
    body: "Open it from your appointments.",
    retry: false,
  },
  unavailable: {
    title: "Video is not available right now",
    body: "This is on our side. Your booking is safe. Try again in a moment.",
    retry: true,
  },
  error: {
    title: "We could not join the call",
    body: "Check your connection and try again.",
    retry: true,
  },
  permission: {
    title: "We need your microphone",
    body: "Allow the microphone for this site, then try again.",
    retry: true,
  },
  device: {
    title: "We could not find a microphone",
    body: "Check that a microphone is connected and not used by another app, then try again.",
    retry: true,
  },
  network: {
    title: "We could not reach the video service",
    body: "Check your network. A slower connection works too: choose audio only on the next screen.",
    retry: true,
  },
  token: {
    title: "The video service did not accept your entry",
    body: "Try again. If it keeps happening, contact support from the help link.",
    retry: true,
  },
};

export function JoinProblem({
  kind,
  message,
  onRetry,
}: {
  kind: ProblemKind;
  message?: string;
  onRetry: () => void;
}) {
  const copy = COPY[kind];
  useEffect(() => {
    document.getElementById("stage-h")?.focus();
  }, []);
  return (
    <div className="mx-auto grid max-w-xl gap-4 px-4 py-16">
      <h1 tabIndex={-1} id="stage-h" className="text-3xl font-semibold outline-none">
        {copy.title}
      </h1>
      <Notice tone="warning" title="What to do">
        {message ?? copy.body}
      </Notice>
      {kind === "permission" || kind === "device" ? (
        <PermissionHelp kind={kind === "permission" ? "blocked" : "missing"} />
      ) : null}
      <div className="flex flex-wrap gap-3">
        {copy.retry ? <Button onClick={onRetry}>Try again</Button> : null}
        <ButtonLink href="/patient/appointments" variant="secondary">
          Go to appointments
        </ButtonLink>
      </div>
    </div>
  );
}
