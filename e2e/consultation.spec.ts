import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, db, patientSignIn, run } from "./helpers";

// The patient's way into a video consultation (P6-06), in a real browser with Chromium's fake
// camera and microphone and the server's fake video provider: device check, consent, waiting room,
// the call with its controls, reconnecting, token renewal, and the doctor ending it.

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

const NAME = `Dr Caller${run}`;
let doctorId = "";

test.beforeAll(async () => {
  doctorId = crypto.randomUUID();
  await db().query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       consultation_fee_paise, kyc_status, status, applicant_email)
     VALUES ($1,$2,$3,'E2E Council','MBBS',30000,'approved','active',$4)`,
    [doctorId, NAME, `CALL-${run}`, `${doctorId}@no-email.invalid`],
  );
  // The two texts a video visit needs. They never change or go away once loaded, so these are
  // simply the newest ones in force.
  const version = `e2e-${run}`;
  for (const kind of ["telemedicine", "video"]) {
    const body = `E2E placeholder ${kind} text ${version}. Not legal wording.`;
    await db().query(
      `INSERT INTO consent_policies (id, kind, version, language, body, content_hash, effective_from)
       VALUES ($1,$2,$3,'en',$4,$5, CURRENT_DATE + 1) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), kind, version, body, createHash("sha256").update(body).digest("hex")],
    );
  }
});
test.afterAll(closeDb);

/** A paid, confirmed booking for the signed-in patient, starting `startInMinutes` from now. */
async function booking(phone: string, startInMinutes: number, paid = true) {
  const user = (await db().query("SELECT id FROM users WHERE phone_number = $1", [`+91${phone}`]))
    .rows[0] as { id: string };
  // One "myself" profile per account: reuse it when the test already made it.
  let patient = (
    (
      await db().query("SELECT id FROM patients WHERE account_user_id=$1 AND relation='self'", [
        user.id,
      ])
    ).rows[0] as { id: string } | undefined
  )?.id;
  if (!patient) {
    patient = crypto.randomUUID();
    await db().query(
      `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
       VALUES ($1,$2,'self','Call Patient','1990-01-01','female',false)`,
      [patient, user.id],
    );
  }
  // Each booking has its own doctor row, so bookings made at the same time never collide.
  const doctor = crypto.randomUUID();
  await db().query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       consultation_fee_paise, kyc_status, status, applicant_email)
     VALUES ($1,$2,$3,'E2E Council','MBBS',30000,'approved','active',$4)`,
    [doctor, NAME, `CALL-${doctor.slice(-8)}`, `${doctor}@no-email.invalid`],
  );
  const appt = crypto.randomUUID();
  const start = new Date(Date.now() + startInMinutes * 60_000);
  await db().query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise)
     VALUES ($1,$2,$3,$4,$5,$6,'scheduled',30000)`,
    [appt, patient, doctor, user.id, start, new Date(start.getTime() + 30 * 60_000)],
  );
  if (paid) {
    await db().query(
      `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, status, gateway_order_id, gateway_payment_id, idempotency_key, captured_at)
       VALUES ($1,$2,$3,30000,'captured',$4,$5,$6, now())`,
      [
        crypto.randomUUID(),
        appt,
        user.id,
        `order_${appt}`,
        `pay_${appt.slice(-12)}`,
        `key-${appt}-0000000`,
      ],
    );
  }
  return { appt, user: user.id, patient };
}

async function checkDevices(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /check my camera and microphone/i }).click();
  await expect(page.getByRole("button", { name: /join the waiting room/i })).toBeEnabled();
}

test("device check, consent, waiting room, the call, reconnecting, renewal, and the doctor ending it", async ({
  page,
}) => {
  const phone = await patientSignIn(page);
  const { appt, user } = await booking(phone, 3);
  await page.goto(`/consultation/${appt}/lobby`);
  await expect(page.getByRole("heading", { level: 1, name: /Get ready to join/ })).toBeVisible();
  await expect(page.getByText(NAME).first()).toBeVisible();
  await checkDevices(page);
  await accessible(page);

  // Joining asks for the consent texts first.
  await page.getByRole("button", { name: /join the waiting room/i }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Before your video consultation/ }),
  ).toBeVisible();
  await accessible(page);
  const agree = page.getByRole("button", { name: /agree and continue/i });
  await expect(agree).toBeDisabled();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await agree.click();

  // Waiting for the doctor, then the call itself.
  await expect(page.getByRole("heading", { level: 1, name: /Consultation with/ })).toBeVisible();
  await accessible(page);
  // The seat and the agreements are on record.
  const seat = await db().query(
    `SELECT provider_uid, role FROM consultation_participants WHERE user_id=$1`,
    [user],
  );
  expect(seat.rows).toHaveLength(1);
  expect(seat.rows[0]).toMatchObject({ role: "patient" });
  const agreements = await db().query(
    `SELECT count(*)::int AS n FROM user_consents WHERE user_id=$1 AND withdrawn_at IS NULL`,
    [user],
  );
  expect(agreements.rows[0]?.n).toBe(2);

  // The other person's picture and sound play in the main tile.
  await expect(page.getByLabel(`${NAME}, video`)).toBeVisible();
  await expect(page.getByText("Connection good")).toBeVisible();

  // Controls.
  const mute = page.getByRole("button", { name: "Mute microphone" });
  await mute.click();
  await expect(page.getByRole("button", { name: "Unmute microphone" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Unmute microphone" }).click();

  // A weak network, a dropped connection and coming back.
  await page.evaluate(() => window.__fakeVideo?.quality("weak"));
  await expect(page.getByText("Connection weak")).toBeVisible();
  await page.evaluate(() => window.__fakeVideo?.drop());
  await expect(page.getByRole("alert").getByText(/Reconnecting/)).toBeVisible();
  await accessible(page);
  await page.evaluate(() => window.__fakeVideo?.restore());
  await expect(page.getByRole("alert").getByText(/Reconnecting/)).toHaveCount(0);

  // The token is renewed through our server when the SDK says it is about to lapse.
  await page.evaluate(() => window.__fakeVideo?.expireToken());
  await expect
    .poll(() => page.evaluate(() => window.__fakeVideo?.renewals.length ?? 0))
    .toBeGreaterThan(0);

  // The other person leaves.
  await page.evaluate(() => window.__fakeVideo?.remoteLeaves());
  await expect(page.getByText(/has left the call/)).toBeVisible();

  // The doctor ends the consultation. The next renewal is refused, and the patient is told.
  await db().query(
    `UPDATE consultations SET status='ended', started_at=now(), ended_at=now() WHERE appointment_id=$1`,
    [appt],
  );
  await db().query(
    `UPDATE consultation_participants SET revoked_at=now()
      WHERE consultation_id=(SELECT id FROM consultations WHERE appointment_id=$1)`,
    [appt],
  );
  await page.evaluate(() => window.__fakeVideo?.expireToken());
  await expect(
    page.getByRole("heading", { name: /Your doctor ended the consultation/ }),
  ).toBeVisible();
  await accessible(page);
});

test("a second visit goes straight in: the agreements are already on record", async ({ page }) => {
  const phone = await patientSignIn(page);
  const first = await booking(phone, 3);
  await page.goto(`/consultation/${first.appt}/lobby`);
  await checkDevices(page);
  await page.getByRole("button", { name: /join the waiting room/i }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Before your video consultation/ }),
  ).toBeVisible();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: /agree and continue/i }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Consultation with/ })).toBeVisible();

  // Another booking for the same patient profile: no consent screen this time.
  await page.getByRole("button", { name: /^leave/i }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /leave the call/i })
    .click();
  const next = await booking(phone, 3);
  await page.goto(`/consultation/${next.appt}/lobby`);
  await checkDevices(page);
  await page.getByRole("button", { name: /join the waiting room/i }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Consultation with/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Before your video consultation/ })).toHaveCount(
    0,
  );
});

test("too early, unpaid, and someone else's booking are each refused with plain words", async ({
  page,
}) => {
  const phone = await patientSignIn(page);

  const early = await booking(phone, 5 * 60);
  await page.goto(`/consultation/${early.appt}/lobby`);
  await checkDevices(page);
  await page.getByRole("button", { name: /join the waiting room/i }).click();
  await expect(page.getByRole("heading", { name: /It is not time to join yet/ })).toBeVisible();
  await accessible(page);
  expect(
    (await db().query(`SELECT id FROM consultations WHERE appointment_id=$1`, [early.appt])).rows,
  ).toHaveLength(0);

  const unpaid = await booking(phone, 3, false);
  await page.goto(`/consultation/${unpaid.appt}/lobby`);
  await checkDevices(page);
  await page.getByRole("button", { name: /join the waiting room/i }).click();
  await expect(
    page.getByRole("heading", { name: /Payment is needed before you can join/ }),
  ).toBeVisible();

  // Another patient's appointment is a plain not-found page, and the join route says the same.
  const other = await page.context().browser()!.newContext();
  const p2 = await other.newPage();
  await patientSignIn(p2);
  await p2.goto(`/consultation/${early.appt}/lobby`);
  await expect(p2.getByRole("heading", { name: /could not find that page/i })).toBeVisible();
  const origin = new URL(p2.url()).origin;
  const api = await p2.request.post(`/api/v1/consultations/${early.appt}/join`, {
    headers: { origin },
  });
  expect(api.status()).toBe(404);
  await other.close();
});
