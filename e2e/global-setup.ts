import { Redis } from "ioredis";
import { E2E_ENV } from "../playwright.config";
import { startStub } from "./razorpay-stub";

// Rate-limit counters live in Valkey and last up to an hour. Start every run from zero so a
// repeated run is not refused by the limits the app is supposed to enforce.
export default async function globalSetup() {
  const stopStub = await startStub();
  const redis = new Redis(E2E_ENV.VALKEY_URL, { lazyConnect: true });
  await redis.connect();
  const keys = await redis.keys("vc:local:*");
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
  // Playwright runs the function returned here after all tests.
  return stopStub;
}
