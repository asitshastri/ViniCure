import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import { Crypto, LocalKeyProvider } from "../src/lib/crypto/crypto";
import {
  closeDb,
  createStaff,
  db,
  patientSignIn,
  resetRateLimits,
  run,
  staffSignIn,
  type Staff,
} from "./helpers";

// The doctor's consultation screen on real data (P6-07): the patient's details beside the video,
// every read logged, starting and ending the call, and a laptop-sized layout.

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

const crypto_ = new Crypto(new LocalKeyProvider(E2E_ENV.LOCAL_DEV_KEY));
const REASON = "Fever and cough for two days";

test.beforeEach(resetRateLimits);
test.afterAll(closeDb);

async function setup(staff: Staff) {
  const doctorId = crypto.randomUUID();
  await db().query(
    `INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council, qualifications,
       consultation_fee_paise, kyc_status, status)
     VALUES ($1,$2,$3,$4,'E2E Council','MBBS, MD',30000,'approved','active')`,
    [doctorId, staff.userId, `Dr Console${run}`, `CON-${run}-${doctorId.slice(-6)}`],
  );
  // A patient account that never signs in here: the booking belongs to it.
  const user = crypto.randomUUID();
  await db().query("INSERT INTO users (id, name, email) VALUES ($1,'Console Patient',$2)", [
    user,
    `${user}@no-email.invalid`,
  ]);
  const patient = crypto.randomUUID();
  await db().query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Console Patient','1985-05-05','female',false)`,
    [patient, user],
  );
  const appt = crypto.randomUUID();
  const start = new Date(Date.now() + 3 * 60_000);
  await db().query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status, fee_paise, reason_enc)
     VALUES ($1,$2,$3,$4,$5,$6,'scheduled',30000,$7)`,
    [
      appt,
      patient,
      doctorId,
      user,
      start,
      new Date(start.getTime() + 30 * 60_000),
      await crypto_.encrypt(REASON, "appointments.reason_enc"),
    ],
  );
  await db().query(
    `INSERT INTO payments (id, appointment_id, payer_user_id, amount_paise, status, gateway_order_id, gateway_payment_id, idempotency_key, captured_at)
     VALUES ($1,$2,$3,30000,'captured',$4,$5,$6, now())`,
    [
      crypto.randomUUID(),
      appt,
      user,
      `order_${appt}`,
      `pay_${appt.slice(-12)}`,
      `key-${appt}-0000000`,
    ],
  );
  return { doctorId, appt, patient };
}

test("the doctor opens a consultation, sees the patient, starts the call and ends it for everyone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const staff = await createStaff("console-doc");
  const { appt, patient } = await setup(staff);
  await staffSignIn(page, staff);

  // The list shows who and when, not the reason.
  await page.goto("/doctor/consultations");
  await expect(page.getByText("Console Patient").first()).toBeVisible();
  await expect(page.getByText(REASON)).toHaveCount(0);
  await page.getByText("Console Patient").first().click();

  // The console: the patient's details beside the video, and the read is logged.
  await expect(
    page.getByRole("heading", { level: 1, name: /Consultation with Console Patient/ }),
  ).toBeVisible();
  await expect(page.getByText(REASON)).toBeVisible();
  await expect(page.getByText(/^\d+, female\.?$/).first()).toBeVisible();
  await expect(page.getByText("Prescriptions are not available yet")).toBeVisible();
  const logged = await db().query(
    `SELECT resource_type, purpose, patient_id FROM phi_access_logs WHERE actor_user_id=$1 AND resource_id=$2`,
    [staff.userId, appt],
  );
  expect(logged.rows).toHaveLength(1);
  expect(logged.rows[0]).toMatchObject({
    resource_type: "patient_summary",
    purpose: "treatment",
    patient_id: patient,
  });
  await page.waitForLoadState("networkidle");
  await accessible(page);

  // Laptop layout: nothing spills sideways, and the patient, the video and the panels are all in view.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const video = await page.getByRole("button", { name: "Start the call" }).boundingBox();
  const reason = await page.getByText(REASON).boundingBox();
  expect(video && reason).toBeTruthy();
  expect(reason!.x + reason!.width).toBeLessThanOrEqual(1366);
  expect(video!.x + video!.width).toBeLessThanOrEqual(1366);

  // Start the call: the doctor's coming in makes it live.
  await page.getByRole("button", { name: "Start the call" }).click();
  await expect(page.getByText("Connection good")).toBeVisible();
  await expect(page.getByLabel("Console Patient, video")).toBeVisible();
  const live = await db().query(
    `SELECT c.status AS c, a.status AS a FROM consultations c JOIN appointments a ON a.id=c.appointment_id WHERE a.id=$1`,
    [appt],
  );
  expect(live.rows[0]).toMatchObject({ c: "live", a: "in_progress" });
  await accessible(page);

  // Controls and a dropped connection.
  await page.getByRole("button", { name: "Mute microphone" }).click();
  await expect(page.getByRole("button", { name: "Unmute microphone" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate(() => window.__fakeVideo?.drop());
  await expect(page.getByRole("alert").getByText(/Reconnecting/)).toBeVisible();
  await page.evaluate(() => window.__fakeVideo?.restore());
  await page.evaluate(() => window.__fakeVideo?.remoteLeaves());
  await expect(page.getByText(/has left the call/)).toBeVisible();

  // End it for everyone.
  await page.getByRole("button", { name: /^end/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /end consultation/i })
    .click();
  await expect(page.getByRole("heading", { name: /Consultation ended/ })).toBeVisible();
  await accessible(page);
  const done = await db().query(
    `SELECT c.status AS c, a.status AS a,
            (SELECT count(*)::int FROM consultation_participants p WHERE p.consultation_id=c.id AND p.revoked_at IS NULL) AS open
       FROM consultations c JOIN appointments a ON a.id=c.appointment_id WHERE a.id=$1`,
    [appt],
  );
  expect(done.rows[0]).toMatchObject({ c: "ended", a: "completed", open: 0 });
});

test("another doctor and the patient cannot open someone else's consultation, and nothing is logged", async ({
  page,
}) => {
  const owner = await createStaff("console-owner");
  const { appt } = await setup(owner);
  const other = await createStaff("console-other");
  await staffSignIn(page, other);
  const origin = new URL(page.url()).origin;
  await page.goto(`/doctor/consultations/${appt}`);
  await expect(page.getByRole("heading", { name: /could not find that page/i })).toBeVisible();
  expect((await page.request.get(`/api/v1/consultations/${appt}/context`)).status()).toBe(404);
  expect(
    (
      await page.request.post(`/api/v1/consultations/${appt}/end`, { headers: { origin } })
    ).status(),
  ).toBe(404);

  const ctx = await page.context().browser()!.newContext();
  const p2 = await ctx.newPage();
  await patientSignIn(p2);
  await p2.goto(`/doctor/consultations/${appt}`);
  await expect(p2.getByRole("heading", { name: /could not find that page/i })).toBeVisible();
  await ctx.close();

  const logs = await db().query(
    `SELECT count(*)::int AS n FROM phi_access_logs WHERE resource_id=$1`,
    [appt],
  );
  expect(logs.rows[0]?.n).toBe(0);
});
