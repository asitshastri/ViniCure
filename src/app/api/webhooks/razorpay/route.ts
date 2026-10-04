import { withApi } from "@/lib/api/with-api";
import { logger } from "@/lib/logging/logger";
import { getWebhook } from "@/modules/payments";

// Razorpay's callback (P5-05). No session: the signature over the raw body is the credential. The
// body is read once as text and verified before it is parsed. A bad signature is refused and
// stored nowhere; a repeat of an event we already hold is acknowledged and ignored. The real work
// happens in the worker, so this answers quickly and Razorpay does not retry.

export const POST = withApi(
  {
    method: "POST",
    path: "/api/webhooks/razorpay",
    auth: "public",
    rateLimit: "webhook",
    doc: { summary: "Razorpay payment and refund events (signed)", tags: ["payments"] },
  },
  async ({ request }) => {
    const rawBody = await request.text();
    const result = await getWebhook().receive({
      rawBody,
      signature: request.headers.get("x-razorpay-signature") ?? "",
      eventIdHeader: request.headers.get("x-razorpay-event-id"),
    });
    if (result === "bad_signature") {
      // A security event: logged without the body or the signature.
      logger.warn({ event: "webhook_bad_signature", bytes: rawBody.length });
      return new Response(JSON.stringify({ status: "refused" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ status: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
);
