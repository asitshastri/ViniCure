import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config/config";
import { isOriginAllowed, securityHeaders } from "@/lib/security/headers";

// Runs before every page and API request: Origin check for writes, then security
// headers with a fresh CSP nonce. The backend still enforces access; this is a
// second lock (CLAUDE.md, API section).

function allowedOrigins(): string[] {
  const config = getConfig();
  return [new URL(config.APP_URL).origin, ...config.AUTH_TRUSTED_ORIGINS];
}

function connectOrigins(): string[] {
  const dsn = getConfig().NEXT_PUBLIC_SENTRY_DSN;
  return dsn ? [new URL(dsn).origin] : [];
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const production = process.env.NODE_ENV === "production";

  if (
    !isOriginAllowed({
      method: request.method,
      pathname,
      origin: request.headers.get("origin"),
      host: request.headers.get("host"),
      allowedOrigins: allowedOrigins(),
      allowHostMatch: !production,
    })
  ) {
    return new NextResponse(
      JSON.stringify({
        type: "https://vinicure.example/errors/forbidden",
        title: "Forbidden",
        status: 403,
        code: "forbidden",
        detail: "This request did not come from our site.",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" },
      },
    );
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const headers = securityHeaders({
    nonce,
    production,
    pathname,
    connectOrigins: connectOrigins(),
  });

  // Next.js reads the CSP from the request to put the nonce on its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"] as string);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
