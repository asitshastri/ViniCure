import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeFileScanner } from "../../lib/adapters/fakes";
import { uuidv7 } from "../../lib/ids";
import { StorageService, type ObjectStore } from "../../lib/storage/storage";
import { DirectoryRepo } from "./repo";
import { publicDoctorsQuery } from "./schemas";
import { DirectoryService } from "./service";

// The application and KYC pipeline as the real `app` role on real Postgres (grants, the
// single-statement writes, the cursor). Skipped unless DATABASE_TEST_URL is set.
const url = process.env.DATABASE_TEST_URL;

const PDF = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0, 0, 0, 0, 0,
]);

describe.skipIf(!url)("directory on real Postgres as the app role", () => {
  let pool: pg.Pool;
  const run = Date.now();
  const users: string[] = [];
  const objects = new Map<string, number>();
  const store: ObjectStore = {
    presignPut: async (a) => `https://fake/${a.bucket}/${a.key}`,
    presignGet: async (a) => `https://fake/${a.bucket}/${a.key}`,
    head: async (b, k) =>
      objects.has(`${b}/${k}`)
        ? { sizeBytes: objects.get(`${b}/${k}`) ?? 0, contentType: "x" }
        : null,
    readHead: async () => PDF,
    read: async () =>
      (async function* () {
        yield PDF;
      })(),
    delete: async (b, k) => void objects.delete(`${b}/${k}`),
  };

  const q = () => ({
    query: async (text: string, params?: unknown[]) => ({
      rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
    }),
  });
  let service: DirectoryService;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 5 });
    service = new DirectoryService({
      repo: new DirectoryRepo(q()),
      storage: () =>
        new StorageService(store, {
          buckets: { files: "f", exports: "e" },
          region: "r",
          signedUrlTtlSeconds: 300,
        }),
      queue: async () => ({ enqueue: async () => "job" }),
    });
  });
  afterAll(async () => {
    await pool.query(
      "DELETE FROM doctor_kyc_documents WHERE doctor_id IN (SELECT id FROM doctors WHERE user_id = ANY($1))",
      [users],
    );
    await pool.query("DELETE FROM files WHERE owner_user_id = ANY($1)", [users]);
    await pool.query(
      "DELETE FROM doctor_specialties WHERE doctor_id IN (SELECT id FROM doctors WHERE user_id = ANY($1))",
      [users],
    );
    await pool.query("DELETE FROM doctors WHERE user_id = ANY($1)", [users]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [users]);
    await pool.query("DELETE FROM specialties WHERE id = 31001");
    await pool.end();
  });

  async function user(roles: ("doctor" | "admin")[]) {
    const id = uuidv7();
    await pool.query("INSERT INTO users (id, name, email) VALUES ($1, 'U', $2)", [
      id,
      `${id}@no-email.invalid`,
    ]);
    users.push(id);
    return { userId: id, roles };
  }

  it("apply, change specialty, upload, scan, review and approve", async () => {
    await pool.query(
      "INSERT INTO specialties (id, name) VALUES (31001, $1) ON CONFLICT DO NOTHING",
      [`Integration ${run}`],
    );
    const doctor = await user(["doctor"]);
    const admin = await user(["admin"]);
    const application = {
      displayName: "Integration Doctor",
      registrationNo: `INT-${run}`,
      registrationCouncil: "Test Council",
      qualifications: "MBBS",
      languages: ["English"],
      specialtyId: 31001,
      consultationFeePaise: 30_000,
    };
    const saved = await service.saveApplication(doctor, application);
    expect(saved.specialtyId).toBe(31001);
    // Saving again moves the specialty without a unique violation.
    const again = await service.saveApplication(doctor, {
      ...application,
      consultationFeePaise: 40_000,
    });
    expect(again.consultationFeePaise).toBe(40_000);

    const scanner = new FakeFileScanner();
    const docs: string[] = [];
    for (const docType of ["registration_certificate", "photo_id"]) {
      const slot = await service.requestUpload(doctor, {
        docType,
        contentType: "application/pdf",
        sizeBytes: 900,
      });
      objects.set(new URL(slot.upload.url).pathname.slice(1), 900);
      await service.completeUpload(doctor, slot.documentId);
      docs.push(slot.documentId);
    }
    const { rows } = await pool.query(
      "SELECT id FROM files WHERE owner_user_id = $1 AND uploaded_at IS NOT NULL",
      [doctor.userId],
    );
    for (const row of rows) expect(await service.scanFile(String(row.id), scanner)).toBe("clean");
    for (const id of docs) await service.reviewDocument(admin, id, { decision: "approve" });
    const approved = await service.decide(admin, saved.id, { decision: "approve" });
    expect(approved).toMatchObject({ kycStatus: "approved", status: "active" });
    // Active needs approved KYC: the database refuses anything else.
    await expect(
      pool.query("UPDATE doctors SET kyc_status = 'pending' WHERE id = $1", [saved.id]),
    ).rejects.toThrow(/doctors_active_needs_kyc_check/);
  });

  it("the app role has no DDL rights on the new tables", async () => {
    await expect(pool.query("ALTER TABLE files ADD COLUMN sneaky int")).rejects.toThrow(
      /must be owner|permission denied/,
    );
  });

  it("two simultaneous decisions: exactly one wins", async () => {
    const doctor = await user(["doctor"]);
    const admin = await user(["admin"]);
    const saved = await service.saveApplication(doctor, {
      displayName: "Race Doctor",
      registrationNo: `RACE-${run}`,
      registrationCouncil: "Test Council",
      qualifications: "MBBS",
      languages: ["English"],
      specialtyId: 31001,
      consultationFeePaise: 30_000,
    });
    const results = await Promise.allSettled([
      service.decide(admin, saved.id, { decision: "reject", note: "first" }),
      service.decide(admin, saved.id, { decision: "reject", note: "second" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("the public search runs with every filter and sort, and pages by cursor", async () => {
    for (const sort of ["name", "fee_asc", "fee_desc"]) {
      const first = await service.searchDoctors(
        publicDoctorsQuery.parse({
          sort,
          limit: "1",
          q: "doc",
          specialtyId: "31001",
          language: "english",
          feeMin: "0",
          feeMax: "500000",
          availableToday: "false",
        }),
      );
      expect(first.items.length).toBeLessThanOrEqual(1);
      if (first.nextCursor) {
        const next = await service.searchDoctors(
          publicDoctorsQuery.parse({ sort, limit: "1", cursor: first.nextCursor }),
        );
        expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
      }
    }
    await service.searchDoctors(publicDoctorsQuery.parse({ availableToday: "true" }));
    await service.specialties();
  });
});
