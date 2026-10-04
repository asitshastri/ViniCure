import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "../../lib/ids";
import { DirectoryRepo } from "../directory/repo";
import { PatientRepo } from "../patients/repo";
import { EngagementRepo } from "./repo";
import { EngagementService } from "./service";

// Reviews and favorites as the real `app` role on real Postgres. Skipped without DATABASE_TEST_URL.
const url = process.env.DATABASE_TEST_URL;

describe.skipIf(!url)("reviews and favorites on real Postgres", () => {
  let pool: pg.Pool;
  let service: EngagementService;
  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 6 });
    const db = {
      query: async (text: string, params?: unknown[]) => ({
        rows: (await pool.query(text, params)).rows as Record<string, unknown>[],
      }),
    };
    service = new EngagementService({
      repo: new EngagementRepo(db),
      directory: new DirectoryRepo(db),
      patients: new PatientRepo(db),
    });
  });
  afterAll(() => pool.end());

  it("review, publish, rating, public page, favorites, and the one-review race", async () => {
    const mk = async (roles: ("patient" | "admin")[]) => {
      const id = uuidv7();
      await pool.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
        id,
        `${id}@no-email.invalid`,
      ]);
      return { userId: id, roles };
    };
    const asha = await mk(["patient"]);
    const admin = await mk(["admin"]);
    const patientId = uuidv7();
    await pool.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Real PG','1990-01-01','female',false)`,
      [patientId, asha.userId],
    );
    const doctorId = uuidv7();
    await pool.query(
      `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
         kyc_status, status, applicant_email) VALUES ($1,'Dr PG',$2,'Council','MBBS','approved','active',$3)`,
      [doctorId, `PG-${Date.now()}`, `${doctorId}@example.com`],
    );
    const apptId = uuidv7();
    const start = new Date(Date.now() + 90 * 86400_000);
    await pool.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
       VALUES ($1,$2,$3,$4,$5,$6,'completed',1000)`,
      [apptId, patientId, doctorId, asha.userId, start, new Date(start.getTime() + 1800_000)],
    );
    const results = await Promise.allSettled([
      service.submitReview(asha, apptId, { rating: 5, comment: "Very good" }),
      service.submitReview(asha, apptId, { rating: 2 }),
      service.submitReview(asha, apptId, { rating: 3 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const queue = await service.moderationQueue(admin, { status: "pending", limit: 50 });
    const mine = queue.items.find((i) => i.appointmentId === apptId);
    expect(mine).toBeDefined();
    await service.moderate(admin, (mine as { id: string }).id, "publish");
    const row = await new DirectoryRepo({
      query: async (t, p) => ({ rows: (await pool.query(t, p)).rows }),
    }).findPublic(doctorId);
    expect(row).toMatchObject({ ratingCount: 1 });
    expect((await service.publicReviews(doctorId, { limit: 5 })).items).toHaveLength(1);
    await service.addFavorite(asha, { patientId, doctorId });
    expect((await service.listFavorites(asha, patientId)).items.map((d) => d.id)).toEqual([
      doctorId,
    ]);
    await service.removeFavorite(asha, { patientId, doctorId });
    expect((await service.listFavorites(asha, patientId)).items).toEqual([]);
  });
});
