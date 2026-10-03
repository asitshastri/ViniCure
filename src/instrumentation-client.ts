import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/observability/scrub";

// Browser error reporting. Runs only when NEXT_PUBLIC_SENTRY_DSN is set.
// Events pass through the same scrubber as the server (no PII).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    ...sentryBaseOptions(dsn, process.env.NEXT_PUBLIC_APP_ENV ?? "unknown"),
    // No session replay: it would record the screen of a medical app.
    integrations: [],
  });
}

export const onRouterTransitionStart = dsn ? Sentry.captureRouterTransitionStart : undefined;
