import * as Sentry from "@sentry/nextjs";

// Runs once when the server starts. The Node-only work is in instrumentation-node.ts.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNode } = await import("./instrumentation-node");
  await registerNode();
}

export const onRequestError = Sentry.captureRequestError;
