import { mockSessions } from "@/mocks/session";
import type { MockSession, Role } from "@/lib/types";

// Components get data through this layer only. In P2 this reads the real session.
export function getSession(role: Role): MockSession {
  return mockSessions[role];
}
