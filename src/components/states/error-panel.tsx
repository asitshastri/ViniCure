"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { WarningCircle } from "@phosphor-icons/react/ssr";
import { Button, buttonStyles } from "@/components/ui/button";

type Props = {
  title?: string;
  description?: ReactNode;
  /** The code from the server error, so support can find it in the logs. */
  reference?: string;
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
  /** Use a lower heading when the panel sits inside a larger page, such as a gallery. */
  as?: "h1" | "h3";
  focusHeading?: boolean;
};

/** What a person sees when a page fails. Says what happened, that their data is safe, and what to do next. */
export function ErrorPanel({
  title = "This page did not load",
  description = "Something went wrong on our side. Nothing you entered was lost. Try again in a moment.",
  reference,
  onRetry,
  homeHref = "/",
  homeLabel = "Go to the home page",
  as: Heading = "h1",
  focusHeading = true,
}: Props) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) ref.current?.focus();
  }, [focusHeading]);
  return (
    <div className="border-line-strong bg-surface mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
      <span
        aria-hidden
        className="bg-danger-soft text-danger flex size-14 items-center justify-center rounded-full"
      >
        <WarningCircle weight="fill" className="size-7" />
      </span>
      <Heading
        ref={ref}
        tabIndex={-1}
        className="font-display text-ink text-2xl font-semibold outline-none"
      >
        {title}
      </Heading>
      <p className="text-ink-muted text-base">{description}</p>
      {reference ? (
        <p className="text-ink-muted text-sm">
          If it keeps happening, tell support this reference:{" "}
          <strong className="tabular-nums">{reference}</strong>
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
        <Link
          href={homeHref}
          className={buttonStyles({ variant: onRetry ? "secondary" : "primary" })}
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
