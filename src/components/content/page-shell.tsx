import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { cn } from "@/lib/cn";
import { DraftBanner } from "./draft-banner";

type PageShellProps = {
  title: string;
  intro?: string;
  draft?: boolean;
  /** Narrow reading column for long text. */
  prose?: boolean;
  children: ReactNode;
  className?: string;
};

export function PageShell({
  title,
  intro,
  draft = false,
  prose = false,
  children,
  className,
}: PageShellProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: title }]} className="mb-6" />
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold sm:text-5xl">{title}</h1>
        {intro ? <p className="text-ink-muted mt-4 text-lg sm:text-xl">{intro}</p> : null}
      </header>
      {draft ? (
        <div className="mt-6 max-w-3xl">
          <DraftBanner />
        </div>
      ) : null}
      <div className={cn("mt-10", prose && "max-w-3xl", className)}>{children}</div>
    </div>
  );
}
