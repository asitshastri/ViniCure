import { AccessToken2 } from "agora-token/src/AccessToken2";
import { describe, expect, it } from "vitest";
import { AgoraProvider } from "./agora";
import { videoContract } from "./contract";
import { AdapterError } from "./types";

// The real Agora token builder, no network needed: the token is built here. The contract suite
// every VideoProvider passes, then what is inside the tokens.
const APP_ID = "0123456789abcdef0123456789abcdef";
const CERT = "fedcba9876543210fedcba9876543210";
const make = (now?: () => number) =>
  new AgoraProvider({ appId: APP_ID, appCertificate: CERT, ...(now ? { now } : {}) });

videoContract(() => make());

/** Opens a token the way Agora's servers would, with the certificate. */
function open(token: string) {
  const parsed = new AccessToken2();
  expect(parsed.from_string(token)).toBe(true);
  return parsed;
}

describe("AgoraProvider specifics", () => {
  it("rooms are 32 random URL-safe characters, never repeated", async () => {
    const video = make();
    const rooms = await Promise.all(Array.from({ length: 200 }, () => video.createRoom()));
    const refs = new Set(rooms.map((r) => r.roomRef));
    expect(refs.size).toBe(200);
    for (const ref of refs) expect(ref).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("a token carries our app id, this channel, this user id and the requested lifetime, and nothing else", async () => {
    const video = make(() => 1_800_000_000_000);
    const { roomRef } = await video.createRoom();
    const { token, expiresAt } = await video.issueToken({
      roomRef,
      uid: 424242,
      role: "host",
      ttlSeconds: 3600,
    });
    expect(token.startsWith("007")).toBe(true);
    expect(expiresAt.getTime()).toBe(1_800_000_000_000 + 3_600_000);
    const parsed = open(token);
    expect(String(parsed.appId)).toBe(APP_ID);
    expect(parsed.expire).toBe(3600);
    expect(parsed.services).toHaveLength(1);
    const service = parsed.services[0] as {
      __channel_name: Buffer | string;
      __uid: Buffer | string;
      __privileges: Map<number, number> | Record<number, number>;
    };
    expect(String(service.__channel_name)).toBe(roomRef);
    expect(String(service.__uid)).toBe("424242");
    // Every privilege (join, publish audio, video, data) lasts at most as long as the token.
    const privileges = [
      ...(service.__privileges instanceof Map
        ? service.__privileges.values()
        : Object.values(service.__privileges)),
    ];
    expect(privileges.length).toBeGreaterThan(0);
    for (const seconds of privileges) expect(seconds).toBeLessThanOrEqual(3600);
  });

  it("the certificate never appears in the token, and a different certificate cannot have made it", async () => {
    const video = make();
    const { roomRef } = await video.createRoom();
    const { token } = await video.issueToken({ roomRef, uid: 1, role: "host", ttlSeconds: 600 });
    expect(token).not.toContain(CERT);
    expect(Buffer.from(token.slice(3), "base64").toString("latin1")).not.toContain(CERT);
    const other = new AgoraProvider({
      appId: APP_ID,
      appCertificate: "11111111111111111111111111111111",
    });
    const { token: t2 } = await other.issueToken({
      roomRef,
      uid: 1,
      role: "host",
      ttlSeconds: 600,
    });
    expect(t2).not.toBe(token);
  });

  it("a token for one user is not a token for another", async () => {
    const video = make();
    const { roomRef } = await video.createRoom();
    const a = await video.issueToken({ roomRef, uid: 11, role: "host", ttlSeconds: 600 });
    const b = await video.issueToken({ roomRef, uid: 12, role: "host", ttlSeconds: 600 });
    expect(String((open(a.token).services[0] as { __uid: Buffer }).__uid)).toBe("11");
    expect(String((open(b.token).services[0] as { __uid: Buffer }).__uid)).toBe("12");
  });

  it("refuses ids and lifetimes that make no sense, and rooms we did not make", async () => {
    const video = make();
    const { roomRef } = await video.createRoom();
    const bad = async (input: Parameters<AgoraProvider["issueToken"]>[0], kind: string) => {
      const error = await video.issueToken(input).catch((e: unknown) => e);
      expect(error, JSON.stringify(input)).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).kind).toBe(kind);
    };
    await bad({ roomRef, uid: 4_294_967_296, role: "host", ttlSeconds: 600 }, "invalid_input");
    await bad({ roomRef, uid: 1.5, role: "host", ttlSeconds: 600 }, "invalid_input");
    await bad({ roomRef, uid: -1, role: "host", ttlSeconds: 600 }, "invalid_input");
    await bad({ roomRef, uid: 1, role: "host", ttlSeconds: 59.5 }, "invalid_input");
    await bad({ roomRef: "short", uid: 1, role: "host", ttlSeconds: 600 }, "rejected");
    await bad({ roomRef: `${roomRef}x`, uid: 1, role: "host", ttlSeconds: 600 }, "rejected");
    await bad({ roomRef: "a".repeat(31), uid: 1, role: "host", ttlSeconds: 600 }, "rejected");
    await bad(
      { roomRef: "../../etc/passwd../../etc/passwd", uid: 1, role: "host", ttlSeconds: 600 },
      "rejected",
    );
  });

  it("needs a real app id and certificate to start", () => {
    for (const bad of [
      { appId: "", appCertificate: CERT },
      { appId: APP_ID, appCertificate: "" },
      { appId: "xyz", appCertificate: CERT },
      { appId: APP_ID, appCertificate: "not-hex-not-hex-not-hex-not-hex-" },
    ]) {
      expect(() => new AgoraProvider(bad)).toThrow(/32 hex/);
    }
  });
});
