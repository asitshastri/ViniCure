// Server start-up for the Node.js runtime. In production an invalid configuration stops the
// process here, before any request is served. Next.js alone would log the error and keep
// serving, so the process is ended explicitly.
export async function registerNode(): Promise<void> {
  try {
    const { bootstrap } = await import("./lib/bootstrap");
    bootstrap();
  } catch (error) {
    // Names and reasons only; the config error never contains values.
    console.error(
      JSON.stringify({ level: "fatal", event: "boot_failed", message: (error as Error).message }),
    );
    if (process.env.NODE_ENV === "production") process.exit(1);
    throw error;
  }

  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    const Sentry = await import("@sentry/nextjs");
    const { sentryBaseOptions } = await import("./lib/observability/scrub");
    Sentry.init({
      ...sentryBaseOptions(dsn, process.env.SENTRY_ENVIRONMENT ?? process.env.APP_ENV ?? "unknown"),
    });
  }
}
