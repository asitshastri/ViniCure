import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import type { Queryable, TxRunner } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { Role } from "../../lib/api/types";
import type { Principal } from "../identity/policy";
import { ReferralRepo } from "./repo";
import { redeemBody } from "./schemas";
import { ReferralService, newCode } from "./service";

// Referrals (P5-10): the rules that stop farming, and the flag.
let q: Queryable;
let tx: TxRunner;
let service: ReferralService;
let enabled = true;
let cap = 3;
let reward = 5000;

async function person(roles: Role[] = ["patient"]): Promise<Principal> {
  const id = uuidv7();
  await q.query("INSERT INTO users (id, name, email) VALUES ($1,'U',$2)", [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles };
}
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};
const redeem = (who: Principal, c: string) => service.redeem(who, redeemBody.parse({ code: c }));
const referralRows = async (userId: string) =>
  (
    await q.query(
      "SELECT status, reward_paise, rewarded_at FROM referrals WHERE referred_user_id=$1",
      [userId],
    )
  ).rows;

let shared: ReturnType<typeof createTestDb> | undefined;
beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (t, p) => ({ rows: (await pg.db.query(t, p)).rows as Record<string, unknown>[] }),
  };
  tx = {
    transaction: (fn) =>
      pg.db.transaction((t) =>
        fn({
          query: async (text, params) => ({
            rows: (await t.query(text, params)).rows as Record<string, unknown>[],
          }),
        }),
      ),
  };
}, 60_000);

beforeEach(() => {
  enabled = true;
  cap = 3;
  reward = 5000;
  service = new ReferralService({
    repo: new ReferralRepo(q, tx),
    enabled: () => enabled,
    cap: () => cap,
    rewardPaise: () => reward,
  });
});

describe("the flag", () => {
  it("while it is off, every route answers as if it did not exist", async () => {
    enabled = false;
    const a = await person();
    expect(await code(service.summary(a))).toBe("not_found");
    expect(await code(redeem(a, "ABCDEFGH"))).toBe("not_found");
    expect(await service.onFirstConsultationCompleted(a.userId)).toBeNull();
    expect(
      (await q.query("SELECT count(*)::int AS n FROM referral_codes WHERE user_id=$1", [a.userId]))
        .rows[0]?.n,
    ).toBe(0);
  });
});

describe("codes", () => {
  it("a code is made on first ask, is eight characters from a clear alphabet, and never changes", async () => {
    const a = await person();
    const first = await service.summary(a);
    expect(first.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect((await service.summary(a)).code).toBe(first.code);
    expect(first).toMatchObject({
      invited: 0,
      rewarded: 0,
      cap: 3,
      rewardPaise: 5000,
      canRedeem: true,
    });
  });
  it("two people never share a code", async () => {
    const people = await Promise.all(Array.from({ length: 8 }, () => person()));
    const codes = (await Promise.all(people.map((p) => service.summary(p)))).map((s) => s.code);
    expect(new Set(codes).size).toBe(8);
  });
  it("new codes are random and use only the alphabet", () => {
    const seen = new Set(Array.from({ length: 200 }, newCode));
    expect(seen.size).toBe(200);
    for (const c of seen) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
  it("typed codes are forgiven for case and spaces, and nothing else", () => {
    expect(redeemBody.parse({ code: "  abcd2345 " }).code).toBe("ABCD2345");
    for (const bad of [
      "",
      "ABCD234",
      "ABCD23456",
      "ABCD-345",
      "ABCDO345",
      "ABCD1345",
      "ABCD 345",
    ]) {
      expect(redeemBody.safeParse({ code: bad }).success, bad).toBe(false);
    }
    expect(redeemBody.safeParse({ code: "ABCD2345", extra: 1 }).success).toBe(false);
  });
});

describe("using a code", () => {
  it("a new patient can use a friend's code once; the reward is recorded as it was when they joined", async () => {
    const a = await person();
    const b = await person();
    const { code: c } = await service.summary(a);
    expect(await redeem(b, c.toLowerCase())).toEqual({ accepted: true });
    const rows = await referralRows(b.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", reward_paise: 5000, rewarded_at: null });
    expect(await service.summary(a)).toMatchObject({ invited: 1, rewarded: 0 });
    expect((await service.summary(b)).canRedeem).toBe(false);
    // A later change of the reward does not rewrite the promise.
    reward = 9999;
    expect((await referralRows(b.userId))[0]?.reward_paise).toBe(5000);
  });

  it("every refusal reads the same, so the answer reveals nothing about the rule or the code", async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    const { code: codeA } = await service.summary(a);
    await redeem(b, codeA);
    const { code: codeC } = await service.summary(c);
    const attempts: [string, Promise<unknown>][] = [
      ["unknown code", redeem(await person(), "ZZZZ2222")],
      ["own code", redeem(a, codeA)],
      ["already referred", redeem(b, codeC)],
    ];
    const messages = new Set<string>();
    for (const [name, attempt] of attempts) {
      try {
        await attempt;
        throw new Error(`${name} was accepted`);
      } catch (e) {
        expect(e, name).toBeInstanceOf(AppError);
        expect((e as AppError).code, name).toBe("conflict");
        messages.add((e as AppError).detail);
      }
    }
    expect([...messages]).toEqual(["This code cannot be used."]);
  });

  it("not once the person has had a consultation booked", async () => {
    const a = await person();
    const b = await person();
    const patientId = uuidv7();
    await q.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Booked Person','1990-01-01','female',false)`,
      [patientId, b.userId],
    );
    const doctorId = uuidv7();
    await q.query(
      `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
       VALUES ($1,'Dr Ref',$2,'Council','MBBS',$3)`,
      [doctorId, `RE-${doctorId.slice(-8)}`, `${doctorId}@example.com`],
    );
    const start = new Date(Date.UTC(2035, 0, 1) + Math.floor(Math.random() * 1e6) * 1000);
    await q.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
       VALUES ($1,$2,$3,$4,$5,$6,'scheduled',30000)`,
      [uuidv7(), patientId, doctorId, b.userId, start, new Date(start.getTime() + 1_800_000)],
    );
    const { code: c } = await service.summary(a);
    expect((await service.summary(b)).canRedeem).toBe(false);
    expect(await code(redeem(b, c))).toBe("conflict");
    expect(await referralRows(b.userId)).toHaveLength(0);
  });

  it("a held but unpaid booking does not count as a consultation", async () => {
    const a = await person();
    const b = await person();
    const patientId = uuidv7();
    await q.query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Holding Person','1990-01-01','female',false)`,
      [patientId, b.userId],
    );
    const doctorId = uuidv7();
    await q.query(
      `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications, applicant_email)
       VALUES ($1,'Dr Held',$2,'Council','MBBS',$3)`,
      [doctorId, `HD-${doctorId.slice(-8)}`, `${doctorId}@example.com`],
    );
    const start = new Date(Date.UTC(2035, 6, 1) + Math.floor(Math.random() * 1e6) * 1000);
    await q.query(
      `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, hold_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'held',30000, now() + interval '10 minutes')`,
      [uuidv7(), patientId, doctorId, b.userId, start, new Date(start.getTime() + 1_800_000)],
    );
    const { code: c } = await service.summary(a);
    expect(await code(redeem(b, c))).toBe("ok");
  });

  it("two people cannot refer each other", async () => {
    const a = await person();
    const b = await person();
    const { code: codeA } = await service.summary(a);
    const { code: codeB } = await service.summary(b);
    await redeem(b, codeA); // B joined through A
    expect(await code(redeem(a, codeB))).toBe("conflict"); // A cannot join through B
    expect(await referralRows(a.userId)).toHaveLength(0);
  });

  it("one person can refer only so many people", async () => {
    const a = await person();
    const { code: c } = await service.summary(a);
    for (let i = 0; i < 3; i++) expect(await code(redeem(await person(), c))).toBe("ok");
    expect(await code(redeem(await person(), c))).toBe("conflict");
    expect((await service.summary(a)).invited).toBe(3);
    // A rejected referral does not use up the allowance.
    await q.query(
      "UPDATE referrals SET status='rejected' WHERE referrer_user_id=$1 AND id = (SELECT id FROM referrals WHERE referrer_user_id=$1 LIMIT 1)",
      [a.userId],
    );
    expect(await code(redeem(await person(), c))).toBe("ok");
  });

  it("only patients take part; staff get the same 404", async () => {
    for (const roles of [["doctor"], ["admin"], ["support"]] as Role[][]) {
      const s = await person(roles);
      expect(await code(service.summary(s)), roles.join()).toMatch(/^(not_found|forbidden)$/);
      expect(await code(redeem(s, "ABCDEFGH")), roles.join()).toMatch(/^(not_found|forbidden)$/);
    }
  });

  it("a limited session (second method not yet proven) is refused", async () => {
    const a = { ...(await person()), limited: true };
    expect(await code(service.summary(a))).toBe("step_up_required");
  });
});

describe("the reward", () => {
  it("is earned once, when the referred person's first consultation is completed", async () => {
    const a = await person();
    const b = await person();
    await redeem(b, (await service.summary(a)).code);
    expect(await service.onFirstConsultationCompleted(b.userId)).toBe(5000);
    expect(await service.onFirstConsultationCompleted(b.userId)).toBeNull();
    expect((await referralRows(b.userId))[0]?.status).toBe("rewarded");
    expect(await service.summary(a)).toMatchObject({ invited: 1, rewarded: 1 });
    expect(await service.onFirstConsultationCompleted((await person()).userId)).toBeNull();
  });
  it("the database refuses a rewarded referral with no time, or a pending one with a time", async () => {
    const a = await person();
    const b = await person();
    await redeem(b, (await service.summary(a)).code);
    await expect(
      q.query("UPDATE referrals SET status='rewarded' WHERE referred_user_id=$1", [b.userId]),
    ).rejects.toThrow();
    await expect(
      q.query("UPDATE referrals SET rewarded_at=now() WHERE referred_user_id=$1", [b.userId]),
    ).rejects.toThrow();
  });
});
