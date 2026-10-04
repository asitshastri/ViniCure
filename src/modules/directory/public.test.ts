import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import type { Queryable } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { DirectoryRepo } from "./repo";
import { setDirectoryForTest } from "./index";
import { publicDoctorsQuery } from "./schemas";
import { DirectoryService } from "./service";

// The public directory (P4-03): who is listed, what a visitor sees, filters, sorts, paging.
let q: Queryable;
let service: DirectoryService;

const none = { limit: 50, sort: "name" } as const;
const search = (extra: Record<string, unknown> = {}) =>
  service.searchDoctors(publicDoctorsQuery.parse({ ...extra }));
const names = async (extra: Record<string, unknown> = {}) =>
  (await search(extra)).items.map((i) => i.displayName);

type Seed = {
  name: string;
  fee: number;
  reg: string;
  specialty?: number;
  languages?: string[];
  status?: "pending" | "active" | "suspended";
  kyc?: "pending" | "approved" | "rejected";
};
async function doctor(s: Seed): Promise<string> {
  const id = uuidv7();
  const status = s.status ?? "active";
  const kyc = s.kyc ?? (status === "pending" ? "pending" : "approved");
  await q.query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       languages, consultation_fee_paise, kyc_status, status, applicant_email)
     VALUES ($1,$2,$3,'Gujarat Medical Council','MBBS',$4,$5,$6,$7,$8)`,
    [id, s.name, s.reg, s.languages ?? ["English"], s.fee, kyc, status, `${id}@example.com`],
  );
  if (s.specialty) {
    await q.query("INSERT INTO doctor_specialties VALUES ($1,$2,true)", [id, s.specialty]);
  }
  return id;
}

let ids: Record<string, string> = {};
let shared: ReturnType<typeof createTestDb> | undefined;
beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (text, params) => ({
      rows: (await pg.db.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
  service = new DirectoryService({
    repo: new DirectoryRepo(q),
    storage: () => {
      throw new Error("no storage in these tests");
    },
    queue: async () => {
      throw new Error("no queue in these tests");
    },
  });
  setDirectoryForTest(service);
  await q.query(
    "INSERT INTO specialties (id, name) VALUES (1,'General medicine'),(2,'Dermatology'),(3,'Cardiology')",
  );
  ids = {
    asha: await doctor({
      name: "Dr Asha Rao",
      fee: 30_000,
      reg: "REG-1",
      specialty: 1,
      languages: ["English", "Hindi"],
    }),
    bimal: await doctor({
      name: "Dr Bimal Shah",
      fee: 50_000,
      reg: "REG-2",
      specialty: 2,
      languages: ["Gujarati", "English"],
    }),
    chitra: await doctor({
      name: "Dr Chitra Iyer",
      fee: 20_000,
      reg: "REG-3",
      specialty: 2,
      languages: ["Tamil"],
    }),
    dev: await doctor({ name: "Dr Dev Patel (50% off)", fee: 50_000, reg: "REG-4", specialty: 3 }),
    pending: await doctor({
      name: "Dr Pending",
      fee: 10_000,
      reg: "REG-5",
      specialty: 1,
      status: "pending",
    }),
    rejected: await doctor({
      name: "Dr Rejected",
      fee: 10_000,
      reg: "REG-6",
      specialty: 1,
      status: "pending",
      kyc: "rejected",
    }),
    suspended: await doctor({
      name: "Dr Suspended",
      fee: 10_000,
      reg: "REG-7",
      specialty: 1,
      status: "suspended",
    }),
  };
}, 60_000);

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
};

describe("who is listed", () => {
  it("only approved and active doctors appear in lists, counts and profiles", async () => {
    expect(await names()).toEqual([
      "Dr Asha Rao",
      "Dr Bimal Shah",
      "Dr Chitra Iyer",
      "Dr Dev Patel (50% off)",
    ]);
    for (const hidden of ["pending", "rejected", "suspended"]) {
      expect(await code(service.publicProfile(ids[hidden] as string)), hidden).toBe("not_found");
    }
    expect(await code(service.publicProfile(uuidv7()))).toBe("not_found");
    const specialties = await service.specialties();
    expect(specialties.find((s) => s.id === 1)?.doctorCount).toBe(1); // only Asha, not the three hidden ones
    expect(specialties.map((s) => s.name)).toEqual([
      "Cardiology",
      "Dermatology",
      "General medicine",
    ]);
  });

  it("the profile shows the registration number and qualifications, and nothing private", async () => {
    const profile = await service.publicProfile(ids.asha as string);
    expect(profile).toMatchObject({
      displayName: "Dr Asha Rao",
      registrationNo: "REG-1",
      registrationCouncil: "Gujarat Medical Council",
      qualifications: "MBBS",
      specialty: { id: 1, name: "General medicine" },
    });
    // An exact allow-list: no account, contact, status or review fields.
    expect(Object.keys(profile).sort()).toEqual([
      "availableToday",
      "consultationFeePaise",
      "displayName",
      "id",
      "languages",
      "qualifications",
      "ratingAvg",
      "ratingCount",
      "registrationCouncil",
      "registrationNo",
      "specialty",
    ]);
    const list = (await search()).items[0] as unknown as Record<string, unknown>;
    expect(Object.keys(list)).not.toContain("sortKey");
    expect(JSON.stringify(await search())).not.toMatch(
      /example\.com|applicant|user_id|review_note/,
    );
  });
});

describe("filters", () => {
  it("by specialty, language, fee range and name", async () => {
    expect(await names({ specialtyId: "2" })).toEqual(["Dr Bimal Shah", "Dr Chitra Iyer"]);
    expect(await names({ language: "hindi" })).toEqual(["Dr Asha Rao"]);
    expect(await names({ language: "ENGLISH" })).toEqual([
      "Dr Asha Rao",
      "Dr Bimal Shah",
      "Dr Dev Patel (50% off)",
    ]);
    expect(await names({ feeMin: "25000", feeMax: "50000" })).toEqual([
      "Dr Asha Rao",
      "Dr Bimal Shah",
      "Dr Dev Patel (50% off)",
    ]);
    expect(await names({ q: "chit" })).toEqual(["Dr Chitra Iyer"]);
    expect(await names({ q: "ASHA", specialtyId: "1" })).toEqual(["Dr Asha Rao"]);
  });

  it("search text is a plain substring: % and _ and quotes mean nothing", async () => {
    expect(await names({ q: "%%" })).toEqual([]);
    expect(await names({ q: "__" })).toEqual([]);
    expect(await names({ q: "50%" })).toEqual(["Dr Dev Patel (50% off)"]);
    expect(await names({ q: "' OR 1=1 --" })).toEqual([]);
    expect((await q.query("SELECT count(*)::int AS n FROM doctors")).rows[0]?.n).toBe(7);
  });

  it("available today: a rule for today's weekday (India time), minus leave", async () => {
    const dow = Number(
      (await q.query("SELECT extract(dow FROM now() AT TIME ZONE 'Asia/Kolkata')::int AS d"))
        .rows[0]?.d,
    );
    const rule = (doctorId: string, weekday: number) =>
      q.query(
        `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from)
         VALUES ($1,$2,$3,'00:00','24:00',60,'2020-01-01')`,
        [uuidv7(), doctorId, weekday],
      );
    await rule(ids.asha as string, dow);
    await rule(ids.bimal as string, (dow + 1) % 7);
    await rule(ids.chitra as string, dow);
    // Chitra is on leave for the whole of today.
    await q.query(
      `INSERT INTO doctor_time_off (id, doctor_id, start_at, end_at)
       VALUES ($1,$2, now() - interval '2 days', now() + interval '2 days')`,
      [uuidv7(), ids.chitra],
    );
    expect(await names({ availableToday: "true" })).toEqual(["Dr Asha Rao"]);
    const all = (await search()).items;
    expect(all.find((i) => i.displayName === "Dr Asha Rao")?.availableToday).toBe(true);
    expect(all.find((i) => i.displayName === "Dr Bimal Shah")?.availableToday).toBe(false);
    expect(all.find((i) => i.displayName === "Dr Chitra Iyer")?.availableToday).toBe(false);
    // A pending doctor with a rule is still not listed.
    await rule(ids.pending as string, dow);
    expect(await names({ availableToday: "true" })).toEqual(["Dr Asha Rao"]);
  });
});

describe("sorting and paging", () => {
  const pageAll = async (sort: string, limit: number) => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await search({ sort, limit: String(limit), ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map((i) => i.displayName));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    return { seen, pages };
  };

  it("by name, fee ascending and fee descending, each paged without repeats or gaps", async () => {
    expect(await pageAll("name", 2)).toEqual({
      seen: ["Dr Asha Rao", "Dr Bimal Shah", "Dr Chitra Iyer", "Dr Dev Patel (50% off)"],
      pages: 2,
    });
    const asc = await pageAll("fee_asc", 1);
    expect(asc.seen[0]).toBe("Dr Chitra Iyer");
    expect(asc.seen).toHaveLength(4);
    expect(new Set(asc.seen).size).toBe(4);
    const desc = await pageAll("fee_desc", 3);
    expect(desc.seen.slice(-1)).toEqual(["Dr Chitra Iyer"]);
    expect(new Set(desc.seen).size).toBe(4);
    // Ties on the fee (two at ₹500) keep a stable order by id.
    expect((await pageAll("fee_desc", 1)).seen).toEqual(desc.seen);
  });

  it("a page link only works with the sort it was made for, and forged links are refused", async () => {
    const page = await search({ sort: "fee_asc", limit: "1" });
    expect(page.nextCursor).not.toBeNull();
    expect(await code(search({ sort: "name", cursor: page.nextCursor as string }))).toBe(
      "validation_failed",
    );
    for (const bad of [
      "x",
      Buffer.from("{}").toString("base64url"),
      Buffer.from(
        JSON.stringify({ s: "fee_asc", k: "1; DROP TABLE doctors", i: uuidv7() }),
      ).toString("base64url"),
    ]) {
      expect(await code(search({ sort: "fee_asc", cursor: bad })), bad).toBe("validation_failed");
    }
  });
});

describe("the query is an allow-list", () => {
  it("refuses unknown fields, sorts and impossible ranges", () => {
    expect(publicDoctorsQuery.safeParse({ ...none, sort: "password" }).success).toBe(false);
    expect(publicDoctorsQuery.safeParse({ orderBy: "fee" }).success).toBe(false);
    expect(publicDoctorsQuery.safeParse({ status: "pending" }).success).toBe(false);
    expect(publicDoctorsQuery.safeParse({ feeMin: "500", feeMax: "100" }).success).toBe(false);
    expect(publicDoctorsQuery.safeParse({ limit: "1000" }).success).toBe(false);
    expect(publicDoctorsQuery.safeParse({ availableToday: "yes" }).success).toBe(false);
    expect(publicDoctorsQuery.safeParse({}).success).toBe(true);
  });
});

describe("the routes", () => {
  const call = async (path: string, route: string) => {
    const mod = (await import(/* @vite-ignore */ route)) as {
      GET: (r: Request, c?: unknown) => Promise<Response>;
    };
    const url = new URL(path, "http://localhost:3000");
    const segments = url.pathname.split("/");
    return mod.GET(new Request(url, { headers: { host: "localhost:3000" } }), {
      params: Promise.resolve({ id: segments[segments.length - 1] }),
    });
  };

  it("send cache headers on every public answer, and no cookies", async () => {
    const list = await call("/api/v1/doctors?specialtyId=2", "../../app/api/v1/doctors/route");
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toMatch(
      /^public, max-age=60, s-maxage=60, stale-while-revalidate=\d+$/,
    );
    expect(list.headers.get("set-cookie")).toBeNull();
    const specialties = await call("/api/v1/specialties", "../../app/api/v1/specialties/route");
    expect(specialties.headers.get("cache-control")).toContain("max-age=3600");
    const profile = await call(
      `/api/v1/doctors/${ids.asha}`,
      "../../app/api/v1/doctors/[id]/route",
    );
    expect(profile.status).toBe(200);
    expect(profile.headers.get("cache-control")).toContain("public");
  });

  it("errors are never cached: a hidden doctor is 404 and a bad query is 422", async () => {
    const hidden = await call(
      `/api/v1/doctors/${ids.pending}`,
      "../../app/api/v1/doctors/[id]/route",
    );
    expect(hidden.status).toBe(404);
    expect(hidden.headers.get("cache-control")).toBe("no-store");
    const bad = await call("/api/v1/doctors?sort=password", "../../app/api/v1/doctors/route");
    expect(bad.status).toBe(422);
    expect(bad.headers.get("cache-control")).toBe("no-store");
  });
});
