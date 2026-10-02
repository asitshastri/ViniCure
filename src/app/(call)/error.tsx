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
    <div className="flex min-h-dvh items-center justify-center p-4">
      <ErrorPanel
        title="The call page did not load"
        description="Your consultation is not lost. Try again. If the doctor is waiting, we keep your place for a few minutes."
        reference={error.digest}
        onRetry={reset}
        homeHref="/patient/appointments"
        homeLabel="Go to my appointments"
      />
    </div>
  );
}
