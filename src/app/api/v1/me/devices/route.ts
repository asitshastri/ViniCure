import { withApi } from "@/lib/api/with-api";
import { listTrustedDevices } from "@/modules/identity";

// Browsers this patient unlocked with a second method (or registered at sign-up), remembered
// for 30 days. Revoking one makes its next phone sign-in limited again (P2-18).

export const GET = withApi(
  {
    method: "GET",
    path: "/api/v1/me/devices",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "auth_read",
    fullSession: true,
    doc: { summary: "List remembered devices", tags: ["identity"] },
  },
  async ({ actor }) => ({
    items: (await listTrustedDevices(actor.userId)).map((d) => ({
      id: d.id,
      label: d.label ?? "Unknown device",
      unlockedAt: d.unlockedAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
      expiresAt: d.expiresAt.toISOString(),
    })),
  }),
);
