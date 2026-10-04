import { beforeAll, describe, expect, it } from "vitest";
import {
  DEMO_COUNCIL,
  SPECIALTIES,
  demoDoctors,
  seedDemo,
  seedDemoConsents,
  seedReference,
} from "./seed.mts";
import { createTestDb } from "./testing";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

const db = () => ({
  query: async (text: string, params?: unknown[]) => ({
    rows: (await t.app.query(text, params)).rows as Record<string, unknown>[],
  }),
});
const count = async (table: string) =>
  Number(
    ((await t.db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0] as { n: number }).n,
  );

describe("seed data", () => {
  it("loads specialties and demo doctors, and a second run changes nothing", async () => {
    await seedReference(db());
    expect(await seedDemo(db())).toBe(24);
    const first = [
      await count("specialties"),
      await count("doctors"),
      await count("doctor_specialties"),
      await count("doctor_availability_rules"),
    ];
    expect(first).toEqual([SPECIALTIES.length, 24, 24, 24 * 12]);
    await seedReference(db());
    expect(await seedDemo(db())).toBe(0);
    expect([
      await count("specialties"),
      await count("doctors"),
      await count("doctor_specialties"),
      await count("doctor_availability_rules"),
    ]).toEqual(first);
  });

  it("demo doctors are listed, clearly fake, and carry no real contact details", async () => {
    const rows = (
      await t.db.query(
        "SELECT registration_council, status, kyc_status, applicant_email FROM doctors",
      )
    ).rows;
    for (const r of rows) {
      expect(r).toMatchObject({
        registration_council: DEMO_COUNCIL,
        status: "active",
        kyc_status: "approved",
      });
      expect(String((r as { applicant_email: unknown }).applicant_email)).toMatch(
        /@no-email\.invalid$/,
      );
    }
  });

  it("the ids are the same on every run, and the data is valid for the public directory", () => {
    expect(demoDoctors().map((d) => d.id)).toEqual(demoDoctors().map((d) => d.id));
    expect(new Set(demoDoctors().map((d) => d.id)).size).toBe(24);
    for (const d of demoDoctors()) {
      expect(d.feePaise).toBeGreaterThanOrEqual(10_000);
      expect(d.feePaise).toBeLessThanOrEqual(500_000);
    }
  });

  it("draft consent texts are loaded once, say they are placeholders, and match their hash", async () => {
    expect(await seedDemoConsents(db())).toBe(3);
    expect(await seedDemoConsents(db())).toBe(0);
    const rows = (
      await t.db.query(
        "SELECT kind, body, content_hash FROM consent_policies WHERE version = 'draft-placeholder-1' ORDER BY kind",
      )
    ).rows as { kind: string; body: string; content_hash: string }[];
    expect(rows.map((r) => r.kind)).toEqual(["recording", "telemedicine", "video"]);
    const { createHash } = await import("node:crypto");
    for (const r of rows) {
      expect(r.body).toMatch(/DRAFT PLACEHOLDER, NOT LEGAL TEXT/);
      expect(r.content_hash).toBe(createHash("sha256").update(r.body).digest("hex"));
    }
  });
});
