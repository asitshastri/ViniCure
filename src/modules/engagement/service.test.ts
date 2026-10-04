import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import type { Queryable } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { Role } from "../../lib/api/types";
import { DirectoryRepo } from "../directory/repo";
import type { Principal } from "../identity/policy";
import { PatientRepo } from "../patients/repo";
import { EngagementRepo } from "./repo";
import { MAX_FAVORITES, favoriteBody, moderateBody, reviewBody } from "./schemas";
import { EngagementService } from "./service";

let q: Queryable;
let service: EngagementService;
let doctorId: string;
let asha: Principal;
let ashaPatient: string;
let ravi: Principal;
let ravisPatient: string;
let admin: Principal;
let doctorUser: Principal;
let support: Principal;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};
async function person(roles: Role[] = ["patient"]): Promise<Principal> {
  const id = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles };
}
async function profile(owner: Principal) {
  const id = uuidv7();
  await q.query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Test Person','1990-01-01','female',false)`,
    [id, owner.userId],
  );
  return id;
}
async function newDoctor(status = "active", kyc = "approved") {
  const id = uuidv7();
  await q.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       kyc_status, status, applicant_email) VALUES ($1,'Dr Review',$2,'Council','MBBS',$3,$4,$5)`,
    [id, `RV-${id.slice(-8)}`, kyc, status, `${id}@example.com`],
  );
  return id;
}
/** An appointment in the given status, written directly (the lifecycle is tested elsewhere). */
async function appointment(status: string, who = asha, patientId = ashaPatient, doctor = doctorId) {
  const id = uuidv7();
  const start = new Date(Date.now() + (Math.floor(Math.random() * 1e6) + 1) * 3600_000);
  await q.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise,
       hold_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,1000, CASE WHEN $7 = 'held' THEN now() + interval '10 minutes' END)`,
    [id, patientId, doctor, who.userId, start, new Date(start.getTime() + 1800_000), status],
  );
  return id;
}
const rating = async () =>
  (await q.query("SELECT rating_avg, rating_count FROM doctors WHERE id=$1", [doctorId]))
    .rows[0] as {
    rating_avg: string | null;
    rating_count: number;
  };

let shared: ReturnType<typeof createTestDb> | undefined;
beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (t, p) => ({ rows: (await pg.db.query(t, p)).rows as Record<string, unknown>[] }),
  };
}, 60_000);

beforeEach(async () => {
  const db = q;
  service = new EngagementService({
    repo: new EngagementRepo(db),
    directory: new DirectoryRepo(db),
    patients: new PatientRepo(db),
  });
  doctorId = await newDoctor();
  asha = await person();
  ashaPatient = await profile(asha);
  ravi = await person();
  ravisPatient = await profile(ravi);
  admin = await person(["admin"]);
  doctorUser = await person(["doctor"]);
  support = await person(["support"]);
});

describe("writing a review", () => {
  it("a patient reviews a completed appointment once; it starts pending and is not public", async () => {
    const appt = await appointment("completed");
    const view = await service.submitReview(asha, appt, {
      rating: 5,
      comment: "Listened carefully.",
    });
    expect(view).toMatchObject({ rating: 5, status: "pending" });
    expect((await service.publicReviews(doctorId, { limit: 10 })).items).toEqual([]);
    expect(await code(service.submitReview(asha, appt, { rating: 1 }))).toBe("conflict");
    expect(
      (await q.query("SELECT count(*)::int AS n FROM reviews WHERE appointment_id=$1", [appt]))
        .rows[0]?.n,
    ).toBe(1);
  });

  it("before the consultation is complete it is refused, whatever the status", async () => {
    for (const status of [
      "held",
      "scheduled",
      "in_progress",
      "cancelled_by_patient",
      "cancelled_by_doctor",
      "expired",
      "no_show",
    ]) {
      const appt = await appointment(status);
      expect(await code(service.submitReview(asha, appt, { rating: 4 })), status).toBe("conflict");
    }
    expect(
      (await q.query("SELECT count(*)::int AS n FROM reviews WHERE doctor_id=$1", [doctorId]))
        .rows[0]?.n,
    ).toBe(0);
  });

  it("another patient, the doctor, an admin and support get 404, and so does a missing appointment", async () => {
    const appt = await appointment("completed");
    for (const who of [ravi, doctorUser, admin, support]) {
      expect(await code(service.submitReview(who, appt, { rating: 1 })), who.roles.join()).toBe(
        "not_found",
      );
    }
    expect(await code(service.submitReview(asha, uuidv7(), { rating: 5 }))).toBe("not_found");
    expect(await code(service.submitReview({ ...asha, limited: true }, appt, { rating: 5 }))).toBe(
      "step_up_required",
    );
  });

  it("two simultaneous reviews of one appointment: exactly one is stored", async () => {
    const appt = await appointment("completed");
    const results = await Promise.allSettled([
      service.submitReview(asha, appt, { rating: 5 }),
      service.submitReview(asha, appt, { rating: 1 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("the body is strict: rating 1 to 5, a short plain comment, no other fields", () => {
    expect(reviewBody.safeParse({ rating: 0 }).success).toBe(false);
    expect(reviewBody.safeParse({ rating: 6 }).success).toBe(false);
    expect(reviewBody.safeParse({ rating: 4.5 }).success).toBe(false);
    expect(reviewBody.safeParse({ rating: 4, comment: "x" }).success).toBe(false);
    expect(reviewBody.safeParse({ rating: 4, comment: "a".repeat(1001) }).success).toBe(false);
    expect(reviewBody.safeParse({ rating: 4, comment: "bad\u0000text" }).success).toBe(false);
    expect(reviewBody.safeParse({ rating: 4, status: "published" }).success).toBe(false);
    expect(reviewBody.safeParse({ rating: 4, doctorId: uuidv7() }).success).toBe(false);
    expect(reviewBody.safeParse({ rating: 4, comment: "Good.\nThank you." }).success).toBe(true);
  });

  it("a comment with markup is stored as plain text, untouched", async () => {
    const appt = await appointment("completed");
    await service.submitReview(asha, appt, {
      rating: 3,
      comment: "<script>alert(1)</script> fine",
    });
    const queue = await service.moderationQueue(admin, { status: "pending", limit: 10 });
    expect(queue.items.find((i) => i.appointmentId === appt)?.comment).toBe(
      "<script>alert(1)</script> fine",
    );
  });
});

describe("moderation and the public list", () => {
  it("only published reviews are public, newest first, with no reviewer identity", async () => {
    const a = await service.submitReview(asha, await appointment("completed"), {
      rating: 5,
      comment: "Great",
    });
    const b = await service.submitReview(asha, await appointment("completed"), { rating: 3 });
    const hidden = await service.submitReview(asha, await appointment("completed"), {
      rating: 1,
      comment: "Rude",
    });
    await service.moderate(admin, a.id, "publish");
    await service.moderate(admin, b.id, "publish");
    await service.moderate(admin, hidden.id, "hide");
    const page = await service.publicReviews(doctorId, { limit: 10 });
    expect(page.items.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(Object.keys(page.items[0] as object).sort()).toEqual([
      "comment",
      "createdAt",
      "id",
      "rating",
    ]);
    expect(JSON.stringify(page)).not.toMatch(/Rude|author|user|patient|status/);
  });

  it("the rating average and count follow publish and hide, and are rounded", async () => {
    expect(await rating()).toMatchObject({ rating_avg: null, rating_count: 0 });
    const ids: string[] = [];
    for (const r of [5, 4, 4])
      ids.push(
        (await service.submitReview(asha, await appointment("completed"), { rating: r })).id,
      );
    for (const id of ids) await service.moderate(admin, id, "publish");
    expect(await rating()).toMatchObject({ rating_avg: "4.33", rating_count: 3 });
    await service.moderate(admin, ids[0] as string, "hide");
    expect(await rating()).toMatchObject({ rating_avg: "4.00", rating_count: 2 });
    for (const id of ids.slice(1)) await service.moderate(admin, id, "hide");
    expect(await rating()).toMatchObject({ rating_avg: null, rating_count: 0 });
  });

  it("publishing twice is a 404 the second time, and a hidden review can be published again", async () => {
    const r = await service.submitReview(asha, await appointment("completed"), { rating: 5 });
    await service.moderate(admin, r.id, "publish");
    expect(await code(service.moderate(admin, r.id, "publish"))).toBe("not_found");
    await service.moderate(admin, r.id, "hide");
    await service.moderate(admin, r.id, "publish");
    expect((await rating()).rating_count).toBe(1);
    expect(await code(service.moderate(admin, uuidv7(), "publish"))).toBe("not_found");
  });

  it("only admins moderate or see the queue; patients, doctors and support get 404", async () => {
    const r = await service.submitReview(asha, await appointment("completed"), { rating: 5 });
    for (const who of [asha, ravi, doctorUser, support]) {
      expect(await code(service.moderate(who, r.id, "publish")), who.roles.join()).toBe(
        "not_found",
      );
      expect(await code(service.moderationQueue(who, { status: "pending", limit: 10 }))).toBe(
        "not_found",
      );
    }
    expect(moderateBody.safeParse({ decision: "delete" }).success).toBe(false);
  });

  it("the queue pages oldest first without gaps, and cursors cannot be forged", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++)
      ids.push(
        (await service.submitReview(asha, await appointment("completed"), { rating: 5 })).id,
      );
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.moderationQueue(admin, {
        status: "pending",
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.items.filter((i) => ids.includes(i.id)).map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(ids);
    expect(
      await code(service.moderationQueue(admin, { status: "pending", limit: 5, cursor: "x" })),
    ).toBe("validation_failed");
  });

  it("a doctor who is not listed has no public reviews page (404)", async () => {
    const hidden = await newDoctor("suspended", "approved");
    expect(await code(service.publicReviews(hidden, { limit: 5 }))).toBe("not_found");
    expect(await code(service.publicReviews(uuidv7(), { limit: 5 }))).toBe("not_found");
  });

  it("the public doctor profile carries the cached rating", async () => {
    const r = await service.submitReview(asha, await appointment("completed"), { rating: 4 });
    await service.moderate(admin, r.id, "publish");
    const row = await new DirectoryRepo(q).findPublic(doctorId);
    expect(row).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
  });
});

describe("favorites", () => {
  const fav = (who: Principal, patientId: string, doctor = doctorId) =>
    service.addFavorite(who, favoriteBody.parse({ patientId, doctorId: doctor }));

  it("adds, lists, and removes; adding twice is harmless", async () => {
    await fav(asha, ashaPatient);
    await fav(asha, ashaPatient);
    expect((await service.listFavorites(asha, ashaPatient)).items.map((d) => d.id)).toEqual([
      doctorId,
    ]);
    await service.removeFavorite(asha, { patientId: ashaPatient, doctorId });
    await service.removeFavorite(asha, { patientId: ashaPatient, doctorId });
    expect((await service.listFavorites(asha, ashaPatient)).items).toEqual([]);
  });

  it("only for your own profile: someone else's, a missing one, and staff are 404", async () => {
    for (const who of [ravi, doctorUser, admin, support]) {
      expect(await code(fav(who, ashaPatient)), who.roles.join()).toBe("not_found");
      expect(await code(service.listFavorites(who, ashaPatient))).toBe("not_found");
      expect(await code(service.removeFavorite(who, { patientId: ashaPatient, doctorId }))).toBe(
        "not_found",
      );
    }
    expect(await code(fav(asha, uuidv7()))).toBe("not_found");
    await fav(asha, ashaPatient);
    // Ravi's own list is separate and empty.
    expect((await service.listFavorites(ravi, ravisPatient)).items).toEqual([]);
  });

  it("only listed doctors can be saved; one that is later suspended drops out of the list", async () => {
    const pending = await newDoctor("pending", "pending");
    expect(await code(fav(asha, ashaPatient, pending))).toBe("not_found");
    const soon = await newDoctor();
    await fav(asha, ashaPatient, soon);
    await q.query("UPDATE doctors SET status='suspended' WHERE id=$1", [soon]);
    expect((await service.listFavorites(asha, ashaPatient)).items).toEqual([]);
  });

  it(`at most ${MAX_FAVORITES} per profile`, async () => {
    for (let i = 0; i < MAX_FAVORITES; i++) await fav(asha, ashaPatient, await newDoctor());
    expect(await code(fav(asha, ashaPatient, await newDoctor()))).toBe("conflict");
    // Saving one that is already saved still works at the cap.
    const ids = (await service.listFavorites(asha, ashaPatient)).items;
    expect(ids).toHaveLength(MAX_FAVORITES);
    expect(await code(fav(asha, ashaPatient, (ids[0] as { id: string }).id))).toBe("ok");
  });

  it("the body is strict", () => {
    expect(favoriteBody.safeParse({ patientId: uuidv7(), doctorId, extra: 1 }).success).toBe(false);
    expect(favoriteBody.safeParse({ patientId: "x", doctorId }).success).toBe(false);
  });
});
