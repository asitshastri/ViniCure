import { createHmac } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, db, patientSignIn, run } from "./helpers";
import { STUB } from "./razorpay-stub";

// Paying for a booking in a real browser (P5-04): the app's real code and real adapter, with
// Razorpay's widget and API replaced by stand-ins (e2e/razorpay-stub.ts and a fake checkout.js).

async function accessible(page: Page) {
  await page.waitForTimeout(500);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    page.url(),
  ).toEqual([]);
}

type Mode = "pay" | "dismiss" | "badsig" | "underpay" | "fail";
const WIDGET = `window.Razorpay = class {
  constructor(o) { this.o = o; this.h = {}; }
  on(e, cb) { this.h[e] = cb; }
  open() {
    window.__e2ePay(this.o.order_id, this.o.amount).then((r) => {
      if (!r) return this.o.modal.ondismiss();
      if (r.failed) { if (this.h["payment.failed"]) this.h["payment.failed"]({ error: { code: "BAD_REQUEST_ERROR" } }); return this.o.modal.ondismiss(); }
      this.o.handler(r);
    });
  }
};`;

async function installWidget(page: Page, mode: { current: Mode; beforePay?: () => Promise<void> }) {
  await page.exposeFunction("__e2ePay", async (orderId: string) => {
    await mode.beforePay?.();
    if (mode.current === "dismiss") return null;
    if (mode.current === "fail") return { failed: true };
    const response = await fetch(`${STUB.baseUrl}/__capture`, {
      method: "POST",
      body: JSON.stringify({ orderId, ...(mode.current === "underpay" ? { amount: 100 } : {}) }),
    });
    const paid = (await response.json()) as { paymentId: string; signature: string };
    return {
      razorpay_payment_id: paid.paymentId,
      razorpay_order_id: orderId,
      razorpay_signature: mode.current === "badsig" ? "0".repeat(64) : paid.signature,
    };
  });
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: WIDGET }),
  );
}

let doctorId = "";
const NAME = `Dr Payer${run}`;

test.beforeAll(async () => {
  doctorId = crypto.randomUUID();
  await db().query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       consultation_fee_paise, kyc_status, status, applicant_email)
     VALUES ($1,$2,$3,'E2E Council','MBBS',45000,'approved','active',$4)`,
    [doctorId, NAME, `PAY-${run}`, `${doctorId}@no-email.invalid`],
  );
  for (let weekday = 0; weekday < 7; weekday++) {
    await db().query(
      `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from)
       VALUES ($1,$2,$3,'00:00','24:00',30,'2020-01-01')`,
      [crypto.randomUUID(), doctorId, weekday],
    );
  }
});
test.afterAll(closeDb);
test.beforeEach(async () => {
  await fetch(`${STUB.baseUrl}/__reset`, { method: "POST", body: "{}" });
});

/** Signs a new patient in and walks the booking to the "Review and pay" step. */
async function toReview(page: Page, slotIndex = 0) {
  await patientSignIn(page);
  await page.goto(`/doctors/${doctorId}`);
  await page.locator(`a[href^="/book/${doctorId}?slot="]`).nth(slotIndex).click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^continue/i }).click();
  await page.getByLabel("Your full name").fill("Pay Patient");
  await page.getByLabel("Date of birth").fill("1988-03-09");
  await page.getByLabel("Sex").selectOption("female");
  await page.getByRole("button", { name: /save and continue/i }).click();
  await page.getByLabel(/what do you need help with/i).fill("Follow-up for the payment test");
  await page.getByLabel(/i understand this is an online consultation/i).check();
  await page.getByRole("button", { name: /hold this time and review/i }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Review and pay/ })).toBeVisible();
  const row = (
    await db().query(
      `SELECT id FROM appointments WHERE doctor_id=$1 AND status='held' ORDER BY created_at DESC LIMIT 1`,
      [doctorId],
    )
  ).rows[0] as { id: string };
  return row.id;
}
const rows = async (appt: string) =>
  (
    await db().query(
      `SELECT status, amount_paise, gateway_payment_id FROM payments WHERE appointment_id=$1 ORDER BY created_at, id`,
      [appt],
    )
  ).rows;
const apptStatus = async (appt: string) =>
  String((await db().query(`SELECT status FROM appointments WHERE id=$1`, [appt])).rows[0]?.status);

test("paying confirms the booking, and the server decided the amount", async ({ page }) => {
  const mode = { current: "pay" as Mode };
  await installWidget(page, mode);
  const appt = await toReview(page, 0);
  await page.getByRole("button", { name: /^pay /i }).click();
  await expect(page.getByRole("heading", { name: /Your consultation is booked/ })).toBeVisible();
  await accessible(page);
  expect(await apptStatus(appt)).toBe("scheduled");
  const payments = await rows(appt);
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({ status: "captured", amount_paise: 45000 });
  expect(String(payments[0]?.gateway_payment_id)).toMatch(/^pay_e2e/);
  const state = (await (
    await fetch(`${STUB.baseUrl}/__state`, { method: "POST", body: "{}" })
  ).json()) as { orders: [string, { amount: number }][] };
  expect(state.orders.map(([, o]) => o.amount)).toEqual([45000]);
});

test("closing the widget keeps the hold; paying again makes a fresh order and succeeds", async ({
  page,
}) => {
  const mode = { current: "dismiss" as Mode };
  await installWidget(page, mode);
  const appt = await toReview(page, 1);
  await page.getByRole("button", { name: /^pay /i }).click();
  await expect(page.getByText(/You closed the payment window/)).toBeVisible();
  await accessible(page);
  expect(await apptStatus(appt)).toBe("held");
  expect((await rows(appt)).map((r) => r.status)).toEqual(["created"]);
  mode.current = "pay";
  await page.getByRole("button", { name: /^pay /i }).click();
  await expect(page.getByRole("heading", { name: /Your consultation is booked/ })).toBeVisible();
  expect((await rows(appt)).map((r) => r.status)).toEqual(["created", "captured"]);
});

test("a failed payment says so and can be retried", async ({ page }) => {
  const mode = { current: "fail" as Mode };
  await installWidget(page, mode);
  const appt = await toReview(page, 2);
  await page.getByRole("button", { name: /^pay /i }).click();
  await expect(page.getByText(/The payment did not go through. Nothing was charged/)).toBeVisible();
  expect(await apptStatus(appt)).toBe("held");
  mode.current = "pay";
  await page.getByRole("button", { name: /^pay /i }).click();
  await expect(page.getByRole("heading", { name: /Your consultation is booked/ })).toBeVisible();
});

test("a tampered signature or a smaller amount is not accepted, and nothing is confirmed", async ({
  page,
}) => {
  for (const [slot, mode] of [
    [3, "badsig"],
    [4, "underpay"],
  ] as const) {
    const ctx = await page.context().browser()!.newContext();
    const p = await ctx.newPage();
    await installWidget(p, { current: mode });
    const appt = await toReview(p, slot);
    await p.getByRole("button", { name: /^pay /i }).click();
    await expect(
      p.getByRole("heading", { name: /We could not confirm your payment/ }),
    ).toBeVisible();
    await accessible(p);
    expect(await apptStatus(appt), mode).toBe("held");
    expect(
      (await rows(appt)).map((r) => r.status),
      mode,
    ).toEqual(["created"]);
    await ctx.close();
  }
});

test("when the time was taken while paying, the patient is told and a full refund is started", async ({
  page,
}) => {
  let appt = "";
  const mode = {
    current: "pay" as Mode,
    // The hold is gone (another person got the time) after the order exists, before the payment lands.
    beforePay: async () => {
      await db().query(
        `UPDATE appointments SET status='cancelled_by_admin', hold_expires_at=NULL WHERE id=$1`,
        [appt],
      );
    },
  };
  await installWidget(page, mode);
  appt = await toReview(page, 5);
  await page.getByRole("button", { name: /^pay /i }).click();
  await expect(
    page.getByRole("heading", { name: /That time was taken, so we are refunding you/ }),
  ).toBeVisible();
  await accessible(page);
  expect(await apptStatus(appt)).toBe("cancelled_by_admin");
  const refunds = (
    await db().query(
      `SELECT r.amount_paise, r.status, r.gateway_refund_id FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=$1`,
      [appt],
    )
  ).rows;
  expect(refunds).toHaveLength(1);
  expect(refunds[0]).toMatchObject({ amount_paise: 45000, status: "initiated" });
  expect(refunds[0]?.gateway_refund_id).toBeTruthy();
  const state = (await (
    await fetch(`${STUB.baseUrl}/__state`, { method: "POST", body: "{}" })
  ).json()) as { refunds: { amount: number }[] };
  expect(state.refunds.map((r) => r.amount)).toEqual([45000]);
});

test("the order route refuses an amount from the client and anyone else's appointment", async ({
  page,
}) => {
  const mode = { current: "pay" as Mode };
  await installWidget(page, mode);
  const appt = await toReview(page, 6);
  const origin = new URL(page.url()).origin;
  const post = (data: unknown, key: string) =>
    page.request.post("/api/v1/payments/orders", {
      data,
      headers: { origin, "idempotency-key": key },
    });
  const tamper = await post({ appointmentId: appt, amountPaise: 1 }, "e2e-tamper-key-0001");
  expect(tamper.status()).toBe(422);
  const stranger = await post({ appointmentId: crypto.randomUUID() }, "e2e-stranger-key-001");
  expect(stranger.status()).toBe(404);
  const ok = await post({ appointmentId: appt }, "e2e-fine-key-000000001");
  expect(ok.status()).toBe(201);
  expect((await ok.json()) as { amountPaise: number }).toMatchObject({
    amountPaise: 45000,
    keyId: STUB.keyId,
  });
  // The same key again returns the same order.
  const again = await post({ appointmentId: appt }, "e2e-fine-key-000000001");
  expect(((await again.json()) as { orderId: string }).orderId).toBe(
    ((await ok.json()) as { orderId: string }).orderId,
  );
});

test("the webhook refuses a bad signature, accepts a signed event once, and stores no personal details", async ({
  request,
}) => {
  const event = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_e2ehook0001",
          order_id: "order_E2Eunknown1",
          amount: 100,
          status: "captured",
          email: "payer@example.com",
          contact: "+919999999999",
        },
      },
    },
  });
  const sign = (body: string) =>
    createHmac("sha256", STUB.webhookSecret).update(body).digest("hex");
  const eventId = `evt_e2e_${run}_one`;
  const post = (signature: string) =>
    request.post("/api/webhooks/razorpay", {
      data: event,
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
    });
  expect((await post("0".repeat(64))).status()).toBe(401);
  expect(
    (await db().query(`SELECT 1 FROM payment_events WHERE gateway_event_id=$1`, [eventId])).rows,
  ).toHaveLength(0);
  const good = await post(sign(event));
  expect(good.status()).toBe(200);
  expect(await good.json()).toEqual({ status: "accepted" });
  expect(await (await post(sign(event))).json()).toEqual({ status: "duplicate" });
  const stored = (
    await db().query(`SELECT payload, signature_ok FROM payment_events WHERE gateway_event_id=$1`, [
      eventId,
    ])
  ).rows;
  expect(stored).toHaveLength(1);
  expect(stored[0]?.signature_ok).toBe(true);
  expect(JSON.stringify(stored[0]?.payload)).not.toMatch(/payer@example|9999999999|email|contact/);
});
