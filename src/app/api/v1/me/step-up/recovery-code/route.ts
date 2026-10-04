import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { getConfig } from "@/lib/config/config";
import { withApi } from "@/lib/api/with-api";
import { deviceCookieName, getCodeAttempts, getStepUp } from "@/modules/identity";

// Unlocks a limited session with a recovery code (P2-18, D-019). A code works once. Five wrong
// codes lock guessing for 15 minutes. On success this browser is remembered for 30 days and the
// patient is told through their other contact methods. A limited session may call it: that is
// its whole purpose.

const body = z.strictObject({ code: z.string().min(10).max(24) });

export const POST = withApi(
  {
    method: "POST",
    path: "/api/v1/me/step-up/recovery-code",
    auth: "session",
    roles: ["patient"],
    roleDenied: "not_found",
    rateLimit: "otp_verify",
    body,
    audit: { action: "step_up.recovery_code", entity: "session" },
    doc: { summary: "Unlock a limited session with a recovery code", tags: ["identity"] },
  },
  async ({ actor, body: input, request }) => {
    const attempts = getCodeAttempts();
    await attempts.assertOpen(actor.userId);
    const unlocked = await getStepUp().unlockWithRecoveryCode({
      userId: actor.userId,
      sessionId: actor.sessionId,
      code: input.code,
    });
    if (!unlocked) {
      await attempts.recordWrong(actor.userId);
      throw new AppError("bad_request", { detail: "That code is not valid or was already used." });
    }
    await attempts.recordRight(actor.userId);

    // Remember this browser: the cookie carries a random token; only its hash is stored.
    const production = getConfig().NODE_ENV === "production";
    const cookieHeader = request.headers.get("cookie") ?? "";
    const name = deviceCookieName(production);
    const existing = cookieHeader
      .split(";")
      .map((p) => p.trim().split("="))
      .find(([key]) => key === name)?.[1];
    const token = await getStepUp().trustThisBrowser(
      actor.userId,
      existing ? decodeURIComponent(existing) : undefined,
      request.headers.get("user-agent"),
    );
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append(
      "Set-Cookie",
      `${name}=${encodeURIComponent(token)}; Max-Age=${30 * 24 * 60 * 60}; Path=/; HttpOnly; SameSite=Lax${production ? "; Secure" : ""}`,
    );
    return new Response(JSON.stringify({ unlocked: true }), { status: 200, headers });
  },
);
