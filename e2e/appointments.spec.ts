import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, db, patientSignIn, run } from "./helpers";

// A patient's own appointments against the real database (P4-08): the list, letting a held time
// go, moving a confirmed booking, and reviewing a completed one.

async function accessible(page: Page) {
  // Let dialogs and toasts finish moving, so contrast is measured on the settled screen.
  await page.waitForTimeout(500);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => n.target.join(" ") + " " + (n.any[0]?.message ?? "")).join(" | ")}`,
    ),
    page.url(),
  ).toEqual([]);
}

const NAME = `Dr Visits${run}`;
let doctorId = "";

/** The next half hour boundary, plus whole days, as a Date. */
function slotIn(days: number, extraHalfHours = 0): Date {
  const t = new Date(Date.now() + days * 86_400_000);
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() < 30 ? 30 : 60);
  return new Date(t.getTime() + extraHalfHours * 1_800_000);
}

test.beforeAll(async () => {
  doctorId = crypto.randomUUID();
  await db().query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       consultation_fee_paise, kyc_status, status, applicant_email)
     VALUES ($1,$2,$3,'E2E Council','MBBS',30000,'approved','active',$4)`,
    [doctorId, NAME, `VIS-${run}`, `${doctorId}@no-email.invalid`],
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

async function appointment(userId: string, patientId: string, status: string, start: Date) {
  const id = crypto.randomUUID();
  await db().query(
    `INSERT INTO appointments (id, patient_id, doctor_id, booked_by_user_id, start_at, end_at, status,
       fee_paise, hold_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,30000, CASE WHEN $7 = 'held' THEN now() + interval '10 minutes' END)`,
    [id, patientId, doctorId, userId, start, new Date(start.getTime() + 1_800_000), status],
  );
  return id;
}

test("list, let a hold go, move a booking, and review a visit", async ({ page }) => {
  const phone = await patientSignIn(page);
  const user = (await db().query("SELECT id FROM users WHERE phone_number = $1", [`+91${phone}`]))
    .rows[0] as { id: string };
  const patientId = crypto.randomUUID();
  await db().query(
    `INSERT INTO patients (id, account_user_id, relation, full_name, dob, gender, is_minor)
     VALUES ($1,$2,'self','Visit Patient','1990-01-01','female',false)`,
    [patientId, user.id],
  );
  const held = await appointment(user.id, patientId, "held", slotIn(5));
  const booked = await appointment(user.id, patientId, "scheduled", slotIn(3));
  const done = await appointment(user.id, patientId, "completed", slotIn(-2));

  await page.goto("/patient/appointments");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: /Upcoming appointments \(2\)/ })).toBeVisible();
  await expect(page.getByText("Held, not paid")).toBeVisible();
  await expect(page.getByText(`Reg. VIS-${run}`).first()).toBeVisible();
  await accessible(page);

  // Let the held time go.
  await page.getByRole("button", { name: /let this time go/i }).click();
  await expect(page.getByText(/Nothing was charged/)).toBeVisible();
  await page.getByRole("radio", { name: /another reason/i }).check();
  await accessible(page);
  await page.getByRole("button", { name: /^cancel appointment$/i }).click();
  await expect(page.getByText(/The time is free again/)).toBeVisible();
  await expect
    .poll(
      async () =>
        (await db().query("SELECT status FROM appointments WHERE id=$1", [held])).rows[0]?.status,
    )
    .toBe("cancelled_by_patient");

  // Move the confirmed booking to another free time.
  await page.getByRole("button", { name: /^reschedule$/i }).click();
  await expect(page.getByRole("heading", { name: /choose a new time/i })).toBeVisible();
  await accessible(page);
  const before = (await db().query("SELECT start_at FROM appointments WHERE id=$1", [booked]))
    .rows[0]?.start_at as Date;
  await page.getByRole("radio").last().check({ force: true });
  // The first time listed may be today; choose the last time of the shown day to be sure it differs.
  await page.getByRole("button", { name: /move appointment/i }).click();
  await expect(page.getByText(/Appointment moved/)).toBeVisible();
  const after = (
    await db().query("SELECT start_at, reschedule_count FROM appointments WHERE id=$1", [booked])
  ).rows[0] as {
    start_at: Date;
    reschedule_count: number;
  };
  expect(after.reschedule_count).toBe(1);
  expect(after.start_at.getTime()).not.toBe(before.getTime());

  // Review the completed visit from the Past tab.
  await page.getByRole("link", { name: /^Past/ }).click();
  await page.getByRole("button", { name: /rate this visit/i }).click();
  await page
    .locator("label")
    .filter({ hasText: /5 stars/ })
    .click();
  await page.getByLabel(/tell us more|comment|anything/i).fill("Explained everything clearly.");
  await accessible(page);
  await page.getByRole("button", { name: /submit review/i }).click();
  await expect(page.getByText(/Your review was saved/)).toBeVisible();
  const review = (
    await db().query("SELECT rating, status, comment FROM reviews WHERE appointment_id=$1", [done])
  ).rows[0];
  expect(review).toMatchObject({
    rating: 5,
    status: "pending",
    comment: "Explained everything clearly.",
  });
  await expect(page.getByText(/You reviewed this visit/)).toBeVisible();
});

test("another patient never sees these appointments", async ({ page }) => {
  await patientSignIn(page);
  await page.goto("/patient/appointments");
  await expect(page.getByRole("heading", { name: /Upcoming appointments \(0\)/ })).toBeVisible();
  await expect(page.getByText(NAME)).toHaveCount(0);
});
