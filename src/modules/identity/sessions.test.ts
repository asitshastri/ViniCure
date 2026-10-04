import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import type { Queryable } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { IdentityRepo } from "./repo";
import { SessionService, describeDevice, expiredSessionCookie } from "./sessions";

let q: Queryable;
let service: SessionService;
let shared: ReturnType<typeof createTestDb> | undefined;

beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (text, params) => ({
      rows: (await pg.db.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
  service = new SessionService(new IdentityRepo(q));
}, 60_000);

beforeEach(async () => {
  await q.query(`DELETE FROM auth_sessions`);
  await q.query(`DELETE FROM users`);
});

async function user(): Promise<string> {
  const id = uuidv7();
  await q.query(`INSERT INTO users (id, name, email) VALUES ($1, 'U', $2)`, [
    id,
    `${id}@x.invalid`,
  ]);
  return id;
}
async function session(userId: string, opts: { agent?: string; expiresInSec?: number } = {}) {
  const id = uuidv7();
  await q.query(
    `INSERT INTO auth_sessions (id, user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4), '203.0.113.7', $5)`,
    [
      id,
      userId,
      `tok-${id}`,
      opts.expiresInSec ?? 3600,
      opts.agent ?? "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36",
    ],
  );
  return id;
}
const live = async (userId: string) =>
  (await q.query(`SELECT id FROM auth_sessions WHERE user_id = $1`, [userId])).rows.map((r) =>
    String(r.id),
  );
async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
}

describe("listing", () => {
  it("shows only the person's own live sessions, marks the current one, never shows tokens", async () => {
    const a = await user();
    const b = await user();
    const s1 = await session(a);
    const s2 = await session(a, { agent: "Mozilla/5.0 (iPhone) Safari/604.1" });
    await session(a, { expiresInSec: -60 }); // expired
    await session(b);
    const list = await service.list(a, s1);
    expect(list.map((s) => s.id).sort()).toEqual([s1, s2].sort());
    expect(list.find((s) => s.id === s1)?.current).toBe(true);
    expect(list.find((s) => s.id === s2)?.current).toBe(false);
    expect(list.find((s) => s.id === s2)?.device).toBe("Safari on iOS");
    expect(JSON.stringify(list)).not.toContain("tok-");
    expect(Object.keys(list[0] ?? {}).sort()).toEqual([
      "createdAt",
      "current",
      "device",
      "expiresAt",
      "id",
      "ipAddress",
    ]);
  });
});

describe("revoking", () => {
  it("ends one of the person's other sessions", async () => {
    const a = await user();
    const me = await session(a);
    const other = await session(a);
    await service.revoke(a, me, other);
    expect(await live(a)).toEqual([me]);
  });

  it("someone else's session is a 404 and stays alive", async () => {
    const a = await user();
    const b = await user();
    const mine = await session(a);
    const theirs = await session(b);
    expect(await code(service.revoke(a, mine, theirs))).toBe("not_found");
    expect(await live(b)).toEqual([theirs]);
  });

  it("an unknown session is a 404, and the current session must use sign out", async () => {
    const a = await user();
    const me = await session(a);
    expect(await code(service.revoke(a, me, uuidv7()))).toBe("not_found");
    expect(await code(service.revoke(a, me, me))).toBe("conflict");
    expect(await live(a)).toEqual([me]);
  });

  it("'others' keeps the current session; 'all' ends everything; nobody else is touched", async () => {
    const a = await user();
    const b = await user();
    const me = await session(a);
    await session(a);
    await session(a);
    const theirs = await session(b);
    expect(await service.revokeMany(a, me, "others")).toBe(2);
    expect(await live(a)).toEqual([me]);
    expect(await service.revokeMany(a, me, "all")).toBe(1);
    expect(await live(a)).toEqual([]);
    expect(await live(b)).toEqual([theirs]);
  });
});

describe("helpers", () => {
  it("describes devices without echoing the raw header", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")).toBe(
      "Chrome on Windows",
    );
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Edg/120")).toBe(
      "Edge on Windows",
    );
    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0")).toBe(
      "Firefox on Linux",
    );
    expect(describeDevice("<script>alert(1)</script>")).toBe("Unknown device");
    expect(describeDevice(null)).toBe("Unknown device");
  });
  it("the clearing cookie matches the session cookie's attributes", () => {
    expect(expiredSessionCookie(true)).toBe(
      "__Host-vc_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure",
    );
    expect(expiredSessionCookie(false)).toBe(
      "vc_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    );
  });
});
