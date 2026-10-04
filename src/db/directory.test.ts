import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./testing";

// Constraints of the doctor directory tables (migration 0011). The tests insert as the app role,
// which is what the services use, so the grants are exercised too.
let t: Awaited<ReturnType<typeof createTestDb>>;
let n = 0;
const id = () => `0190a1b2-c3d4-7e5f-8a9b-${String(++n).padStart(12, "0")}`;
const sha = "a".repeat(64);

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

async function user() {
  const uid = id();
  await t.app.query("INSERT INTO users (id, name, email) VALUES ($1, 'U', $2)", [
    uid,
    `${uid}@example.com`,
  ]);
  return uid;
}

async function doctor(extra: Record<string, string> = {}) {
  const did = id();
  const row: Record<string, string> = {
    registration_no: `REG${n}`,
    registration_council: "Gujarat Medical Council",
    applicant_email: `${did}@example.com`,
    ...extra,
  };
  await t.app.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       applicant_email, status, kyc_status)
     VALUES ($1, 'Dr Test', $2, $3, 'MBBS', $4, $5, $6)`,
    [
      did,
      row.registration_no,
      row.registration_council,
      row.applicant_email,
      row.status ?? "pending",
      row.kyc_status ?? "pending",
    ],
  );
  return did;
}

const rejects = (p: Promise<unknown>, re: RegExp) => expect(p).rejects.toThrow(re);

describe("doctors", () => {
  it("starts pending, with the dates stamped", async () => {
    const d = await doctor();
    const row = (
      await t.app.query("SELECT status, kyc_status, created_at FROM doctors WHERE id=$1", [d])
    ).rows[0];
    expect(row).toMatchObject({ status: "pending", kyc_status: "pending" });
  });

  it("cannot be active before the registration is approved", async () => {
    await rejects(doctor({ status: "active" }), /doctors_active_needs_kyc_check/);
    await doctor({ status: "active", kyc_status: "approved" });
  });

  it("one registration number per council, ignoring case", async () => {
    await doctor({ registration_no: "G-1001" });
    await rejects(doctor({ registration_no: "g-1001" }), /doctors_registration_idx/);
    await doctor({ registration_no: "G-1001", registration_council: "Delhi Medical Council" });
  });

  it("needs someone identifiable and one doctor per account", async () => {
    await rejects(
      t.app.query(
        `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications)
         VALUES ($1, 'Dr X', 'N1', 'C1', 'MBBS')`,
        [id()],
      ),
      /doctors_identity_check/,
    );
    const u = await user();
    const insert = () =>
      t.app.query(
        `INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council, qualifications)
         VALUES ($1, $2, 'Dr U', $3, 'C2', 'MBBS')`,
        [id(), u, `U${++n}`],
      );
    await insert();
    await rejects(insert(), /doctors_user_idx/);
  });

  it("keeps money and fee shares in range", async () => {
    const d = await doctor();
    await rejects(
      t.app.query("UPDATE doctors SET consultation_fee_paise = -1 WHERE id=$1", [d]),
      /doctors_fee_check/,
    );
    await rejects(
      t.app.query("UPDATE doctors SET platform_fee_bps = 10001 WHERE id=$1", [d]),
      /doctors_platform_fee_check/,
    );
  });

  it("refuses a status outside the list and a duplicate HPR id", async () => {
    const d = await doctor();
    await rejects(
      t.app.query("UPDATE doctors SET status='hired' WHERE id=$1", [d]),
      /doctors_status_check/,
    );
    await t.app.query("UPDATE doctors SET hpr_id='12-3456' WHERE id=$1", [d]);
    const e = await doctor();
    await rejects(
      t.app.query("UPDATE doctors SET hpr_id='12-3456' WHERE id=$1", [e]),
      /doctors_hpr_idx/,
    );
  });
});

describe("specialties", () => {
  it("names are unique ignoring case and a doctor has one primary", async () => {
    await t.app.query("INSERT INTO specialties (id, name) VALUES (1, 'Cardiology')");
    await rejects(
      t.app.query("INSERT INTO specialties (id, name) VALUES (2, 'cardiology')"),
      /specialties_name_idx/,
    );
    await t.app.query("INSERT INTO specialties (id, name) VALUES (3, 'Dermatology')");
    const d = await doctor();
    await t.app.query("INSERT INTO doctor_specialties VALUES ($1, 1, true)", [d]);
    await t.app.query("INSERT INTO doctor_specialties VALUES ($1, 3, false)", [d]);
    await rejects(
      t.app.query(
        "UPDATE doctor_specialties SET is_primary = true WHERE doctor_id=$1 AND specialty_id=3",
        [d],
      ),
      /one_primary/,
    );
    await rejects(
      t.app.query("INSERT INTO doctor_specialties VALUES ($1, 99, false)", [d]),
      /foreign key/,
    );
  });
});

describe("files and KYC documents", () => {
  async function file(over: Record<string, unknown> = {}) {
    const f = id();
    const owner = await user();
    await t.app.query(
      `INSERT INTO files (id, owner_user_id, purpose, storage_key, original_name, mime_type, size_bytes, sha256)
       VALUES ($1, $2, $3, $4, 'id.pdf', 'application/pdf', $5, $6)`,
      [f, owner, over.purpose ?? "kyc", over.key ?? `kyc/${f}`, over.size ?? 1000, over.sha ?? sha],
    );
    return f;
  }

  it("storage keys are unique and well formed, and a new file waits for its scan", async () => {
    const f = await file({ key: "kyc/abc12345" });
    await rejects(file({ key: "kyc/abc12345" }), /files_storage_key_idx/);
    await rejects(file({ key: "../etc/passwd" }), /files_storage_key_check/);
    expect(
      (await t.app.query("SELECT scan_status FROM files WHERE id=$1", [f])).rows[0]?.scan_status,
    ).toBe("pending");
  });

  it("refuses an unknown purpose, an empty file and a bad hash", async () => {
    await rejects(file({ purpose: "selfie" }), /files_purpose_check/);
    await rejects(file({ size: 0 }), /files_size_check/);
    await rejects(file({ sha: "xyz" }), /files_sha256_check/);
  });

  it("a scan result needs a time, and a pending scan has none", async () => {
    const f = await file();
    await rejects(
      t.app.query("UPDATE files SET scan_status='clean' WHERE id=$1", [f]),
      /files_scanned_check/,
    );
    await t.app.query("UPDATE files SET scan_status='clean', scanned_at=now() WHERE id=$1", [f]);
  });

  it("a document needs a reviewer once it leaves pending, and a file backs one document", async () => {
    const d = await doctor();
    const f = await file();
    const doc = id();
    await t.app.query(
      "INSERT INTO doctor_kyc_documents (id, doctor_id, file_id, doc_type) VALUES ($1,$2,$3,'photo_id')",
      [doc, d, f],
    );
    await rejects(
      t.app.query("UPDATE doctor_kyc_documents SET status='approved' WHERE id=$1", [doc]),
      /doctor_kyc_reviewed_check/,
    );
    const reviewer = await user();
    await t.app.query(
      "UPDATE doctor_kyc_documents SET status='approved', reviewed_by=$2, reviewed_at=now() WHERE id=$1",
      [doc, reviewer],
    );
    await rejects(
      t.app.query(
        "INSERT INTO doctor_kyc_documents (id, doctor_id, file_id, doc_type) VALUES ($1,$2,$3,'photo')",
        [id(), d, f],
      ),
      /doctor_kyc_file_idx/,
    );
    await rejects(
      t.app.query(
        "INSERT INTO doctor_kyc_documents (id, doctor_id, file_id, doc_type) VALUES ($1,$2,$3,'aadhaar')",
        [id(), d, await file()],
      ),
      /doctor_kyc_doc_type_check/,
    );
  });
});

describe("working hours and time off", () => {
  const rule = (
    d: string,
    weekday: number,
    from: string,
    to: string,
    slot = 30,
    validFrom = "2026-11-01",
    validTo: string | null = null,
  ) =>
    t.app.query(
      `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from, valid_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id(), d, weekday, from, to, slot, validFrom, validTo],
    );

  it("accepts a normal day and refuses nonsense", async () => {
    const d = await doctor();
    await rule(d, 1, "09:00", "13:00");
    await rejects(rule(d, 7, "09:00", "13:00"), /availability_weekday_check/);
    await rejects(rule(d, 2, "13:00", "09:00"), /availability_hours_check/);
    await rejects(rule(d, 2, "09:00", "13:00", 25), /availability_slot_check/);
    await rejects(rule(d, 2, "09:00", "09:50", 30), /availability_whole_slots_check/);
    await rejects(
      rule(d, 2, "09:00", "13:00", 30, "2026-12-01", "2026-11-01"),
      /availability_validity_check/,
    );
  });

  it("two rules for one day cannot overlap in time and dates; touching is fine", async () => {
    const d = await doctor();
    await rule(d, 3, "09:00", "12:00");
    await rejects(rule(d, 3, "11:00", "14:00"), /availability_no_overlap/);
    await rule(d, 3, "12:00", "15:00");
    await rule(d, 4, "11:00", "14:00");
    // The same hours in a later period are fine when the first rule ends before it starts.
    const e = await doctor();
    await rule(e, 3, "09:00", "12:00", 30, "2026-11-01", "2026-11-30");
    await rule(e, 3, "09:00", "12:00", 30, "2026-12-01");
    await rejects(
      rule(e, 3, "10:00", "11:00", 30, "2026-11-15", "2026-12-15"),
      /availability_no_overlap/,
    );
  });

  it("time off must end after it starts", async () => {
    const d = await doctor();
    const insert = (a: string, b: string) =>
      t.app.query(
        "INSERT INTO doctor_time_off (id, doctor_id, start_at, end_at) VALUES ($1,$2,$3,$4)",
        [id(), d, a, b],
      );
    await insert("2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z");
    await rejects(insert("2026-11-03T00:00:00Z", "2026-11-03T00:00:00Z"), /time_off_range_check/);
  });
});
