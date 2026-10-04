import { APIError } from "better-auth/api";
import { isFreshLogin } from "../session-policy";
import type { SignInDecision, StepUpService } from "./service";

// The glue between Better Auth and the step-up service (P2-18). Better Auth calls these at four
// moments:
//   phone code proven       -> decide how far to trust this sign-in
//   session about to be made -> mark it limited (or unlocked by Google)
//   session made            -> remember or alert about the device
//   number change           -> check the session may do it; afterwards end the other sessions

/** The parts of Better Auth's request context used here. */
export type HookCtx = {
  path?: string;
  body?: unknown;
  request?: Request;
  setCookie: (name: string, value: string, options?: Record<string, unknown>) => unknown;
};

export type StepUpHooksOptions = {
  service: StepUpService;
  production: boolean;
  /** The number on the account now, for telling the old number about a change. */
  phoneOf: (userId: string) => Promise<string | null>;
  /** Reads the session of the current request (for the number change). */
  sessionOf: (
    ctx: HookCtx,
  ) => Promise<{ id: string; userId: string; createdAt: Date; limited: boolean } | null>;
};

const DEVICE_COOKIE_DAYS = 30;

export const deviceCookieName = (production: boolean) =>
  production ? "__Host-vc_device" : "vc_device";

function readCookie(request: Request | undefined, name: string): string | undefined {
  const header = request?.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function createStepUpHooks(options: StepUpHooksOptions) {
  const { service, production } = options;
  const cookieName = deviceCookieName(production);
  // Decisions wait here between "code proven" and "session made", which happen in one request.
  const decisions = new WeakMap<object, SignInDecision>();
  const oldNumbers = new WeakMap<object, string | null>();
  const keyOf = (ctx: HookCtx): object => ctx.request ?? ctx;

  const setDeviceCookie = (ctx: HookCtx, token: string) =>
    ctx.setCookie(cookieName, token, {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_COOKIE_DAYS * 24 * 60 * 60,
    });

  const userAgent = (ctx: HookCtx) => ctx.request?.headers.get("user-agent") ?? null;
  const isUpdateNumber = (ctx: HookCtx) =>
    ctx.path === "/phone-number/verify" &&
    (ctx.body as { updatePhoneNumber?: unknown } | undefined)?.updatePhoneNumber === true;

  return {
    /** A code was proven. For a sign-in: decide. (A number change is handled by `afterNumberChange`.) */
    async onPhoneVerified(userId: string, ctx: HookCtx): Promise<void> {
      if (isUpdateNumber(ctx)) return;
      decisions.set(
        keyOf(ctx),
        await service.decidePhoneSignIn(userId, readCookie(ctx.request, cookieName)),
      );
    },

    /** Called as a session is about to be saved. */
    sessionBefore(ctx: HookCtx | null): { limited?: boolean; unlockMethod?: string } {
      if (!ctx) return {};
      if (ctx.path === "/phone-number/verify") {
        const decision = decisions.get(keyOf(ctx));
        // No decision means we cannot tell: be strict.
        if (!decision) return { limited: true };
        return decision.brandNewAccount
          ? { limited: false, unlockMethod: "new_account" }
          : { limited: decision.limited };
      }
      if (ctx.path?.startsWith("/callback/")) return { limited: false, unlockMethod: "google" };
      return {};
    },

    /** Called after a session was saved. */
    async sessionAfter(
      session: { id: string; userId: string },
      ctx: HookCtx | null,
    ): Promise<void> {
      if (!ctx) return;
      if (ctx.path === "/phone-number/verify") {
        const decision = decisions.get(keyOf(ctx));
        if (!decision) return;
        const done = await service.finishPhoneSignIn({
          userId: session.userId,
          sessionId: session.id,
          decision,
          userAgent: userAgent(ctx),
        });
        if (done.newDeviceToken) setDeviceCookie(ctx, done.newDeviceToken);
      } else if (ctx.path?.startsWith("/callback/")) {
        // Google proved the account: this browser is trusted from now on, and a flag is cleared.
        await service.googleProved(session.userId);
        setDeviceCookie(
          ctx,
          await service.trustThisBrowser(
            session.userId,
            readCookie(ctx.request, cookieName),
            userAgent(ctx),
          ),
        );
      }
    },

    /** Before a number change: only a full session, signed in within the last 15 minutes. */
    async beforeNumberChange(ctx: HookCtx): Promise<void> {
      if (!isUpdateNumber(ctx)) return;
      const session = await options.sessionOf(ctx);
      if (!session) throw new APIError("UNAUTHORIZED", { message: "Sign in first." });
      if (session.limited) {
        throw new APIError("FORBIDDEN", {
          message: "Confirm it is you first.",
          code: "STEP_UP_REQUIRED",
        });
      }
      if (!isFreshLogin(session.createdAt)) {
        throw new APIError("FORBIDDEN", {
          message: "Sign in again to do this.",
          code: "FRESH_LOGIN_REQUIRED",
        });
      }
      oldNumbers.set(keyOf(ctx), await options.phoneOf(session.userId));
    },

    /** After the new number was proven: end the other sessions, forget other devices, tell the old number. */
    async afterNumberChange(ctx: HookCtx): Promise<void> {
      if (!isUpdateNumber(ctx)) return;
      const session = await options.sessionOf(ctx);
      if (!session) return;
      await service.numberChanged({
        userId: session.userId,
        keepSessionId: session.id,
        keepDeviceToken: readCookie(ctx.request, cookieName),
        oldPhone: oldNumbers.get(keyOf(ctx)) ?? null,
      });
    },
  };
}

export type StepUpHooks = ReturnType<typeof createStepUpHooks>;
