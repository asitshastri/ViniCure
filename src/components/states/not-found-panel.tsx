import Link from "next/link";
import { Compass } from "@phosphor-icons/react/ssr";
import { buttonStyles } from "@/components/ui/button";

/** 404. Plain words, one clear way back. Heading is the page's h1. */
export function NotFoundPanel({
  homeHref = "/",
  homeLabel = "Go to the home page",
  extra,
  as: Heading = "h1",
}: {
  homeHref?: string;
  homeLabel?: string;
  extra?: { href: string; label: string };
  as?: "h1" | "h3";
}) {
  return (
    <div className="border-line-strong bg-surface mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
      <span
        aria-hidden
        className="bg-primary-soft text-primary flex size-14 items-center justify-center rounded-full"
      >
        <Compass className="size-7" />
      </span>
      <Heading className="font-display text-ink text-2xl font-semibold">
        We could not find that page
      </Heading>
      <p className="text-ink-muted text-base">
        The link may be old or mistyped, or the page may have moved. Nothing is wrong with your
        account.
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Link href={homeHref} className={buttonStyles()}>
          {homeLabel}
        </Link>
        {extra ? (
          <Link href={extra.href} className={buttonStyles({ variant: "secondary" })}>
            {extra.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
