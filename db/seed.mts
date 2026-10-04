import pg from "pg";
import { seedDemo, seedReference } from "../src/db/seed.mts";

// pnpm db:seed          reference data (specialties). Safe anywhere.
// pnpm db:seed --demo   also fake doctors with working hours. Never in production.
// Connects with DATABASE_URL (the app role). The URL is never printed.

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const demo = process.argv.includes("--demo");
if (demo && process.env.NODE_ENV === "production") {
  console.error("Demo data is never loaded in production.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const db = {
    query: async (text: string, params?: unknown[]) => ({
      rows: (await client.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
  await seedReference(db);
  console.log("specialties seeded");
  if (demo) console.log(`demo doctors added: ${await seedDemo(db)}`);
} catch (error) {
  console.error("seed failed:", (error as Error).message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
