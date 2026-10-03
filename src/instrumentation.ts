// Runs once when the server starts. In production an invalid configuration
// stops the process here, before any request is served.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getConfig } = await import("./lib/config/config");
  getConfig();
}
