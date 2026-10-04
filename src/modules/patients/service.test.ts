import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import type { Queryable } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { Principal } from "../identity/policy";
import { PatientRepo } from "./repo";
import { createPatientBody, updatePatientBody, MAX_PROFILES_PER_ACCOUNT } from "./schemas";
import { PatientService } from "./service";

let q: Queryable;
let service: PatientService;
let asha: Principal;
let ravi: Principal;
let doctor: Principal;

const adult = {
  relation: "self",
  fullName: "Asha Verma",
  dob: "1990-04-12",
  gender: "female",
} as const;

async function newUser(roles: ("patient" | "doctor")[] = ["patient"]): Promise<Principal> {
  const id = uuidv7();
  await q.query(`INSERT INTO users (id, name, email) VALUES ($1, 'U', $2)`, [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
}

let shared: ReturnType<typeof createTestDb> | undefined;
beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (text, params) => ({
      rows: (await pg.db.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
  service = new PatientService(new PatientRepo(q));
}, 60_000);

beforeEach(async () => {
  await q.query(`DELETE FROM patients`);
  await q.query(`DELETE FROM users`);
  asha = await newUser();
  ravi = await newUser();
  doctor = await newUser(["doctor"]);
});

const years = (n: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
};

describe("create and read", () => {
  it("creates a profile and returns only the allow-listed fields", async () => {
    const view = await service.create(asha, {
      ...adult,
      city: "Pune",
      pincode: "411001",
      bloodGroup: "O+",
    });
    expect(view).toMatchObject({
      relation: "self",
      fullName: "Asha Verma",
      dob: "1990-04-12",
      city: "Pune",
      pincode: "411001",
      bloodGroup: "O+",
      isMinor: false,
    });
    expect(Object.keys(view).sort()).toEqual(
      [
        "addressLine",
        "bloodGroup",
        "city",
        "createdAt",
        "dob",
        "fullName",
        "gender",
        "id",
        "isMinor",
        "pincode",
        "relation",
        "state",
      ].sort(),
    );
    expect(view.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await service.get(asha, view.id)).toEqual(view);
  });

  it("lists only the account's own live profiles", async () => {
    await service.create(asha, adult);
    await service.create(asha, {
      relation: "child",
      fullName: "Mira Verma",
      dob: years(6),
      gender: "female",
    });
    await service.create(ravi, { ...adult, fullName: "Ravi Rao" });
    const mine = await service.list(asha);
    expect(mine.map((p) => p.fullName)).toEqual(["Asha Verma", "Mira Verma"]);
  });

  it("marks a child as a minor from the date of birth, and an adult not", async () => {
    const child = await service.create(asha, {
      relation: "child",
      fullName: "Mira Verma",
      dob: years(6),
      gender: "female",
    });
    expect(child.isMinor).toBe(true);
    const teen = await service.create(asha, {
      relation: "child",
      fullName: "Kabir Verma",
      dob: years(17),
      gender: "male",
    });
    expect(teen.isMinor).toBe(true);
    const grown = await service.create(asha, {
      relation: "parent",
      fullName: "Sita Verma",
      dob: years(18),
      gender: "female",
    });
    expect(grown.isMinor).toBe(false);
  });

  it("stores hostile text literally (no injection, no interpretation)", async () => {
    const name = "Robert'); DROP TABLE patients;--";
    expect(createPatientBody.safeParse({ ...adult, fullName: name }).success).toBe(false); // not a name
    const view = await service.create(asha, {
      ...adult,
      addressLine: "12 <script>alert(1)</script> Road'; --",
    });
    expect(view.addressLine).toBe("12 <script>alert(1)</script> Road'; --");
    expect((await q.query(`SELECT count(*)::int AS n FROM patients`)).rows[0]?.n).toBe(1);
  });
});

describe("ownership: another account's profile is a 404", () => {
  it("read, update and delete by a different patient", async () => {
    const mine = await service.create(asha, { ...adult, relation: "spouse" });
    expect(await code(service.get(ravi, mine.id))).toBe("not_found");
    expect(await code(service.update(ravi, mine.id, { fullName: "Hacked Name" }))).toBe(
      "not_found",
    );
    expect(await code(service.remove(ravi, mine.id))).toBe("not_found");
    expect((await service.get(asha, mine.id)).fullName).toBe("Asha Verma");
  });

  it("a doctor, even an assigned one, cannot use this account route (404)", async () => {
    const mine = await service.create(asha, adult);
    expect(await code(service.get(doctor, mine.id))).toBe("not_found");
    expect(await code(service.update(doctor, mine.id, { fullName: "Dr Edit" }))).toBe("not_found");
  });

  it("an unknown id and a deleted profile look the same as someone else's", async () => {
    expect(await code(service.get(asha, uuidv7()))).toBe("not_found");
    const p = await service.create(asha, { ...adult, relation: "sibling" });
    await service.remove(asha, p.id);
    expect(await code(service.get(asha, p.id))).toBe("not_found");
    expect(await service.list(asha)).toHaveLength(0);
  });
});

describe("rules", () => {
  it("allows one 'self' profile per account", async () => {
    await service.create(asha, adult);
    expect(await code(service.create(asha, { ...adult, fullName: "Asha Two" }))).toBe("conflict");
    // Another account may have its own.
    expect(await code(service.create(ravi, adult))).toBe("ok");
  });

  it("refuses the same person twice on one account (case-insensitive)", async () => {
    await service.create(asha, {
      ...adult,
      relation: "spouse",
      fullName: "Ravi Rao",
      dob: "1988-01-01",
    });
    expect(
      await code(
        service.create(asha, {
          ...adult,
          relation: "other",
          fullName: "RAVI RAO",
          dob: "1988-01-01",
        }),
      ),
    ).toBe("conflict");
  });

  it(`caps an account at ${MAX_PROFILES_PER_ACCOUNT} profiles; removing one makes room`, async () => {
    const made: string[] = [];
    for (let i = 0; i < MAX_PROFILES_PER_ACCOUNT; i++) {
      const v = await service.create(asha, {
        relation: "other",
        fullName: `Person ${String.fromCharCode(65 + i)}x`,
        dob: "1980-01-01",
        gender: "other",
      });
      made.push(v.id);
    }
    expect(
      await code(
        service.create(asha, {
          relation: "other",
          fullName: "One Toomany",
          dob: "1980-01-01",
          gender: "other",
        }),
      ),
    ).toBe("conflict");
    await service.remove(asha, made[0] as string);
    expect(
      await code(
        service.create(asha, {
          relation: "other",
          fullName: "One Toomany",
          dob: "1980-01-01",
          gender: "other",
        }),
      ),
    ).toBe("ok");
  });

  it("does not delete the 'self' profile on its own", async () => {
    const me = await service.create(asha, adult);
    expect(await code(service.remove(asha, me.id))).toBe("conflict");
    expect((await service.get(asha, me.id)).id).toBe(me.id);
  });

  it("soft delete keeps the row", async () => {
    const p = await service.create(asha, { ...adult, relation: "parent" });
    await service.remove(asha, p.id);
    const { rows } = await q.query(`SELECT deleted_at FROM patients WHERE id = $1`, [p.id]);
    expect(rows[0]?.deleted_at).toBeInstanceOf(Date);
    // A deleted person can be added again.
    expect(await code(service.create(asha, { ...adult, relation: "parent" }))).toBe("ok");
  });
});

describe("update", () => {
  it("changes only the fields sent, and recomputes the minor flag from a new date of birth", async () => {
    const p = await service.create(asha, {
      relation: "child",
      fullName: "Mira Verma",
      dob: years(6),
      gender: "female",
      city: "Pune",
    });
    const u = await service.update(asha, p.id, { dob: years(30), bloodGroup: "A+" });
    expect(u).toMatchObject({
      fullName: "Mira Verma",
      city: "Pune",
      bloodGroup: "A+",
      dob: years(30),
      isMinor: false,
    });
    const stored = (await q.query(`SELECT is_minor FROM patients WHERE id = $1`, [p.id])).rows[0];
    expect(stored?.is_minor).toBe(false);
  });

  it("can clear an optional field with null", async () => {
    const p = await service.create(asha, { ...adult, city: "Pune" });
    expect((await service.update(asha, p.id, { city: null })).city).toBeNull();
  });
});

describe("input validation", () => {
  const ok = { ...adult };
  it("refuses fields the client must not set (mass assignment)", () => {
    for (const extra of [
      { isMinor: false },
      { is_minor: false },
      { accountUserId: uuidv7() },
      { id: uuidv7() },
      { deletedAt: null },
      { role: "doctor" },
    ]) {
      expect(createPatientBody.safeParse({ ...ok, ...extra }).success, JSON.stringify(extra)).toBe(
        false,
      );
      expect(updatePatientBody.safeParse(extra).success, JSON.stringify(extra)).toBe(false);
    }
  });
  it("refuses an empty update", () => {
    expect(updatePatientBody.safeParse({}).success).toBe(false);
  });
  it("validates dates: real, not future, after 1900", () => {
    for (const dob of [
      "2999-01-01",
      "1899-12-31",
      "2024-02-30",
      "12/04/1990",
      "1990-4-1",
      "",
      "not-a-date",
    ]) {
      expect(createPatientBody.safeParse({ ...ok, dob }).success, dob).toBe(false);
    }
    expect(createPatientBody.safeParse({ ...ok, dob: "2024-02-29" }).success).toBe(true);
  });
  it("validates names, PIN codes, blood groups and enums", () => {
    for (const bad of [
      { fullName: "A" },
      { fullName: "x".repeat(101) },
      { fullName: "Bob\u0000" },
      { fullName: "1234" },
      { pincode: "012345" },
      { pincode: "12345" },
      { pincode: "4110011" },
      { bloodGroup: "C+" },
      { gender: "robot" },
      { relation: "friend" },
    ]) {
      expect(createPatientBody.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
    for (const good of [
      { fullName: "Anne-Marie O'Neil Jr." },
      { fullName: "प्रिया शर्मा" },
      { pincode: "411001" },
      { bloodGroup: "AB-" },
    ]) {
      expect(createPatientBody.safeParse({ ...ok, ...good }).success, JSON.stringify(good)).toBe(
        true,
      );
    }
  });
  it("the database refuses what the schema would also refuse (defence in depth)", async () => {
    const bad = (sql: string) => q.query(sql, [uuidv7(), asha.userId]);
    await expect(
      bad(
        `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor) VALUES ($1,$2,'friend','Ab Cd','1990-01-01','male',false)`,
      ),
    ).rejects.toThrow();
    await expect(
      bad(
        `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor) VALUES ($1,$2,'self','Ab Cd','2999-01-01','male',false)`,
      ),
    ).rejects.toThrow();
    await expect(
      bad(
        `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, pincode, is_minor) VALUES ($1,$2,'self','Ab Cd','1990-01-01','male','000000',false)`,
      ),
    ).rejects.toThrow();
  });
});
