"use client";

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { OfflineNotice, SlowNotice } from "@/components/states/connection-status";
import { ErrorPanel } from "@/components/states/error-panel";
import { LoadingView } from "@/components/states/loading-view";

function Inner({ children, homeHref }: { children: ReactNode; homeHref: string }) {
  const preview = useSearchParams().get("preview");
  if (preview === "loading") return <LoadingView />;
  if (preview === "error") {
    return (
      <ErrorPanel
        reference="VC-PREVIEW-0001"
        onRetry={() => window.location.assign(window.location.pathname)}
        homeHref={homeHref}
        homeLabel="Go to your dashboard"
      />
    );
  }
  return (
    <>
      {children}
      {preview === "offline" ? <OfflineNotice /> : null}
      {preview === "slow" ? <SlowNotice /> : null}
    </>
  );
}

/**
 * Prototype aid. Adding ?preview=loading, error, offline or slow to any page shows that state, so every page can
 * be reviewed in all its states. Remove in P10 when real loading and failure paths exist.
 */
export function StatePreview({
  children,
  homeHref = "/",
}: {
  children: ReactNode;
  homeHref?: string;
}) {
  return (
    <Suspense fallback={children}>
      <Inner homeHref={homeHref}>{children}</Inner>
    </Suspense>
  );
}
