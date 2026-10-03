"use client";

import Link from "next/link";
import { ShieldWarning, Timer } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import {
  clearBreakGlass,
  formatCountdown,
  useBreakGlass,
  useNow,
} from "@/components/staff/break-glass-store";

/** Shows on every staff page while a grant exists. The timer is for the eye; the spoken status changes only at set points. */
export function BreakGlassBanner() {
  const session = useBreakGlass();
  const now = useNow(Boolean(session));
  const left = session ? session.until - now : 0;
  const expired = Boolean(session) && left <= 0;
  const soon = !expired && left <= 120_000;
  const milestone = !session
    ? ""
    : expired
      ? "expired"
      : left <= 60_000
        ? "1min"
        : left <= 300_000
          ? "5min"
          : "active";

  if (!session) return null;
  return (
    <div
      className={
        expired
          ? "border-danger bg-danger-soft text-danger shadow-card sticky top-[4.5rem] z-30 mb-5 rounded-xl border p-4"
          : soon
            ? "border-warning bg-warning-soft text-warning shadow-card sticky top-[4.5rem] z-30 mb-5 rounded-xl border p-4"
            : "border-info bg-info-soft text-info shadow-card sticky top-[4.5rem] z-30 mb-5 rounded-xl border p-4"
      }
    >
      <p role="status" className="sr-only">
        {milestone === "5min"
          ? "Break-glass access ends in under 5 minutes."
          : milestone === "1min"
            ? "Break-glass access ends in under 1 minute."
            : milestone === "expired"
              ? "Break-glass access has ended."
              : `Break-glass access to ${session.patientName} is on.`}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ShieldWarning aria-hidden weight="fill" className="size-6 shrink-0" />
        <p className="min-w-0 flex-1 basis-60 font-medium">
          {expired ? (
            <>Access to {session.patientName}&rsquo;s record has ended.</>
          ) : (
            <>
              Break-glass access to {session.patientName}&rsquo;s record. Everything you open is
              logged and an admin was alerted.
            </>
          )}
        </p>
        {!expired ? (
          <p className="flex items-center gap-1.5 font-semibold tabular-nums" aria-hidden>
            <Timer className="size-5" />
            {formatCountdown(left)} left
          </p>
        ) : null}
        {expired ? (
          <>
            <Link
              href={`/staff/break-glass?patient=${session.patientId}`}
              className="min-h-11 content-center font-semibold underline"
            >
              Ask again
            </Link>
            <Button size="sm" variant="secondary" onClick={clearBreakGlass}>
              Dismiss
            </Button>
          </>
        ) : (
          <>
            <Link
              href="/staff/break-glass"
              className="min-h-11 content-center font-semibold underline"
            >
              Open record
            </Link>
            <Button size="sm" variant="secondary" onClick={clearBreakGlass}>
              End access now
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
