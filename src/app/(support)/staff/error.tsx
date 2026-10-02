"use client";

import { ErrorPanel } from "@/components/states/error-panel";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      reference={error.digest}
      onRetry={reset}
      homeHref="/staff/queue"
      homeLabel="Go to the queue"
    />
  );
}
