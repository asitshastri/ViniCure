import { errors } from "../../lib/errors/app-error";
import type { IdentityRepo } from "./repo";

// Session management for the signed-in person (P2-10): see where you are signed in, end one
// session, or sign out everywhere. Only the person's own sessions are ever read or deleted
// (the user id is part of every query), and session tokens are never returned.

export type SessionView = {
  id: string;
  current: boolean;
  /** A short description of the browser and device, from the User-Agent. */
  device: string;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
};

/** "Chrome on Windows" and similar. Unknown strings give "Unknown device", never raw text. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.slice(0, 300);
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const system = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}

export class SessionService {
  constructor(private readonly repo: IdentityRepo) {}

  async list(userId: string, currentSessionId: string): Promise<SessionView[]> {
    return (await this.repo.listSessions(userId)).map((row) => ({
      id: row.id,
      current: row.id === currentSessionId,
      device: describeDevice(row.userAgent),
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  /** Ends one of the person's other sessions. Someone else's session is a 404. */
  async revoke(userId: string, currentSessionId: string, sessionId: string): Promise<void> {
    if (sessionId === currentSessionId) {
      throw errors.conflict({ detail: "This is the session you are using. Sign out instead." });
    }
    if (!(await this.repo.revokeSession(userId, sessionId))) throw errors.notFound();
  }

  /** "others" keeps the current session; "all" ends every session including this one. */
  async revokeMany(
    userId: string,
    currentSessionId: string,
    scope: "all" | "others",
  ): Promise<number> {
    return this.repo.revokeSessions(userId, scope === "others" ? currentSessionId : undefined);
  }
}

/** Set-Cookie value that removes the session cookie, with the same attributes it was set with. */
export function expiredSessionCookie(production: boolean): string {
  const name = production ? "__Host-vc_session" : "vc_session";
  return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${production ? "; Secure" : ""}`;
}
