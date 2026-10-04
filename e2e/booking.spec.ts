import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, db, patientSignIn, run } from "./helpers";

// Public directory and booking against the real database (P4-08): find a doctor, see free times,
// hold one, and let it go. Payment is not open yet, so the flow ends at the held screen.

/** No accessibility violations on the screen as it is now (WCAG 2.1 A and AA rules). */
async function accessible(page: Page) {
  // Let transitions finish, so contrast is measured on the settled screen.
  await page.waitForTimeout(500);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    page.url(),
  ).toEqual([]);
}

const NAME = `Dr Booker${run}`;
let doctorId = "";

test.beforeAll(async () => {
  const id = crypto.randomUUID();
  await db().query(
    `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
       languages, consultation_fee_paise, kyc_status, status, applicant_email)
     VALUES ($1,$2,$3,'E2E Council','MBBS, MD',ARRAY['English','Hindi'],45000,'approved','active',$4)`,
    [id, NAME, `E2E-${run}`, `${id}@no-email.invalid`],
  );
  // Open every day, so there are free times whatever day the test runs.
  for (let weekday = 0; weekday < 7; weekday++) {
    await db().query(
      `INSERT INTO doctor_availability_rules (id, doctor_id, weekday, start_time, end_time, slot_minutes, valid_from)
       VALUES ($1,$2,$3,'00:00','24:00',30,'2020-01-01')`,
      [crypto.randomUUID(), id, weekday],
    );
  }
  doctorId = id;
});
test.afterAll(closeDb);

test.describe("directory", () => {
  test("search finds the doctor, the profile shows the registration number and free times", async ({
    page,
  }) => {
    await page.goto(`/doctors?q=${encodeURIComponent(NAME)}`);
    await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
    await expect(page.getByText(`Reg. E2E-${run}`)).toBeVisible();
    await expect(page.getByText(/1 doctor shown/)).toBeVisible();
    await accessible(page);

    await page.getByRole("heading", { name: NAME }).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/doctors/${doctorId}`));
    await expect(page.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
    await expect(page.getByText(/Registered with the E2E Council/)).toBeVisible();
    await expect(page.getByText(/No reviews yet/)).toBeVisible();
    // Free times are real links to the booking page.
    const first = page.locator(`a[href^="/book/${doctorId}?slot="]`).first();
    await expect(first).toBeVisible();
    await accessible(page);
  });

  test("a name that matches nobody shows the empty state; a bad id is a 404", async ({ page }) => {
    await page.goto("/doctors?q=zzzzqqqq");
    await expect(page.getByText(/No doctors match these filters/)).toBeVisible();
    // The page streams, so the status is already sent; the not-found panel is what shows.
    await page.goto("/doctors/not-a-real-id");
    await expect(page.getByRole("heading", { name: /could not find that page/i })).toBeVisible();
    await page.goto(`/doctors/${crypto.randomUUID()}`);
    await expect(page.getByRole("heading", { name: /could not find that page/i })).toBeVisible();
  });

  test("a doctor who is not approved is not listed and has no page", async ({ page }) => {
    const hidden = crypto.randomUUID();
    await db().query(
      `INSERT INTO doctors (id, display_name, registration_no, registration_council, qualifications,
         kyc_status, status, applicant_email)
       VALUES ($1,$2,$3,'E2E Council','MBBS','pending','pending',$4)`,
      [hidden, `Dr Hidden${run}`, `HID-${run}`, `${hidden}@no-email.invalid`],
    );
    await page.goto(`/doctors?q=Hidden${run}`);
    await expect(page.getByText(/No doctors match these filters/)).toBeVisible();
    await page.goto(`/doctors/${hidden}`);
    await expect(page.getByRole("heading", { name: /could not find that page/i })).toBeVisible();
  });
});

test.describe("booking", () => {
  test("a patient adds their details, holds a time, and lets it go", async ({ page }) => {
    // Razorpay's widget is replaced by one the patient closes at once (payment.spec.ts pays).
    await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: "window.Razorpay = class { constructor(o){this.o=o;} on(){} open(){ this.o.modal.ondismiss(); } };",
      }),
    );
    await patientSignIn(page);
    await page.goto(`/doctors/${doctorId}`);
    const link = page.locator(`a[href^="/book/${doctorId}?slot="]`).first();
    await link.click();
    await expect(page.getByRole("heading", { level: 1, name: /Choose a time/ })).toBeVisible();
    await accessible(page);
    await page.getByRole("button", { name: /^continue/i }).click();

    // First booking: the patient's own details are needed once.
    await expect(page.getByText(/Add your details once/)).toBeVisible();
    await accessible(page);
    await page.getByLabel("Your full name").fill("Asha Verma");
    await page.getByLabel("Date of birth").fill("1990-04-12");
    await page.getByLabel("Sex").selectOption("female");
    await page.getByRole("button", { name: /save and continue/i }).click();

    await expect(page.getByLabel(/myself/i)).toBeVisible();
    await accessible(page);
    await page.getByLabel(/what do you need help with/i).fill("Fever and cough for two days");
    await page.getByLabel(/i understand this is an online consultation/i).check();
    await page.getByRole("button", { name: /hold this time and review/i }).click();

    await expect(page.getByRole("heading", { level: 1, name: /Review and pay/ })).toBeVisible();
    await expect(page.getByText(/\d\d:\d\d/).first()).toBeVisible(); // the hold timer
    await accessible(page);
    const held = await db().query(
      `SELECT id, status, fee_paise, reason_enc FROM appointments WHERE doctor_id = $1 AND status = 'held'`,
      [doctorId],
    );
    expect(held.rows).toHaveLength(1);
    expect(held.rows[0]?.fee_paise).toBe(45000);
    // The reason is stored encrypted, never as plain text.
    expect(String(held.rows[0]?.reason_enc)).toMatch(/^v1:/);
    expect(String(held.rows[0]?.reason_enc)).not.toContain("Fever");

    await page.getByRole("button", { name: /pay/i }).first().click();
    await expect(page.getByText(/You closed the payment window/)).toBeVisible();
    await accessible(page);

    // The held time can be let go from the appointments list.
    await page.goto("/patient/appointments");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /let this time go/i }).click();
    await expect(page.getByText(/Nothing was charged/)).toBeVisible();
    await page.getByRole("radio", { name: /another reason/i }).check();
    await page.getByRole("button", { name: /^cancel appointment$/i }).click();
    await expect(page.getByText(/The time is free again/)).toBeVisible();
    await expect
      .poll(
        async () =>
          (await db().query(`SELECT status FROM appointments WHERE id = $1`, [held.rows[0]?.id]))
            .rows[0]?.status,
      )
      .toBe("cancelled_by_patient");
  });

  test("when someone else holds the time first, the second patient is told so", async ({
    browser,
  }) => {
    // The first patient holds a time through the API; the second sees "booked first" in the screen.
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await patientSignIn(a);
    await patientSignIn(b);
    // Both open the same slot link.
    await a.goto(`/doctors/${doctorId}`);
    const href = await a.locator(`a[href^="/book/${doctorId}?slot="]`).nth(3).getAttribute("href");
    expect(href).toBeTruthy();
    for (const [page, name] of [
      [a, "First Patient"],
      [b, "Second Patient"],
    ] as const) {
      await page.goto(href as string);
      // The button does nothing until the page has loaded its scripts.
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: /^continue/i }).click();
      await page.getByLabel("Your full name").fill(name);
      await page.getByLabel("Date of birth").fill("1985-01-20");
      await page.getByLabel("Sex").selectOption("male");
      await page.getByRole("button", { name: /save and continue/i }).click();
      await page.getByLabel(/what do you need help with/i).fill("Routine check for the test");
      await page.getByLabel(/i understand this is an online consultation/i).check();
    }
    await a.getByRole("button", { name: /hold this time and review/i }).click();
    await expect(a.getByRole("heading", { level: 1, name: /Review and pay/ })).toBeVisible();
    await b.getByRole("button", { name: /hold this time and review/i }).click();
    await expect(b.getByRole("heading", { name: /Someone booked that time first/ })).toBeVisible();
    await a.context().close();
    await b.context().close();
  });
});
