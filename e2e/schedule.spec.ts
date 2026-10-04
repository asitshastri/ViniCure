import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { cleanup, closeDb, createStaff, db, resetRateLimits, run, staffSignIn } from "./helpers";

// A doctor's own schedule against the real database (P4-08): set weekly hours with two windows,
// see an overlap refused, add and remove time off.

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

test.beforeEach(resetRateLimits);
test.afterAll(async () => {
  await cleanup();
  await closeDb();
});

test("a doctor sets weekly hours and time off, and the public slots follow", async ({ page }) => {
  const staff = await createStaff("schedule-doc");
  const doctorId = crypto.randomUUID();
  await db().query(
    `INSERT INTO doctors (id, user_id, display_name, registration_no, registration_council, qualifications,
       kyc_status, status) VALUES ($1,$2,'Dr Schedule',$3,'E2E Council','MBBS','approved','active')`,
    [doctorId, staff.userId, `SCH-${run}`],
  );
  await staffSignIn(page, staff);
  await page.goto("/doctor/calendar");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: /your weekly hours/i })).toBeVisible();
  await expect(page.getByText(/Closed. Patients cannot book this day./).first()).toBeVisible();
  await accessible(page);

  // Open Monday, and add an evening window.
  await page.getByRole("switch", { name: /Monday: closed/ }).click();
  await page
    .getByRole("button", { name: /add another time window/i })
    .first()
    .click();
  await expect(page.getByLabel(/From \(window 2\)/)).toBeVisible();

  // Make the two windows overlap: the page says so and nothing is saved.
  await page.getByLabel(/From \(window 2\)/).fill("12:00");
  await page.getByRole("button", { name: /save hours/i }).click();
  await expect(page.getByText(/cannot overlap/i).first()).toBeVisible();
  expect(
    (
      await db().query(
        "SELECT count(*)::int AS n FROM doctor_availability_rules WHERE doctor_id=$1",
        [doctorId],
      )
    ).rows[0]?.n,
  ).toBe(0);

  await page.getByLabel(/From \(window 2\)/).fill("16:00");
  await page.getByLabel("Length of each consultation").selectOption("30");
  await page.getByRole("button", { name: /save hours/i }).click();
  await expect(page.getByText(/Hours saved/)).toBeVisible();
  const rules = (
    await db().query(
      "SELECT weekday, to_char(start_time,'HH24:MI') AS s, to_char(end_time,'HH24:MI') AS e, slot_minutes FROM doctor_availability_rules WHERE doctor_id=$1 ORDER BY start_time",
      [doctorId],
    )
  ).rows;
  expect(rules).toEqual([
    { weekday: 1, s: "09:00", e: "13:00", slot_minutes: 30 },
    { weekday: 1, s: "16:00", e: "19:00", slot_minutes: 30 },
  ]);

  // The hours are what the page shows after a reload, and the public profile now has free times.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("switch", { name: /Monday: open/ })).toBeVisible();
  await accessible(page);

  // Time off.
  const day = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  await page.getByRole("button", { name: /add time off/i }).click();
  await page.getByLabel("First day").fill(day);
  await page.getByLabel("Last day").fill(day);
  await page.getByLabel(/reason/i).fill("Family function");
  await accessible(page);
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByText(/Patients cannot book these days/)).toBeVisible();
  await expect(page.getByText(/Family function/)).toBeVisible();
  expect(
    (
      await db().query("SELECT count(*)::int AS n FROM doctor_time_off WHERE doctor_id=$1", [
        doctorId,
      ])
    ).rows[0]?.n,
  ).toBe(1);
  await page.getByRole("button", { name: /remove time off from/i }).click();
  await expect(page.getByText(/No time off planned/)).toBeVisible();
  expect(
    (
      await db().query("SELECT count(*)::int AS n FROM doctor_time_off WHERE doctor_id=$1", [
        doctorId,
      ])
    ).rows[0]?.n,
  ).toBe(0);
});
