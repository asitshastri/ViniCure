import { randomBytes } from "node:crypto";
// agora-token is a CommonJS package: the worker loads it as plain Node ESM, where only the default
// export is available, so the names are taken from it (a named import crashed the worker at start).
import agoraToken from "agora-token";
import { AdapterError, type VideoProvider } from "./types";

const { RtcRole, RtcTokenBuilder } = agoraToken;

// Agora video (P6-02), behind the VideoProvider interface (ADR-008).
//
// Agora has no "create a room" call: a channel exists while people are in it. So a room is only a
// random name that we make and keep, and a token is built here, on our server, from the app
// certificate. Nothing is sent to Agora to issue a token, so there is no network call to time out
// and nothing to retry.
//
// Failure behaviour: building a token needs no outside service, so it cannot be "unavailable". It
// is refused (invalid_input) for a bad user id, a bad lifetime or a room name that did not come
// from `createRoom`, and "rejected" for a name of the wrong shape.
//
// The token is built for one channel and one user id only, and expires after `ttlSeconds` (the
// whole token and the publish privilege both). Renewal is a new token, asked for through our own
// API, which refuses once the consultation ended or the person was revoked (P6-04).

export type AgoraConfig = {
  appId: string;
  appCertificate: string;
  /** For tests. */
  now?: () => number;
};

/** What `createRoom` makes: 32 characters from the URL-safe alphabet (192 random bits). */
const ROOM = /^[A-Za-z0-9_-]{32}$/;
const MAX_UID = 4_294_967_295;

export class AgoraProvider implements VideoProvider {
  private readonly now: () => number;

  constructor(private readonly config: AgoraConfig) {
    // Agora ids and certificates are 32 hex characters.
    if (!/^[0-9a-f]{32}$/i.test(config.appId) || !/^[0-9a-f]{32}$/i.test(config.appCertificate)) {
      throw new Error("Agora needs an app id and an app certificate of 32 hex characters each");
    }
    this.now = config.now ?? Date.now;
  }

  async createRoom(): Promise<{ roomRef: string }> {
    // 24 random bytes encode to exactly 32 URL-safe characters. Not derived from anything.
    return { roomRef: randomBytes(24).toString("base64url") };
  }

  async issueToken(input: {
    roomRef: string;
    uid: number;
    role: "host" | "audience";
    ttlSeconds: number;
  }): Promise<{ token: string; expiresAt: Date }> {
    if (!ROOM.test(input.roomRef)) throw new AdapterError("rejected", "unknown room");
    if (!Number.isInteger(input.uid) || input.uid <= 0 || input.uid > MAX_UID) {
      throw new AdapterError("invalid_input", "uid must be a positive 32-bit integer");
    }
    if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 7200) {
      throw new AdapterError("invalid_input", "ttlSeconds must be between 60 and 7200");
    }
    const token = RtcTokenBuilder.buildTokenWithUid(
      this.config.appId,
      this.config.appCertificate,
      input.roomRef,
      input.uid,
      input.role === "host" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
      input.ttlSeconds,
      input.ttlSeconds,
    );
    if (!token) throw new AdapterError("invalid_input", "the token could not be built");
    return { token, expiresAt: new Date(this.now() + input.ttlSeconds * 1000) };
  }
}
