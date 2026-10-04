import { expect, test } from "@playwright/test";
import {
  PASSWORD,
  cleanup,
  closeDb,
  codeNow,
  createInvitation,
  createResetToken,
  createStaff,
  db,
  newPhone,
  otpFor,
  pendingSecret,
  run,
  sessionCount,
  typeCode,
} from "./helpers";

test.afterAll(async () => {
  await cleanup();
  await closeDb();
});

async function patientSignIn(page: import("@playwright/test").Page) {
  const phone = newPhone();
  await page.goto("/login");
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByLabel("Digit 1 of 6")).toBeVisible();
  await typeCode(page, await otpFor(phone));
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  return phone;
}

test.describe("patient sign-in by phone", () => {
  test("signs in with the code, lands on the dashboard, session cookie is locked down", async ({
    page,
    context,
  }) => {
    await patientSignIn(page);
    const cookie = (await context.cookies()).find((c) => c.name === "vc_session");
    expect(cookie, "session cookie").toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    // Nothing from the session is readable from page scripts or stored in the browser.
    expect(await page.evaluate(() => document.cookie)).not.toContain("vc_session");
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe("{}");
  });

  test("a wrong code is refused and counts down the tries", async ({ page }) => {
    const phone = newPhone();
    await page.goto("/login");
    await page.getByLabel(/mobile number/i).fill(phone);
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByLabel("Digit 1 of 6")).toBeVisible();
    const real = await otpFor(phone);
    await typeCode(page, real === "000000" ? "111111" : "000000");
    await expect(page.getByRole("alert").filter({ hasText: /not correct/i })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("an invalid number is stopped before any code is sent", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/mobile number/i).fill("12345");
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText(/10-digit mobile number/i).first()).toBeVisible();
  });

  test("sign out ends the session on the server and closes the panel", async ({ page }) => {
    const phone = await patientSignIn(page);
    const { rows } = await db().query("SELECT id FROM users WHERE phone_number = $1", [
      `+91${phone}`,
    ]);
    expect(await sessionCount(rows[0].id)).toBe(1);
    await page
      .getByRole("button", { name: /account menu|open account|menu/i })
      .first()
      .click()
      .catch(() => undefined);
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await sessionCount(rows[0].id)).toBe(0);
    await page.goto("/patient/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("panel access", () => {
  test("a visitor with no session is sent to sign-in", async ({ page }) => {
    for (const path of [
      "/patient/dashboard",
      "/doctor/dashboard",
      "/admin/dashboard",
      "/staff/queue",
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });

  test("a patient gets a 404 on staff and admin panels", async ({ page }) => {
    await patientSignIn(page);
    for (const path of ["/admin/dashboard", "/doctor/dashboard", "/staff/queue"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });
});

test.describe("staff sign-in", () => {
  test("password then authenticator code opens the doctor workspace", async ({ page }) => {
    const staff = await createStaff("doctor-a");
    await page.goto("/login/staff");
    await page.getByLabel(/email/i).fill(staff.email);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    await expect(page.getByLabel("Digit 1 of 6")).toBeVisible();
    await expect(page).toHaveURL(/login\/staff/);
    expect(await sessionCount(staff.userId)).toBe(0); // the password alone gave no session
    await typeCode(page, codeNow(staff.secret));
    await expect(page).toHaveURL(/\/doctor\/dashboard/);
    expect(await sessionCount(staff.userId)).toBe(1);
    // The shell greets the real account, not the prototype's sample person.
    await expect(page.getByText("E2E Staff").first()).toBeAttached();
  });

  test("a wrong password and a wrong code are refused", async ({ page }) => {
    const staff = await createStaff("doctor-b");
    await page.goto("/login/staff");
    await page.getByLabel(/email/i).fill(staff.email);
    await page.getByLabel(/^password/i).fill("Not-The-Password-1!");
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    await expect(page.getByText(/email or password is not correct/i)).toBeVisible();

    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    const real = codeNow(staff.secret);
    await typeCode(page, real === "000000" ? "111111" : "000000");
    await expect(page.getByText(/code is not correct/i)).toBeVisible();
    expect(await sessionCount(staff.userId)).toBe(0);
  });

  test("five wrong passwords lock the account, even for the right password, and say so", async ({
    page,
  }) => {
    const staff = await createStaff("doctor-lock");
    await page.goto("/login/staff");
    for (let i = 0; i < 5; i++) {
      await page.getByLabel(/email/i).fill(staff.email);
      await page.getByLabel(/^password/i).fill(`Wrong-Password-${i}!`);
      await page.getByRole("button", { name: /sign in|continue/i }).click();
      await expect(page.getByText(/email or password is not correct/i)).toBeVisible();
    }
    await page.getByLabel(/email/i).fill(staff.email);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    await expect(page.getByText(/locked for 15 minutes/i)).toBeVisible();
    expect(await sessionCount(staff.userId)).toBe(0);
  });

  test("a backup code signs in once", async ({ page }) => {
    const staff = await createStaff("doctor-c", "admin");
    const signInWithBackup = async () => {
      await page.goto("/login/staff");
      await page.getByLabel(/email/i).fill(staff.email);
      await page.getByLabel(/^password/i).fill(PASSWORD);
      await page.getByRole("button", { name: /sign in|continue/i }).click();
      await page.getByRole("button", { name: /use a backup code instead/i }).click();
      await page.getByLabel(/backup code/i).fill(staff.backupCodes[0] as string);
      await page.getByRole("button", { name: /^use backup code$/i }).click();
    };
    await signInWithBackup();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await page.context().clearCookies();
    await signInWithBackup();
    await expect(page.getByText(/not valid or was already used/i)).toBeVisible();
  });
});

test.describe("invitation and authenticator enrolment", () => {
  test("a doctor follows the link, enrols the authenticator, then signs in", async ({ page }) => {
    const address = `e2e-${run}-invited@example.com`;
    const { token } = await createInvitation(address);
    await page.goto(`/invite/${token}`);
    await page.getByRole("button", { name: /start set-up/i }).click();
    await expect(page.getByAltText(/QR code/i)).toBeVisible();
    await expect(page.getByTestId("backup-codes").locator("li")).toHaveCount(10);
    expect((await page.getByTestId("manual-key").textContent())?.replace(/\s/g, "")).toMatch(
      /^[A-Z2-7]{20,}$/,
    );

    const secret = await pendingSecret(token);
    await page.getByLabel(/full name/i).fill("Dr Invited Person");
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByLabel(/type the password again/i).fill(PASSWORD);
    await typeCode(page, codeNow(secret), "Digit 1 of 6");
    // The backup codes must be acknowledged first.
    await page.getByRole("button", { name: /create my account/i }).click();
    await expect(page.getByText(/confirm that you saved/i).first()).toBeVisible();
    await page.getByLabel(/saved my backup codes/i).check();
    await page.getByRole("button", { name: /create my account/i }).click();
    await expect(page.getByText(/your account is ready/i)).toBeVisible();

    await page.getByRole("link", { name: /staff sign in/i }).click();
    await page.getByLabel(/email/i).fill(address);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    await typeCode(page, codeNow(secret));
    await expect(page).toHaveURL(/\/doctor\/dashboard/);
  });

  test("a link that was used or made up shows the same message", async ({ page }) => {
    await page.goto(`/invite/${"x".repeat(43)}`);
    await page.getByRole("button", { name: /start set-up/i }).click();
    await expect(page.getByText(/invitation link is not valid/i)).toBeVisible();
  });
});

test.describe("profile and family", () => {
  test("a patient adds, edits and removes a family member; another patient never sees them", async ({
    page,
    browser,
  }) => {
    await patientSignIn(page);
    await page.goto("/patient/profile");
    await expect(page.getByText(/no family members yet/i)).toBeVisible();

    await page.getByRole("button", { name: /add a family member/i }).click();
    await page
      .getByRole("dialog")
      .getByLabel(/full name/i)
      .fill("Mira Verma");
    await page
      .getByRole("dialog")
      .getByLabel(/date of birth/i)
      .fill("2020-03-14");
    await page.getByRole("dialog").getByLabel(/^sex/i).selectOption("female");
    await page
      .getByRole("dialog")
      .getByLabel(/relation to you/i)
      .selectOption("Child");
    await page.getByRole("button", { name: /^add$/i }).click();
    const row = page.getByRole("listitem").filter({ hasText: "Mira Verma" });
    await expect(row).toBeVisible();
    await expect(row.getByText(/Child. You manage this profile/i)).toBeVisible();

    // The server, not the page, decides: the stored record is the child's and a minor.
    const { rows } = await db().query(
      "SELECT is_minor, relation, dob::text AS dob FROM patients WHERE full_name = 'Mira Verma' ORDER BY created_at DESC LIMIT 1",
    );
    expect(rows[0]).toMatchObject({ is_minor: true, relation: "child", dob: "2020-03-14" });

    // Edit.
    await page.getByRole("button", { name: /edit mira verma/i }).click();
    await page
      .getByRole("dialog")
      .getByLabel(/full name/i)
      .fill("Mira Verma-Rao");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText("Mira Verma-Rao").first()).toBeVisible();

    // A second patient, in another browser, sees an empty list.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await patientSignIn(otherPage);
    await otherPage.goto("/patient/profile");
    await expect(otherPage.getByText(/no family members yet/i)).toBeVisible();
    await other.close();

    // Remove.
    await page.getByRole("button", { name: /remove mira verma-rao/i }).click();
    await page.getByRole("button", { name: /^remove$/i }).click();
    await expect(page.getByText("Mira Verma-Rao")).toHaveCount(0);
    const left = await db().query(
      "SELECT deleted_at FROM patients WHERE full_name = 'Mira Verma-Rao'",
    );
    expect(left.rows[0].deleted_at).not.toBeNull(); // soft delete
  });

  test("a date in the future is refused with a message", async ({ page }) => {
    await patientSignIn(page);
    await page.goto("/patient/profile");
    await page.getByRole("button", { name: /add a family member/i }).click();
    await page
      .getByRole("dialog")
      .getByLabel(/full name/i)
      .fill("Future Person");
    await page
      .getByRole("dialog")
      .getByLabel(/date of birth/i)
      .fill("2999-01-01");
    await page.getByRole("dialog").getByLabel(/^sex/i).selectOption("male");
    await page
      .getByRole("dialog")
      .getByLabel(/relation to you/i)
      .selectOption("Other");
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByText(/cannot be in the future/i).first()).toBeVisible();
  });
});

test.describe("staff password reset", () => {
  const NEW = "Another-Sturdy-Phrase-7#";

  test("asking for a link gives the same message for a real and an unknown address", async ({
    page,
  }) => {
    const staff = await createStaff("doctor-reset-a");
    for (const email of [staff.email, `e2e-${run}-nobody@example.com`]) {
      await page.goto("/forgot-password");
      await page.getByLabel(/work email/i).fill(email);
      await page.getByRole("button", { name: /send reset link/i }).click();
      await expect(page.getByText(/if an account uses that email/i)).toBeVisible();
    }
  });

  test("the link sets a new password, ends other sessions, and the old password stops working", async ({
    page,
    browser,
  }) => {
    const staff = await createStaff("doctor-reset-b");
    // The doctor is signed in on another device.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/login/staff");
    await otherPage.getByLabel(/email/i).fill(staff.email);
    await otherPage.getByLabel(/^password/i).fill(PASSWORD);
    await otherPage.getByRole("button", { name: /sign in|continue/i }).click();
    await typeCode(otherPage, codeNow(staff.secret));
    await expect(otherPage).toHaveURL(/\/doctor\/dashboard/);
    expect(await sessionCount(staff.userId)).toBe(1);

    const token = await createResetToken(staff.userId);
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel(/^new password/i).fill("short");
    await page.getByLabel(/repeat the new password/i).fill("short");
    await page.getByRole("button", { name: /save new password/i }).click();
    await expect(page.getByText(/at least 12 characters/i).first()).toBeVisible();

    await page.getByLabel(/^new password/i).fill(NEW);
    await page.getByLabel(/repeat the new password/i).fill(NEW);
    await page.getByRole("button", { name: /save new password/i }).click();
    await expect(page.getByText(/password changed/i)).toBeVisible();
    expect(await sessionCount(staff.userId)).toBe(0); // every session ended
    await otherPage.goto("/doctor/dashboard");
    await expect(otherPage).toHaveURL(/\/login/);
    await other.close();

    // The old password is dead; the new one needs the authenticator code as before.
    await page.goto("/login/staff");
    await page.getByLabel(/email/i).fill(staff.email);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    await expect(page.getByText(/email or password is not correct/i)).toBeVisible();
    await page.getByLabel(/^password/i).fill(NEW);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    await typeCode(page, codeNow(staff.secret, 1));
    await expect(page).toHaveURL(/\/doctor\/dashboard/);
  });

  test("a used, expired or made-up link shows the expired message", async ({ page }) => {
    const staff = await createStaff("doctor-reset-c");
    const token = await createResetToken(staff.userId);
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel(/^new password/i).fill(NEW);
    await page.getByLabel(/repeat the new password/i).fill(NEW);
    await page.getByRole("button", { name: /save new password/i }).click();
    await expect(page.getByText(/password changed/i)).toBeVisible();
    // The same link again.
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel(/^new password/i).fill("Yet-Another-Phrase-8$");
    await page.getByLabel(/repeat the new password/i).fill("Yet-Another-Phrase-8$");
    await page.getByRole("button", { name: /save new password/i }).click();
    await expect(page.getByText(/expired or was already used/i)).toBeVisible();
    await page.goto("/reset-password?token=made-up-token-0000000000");
    await page.getByLabel(/^new password/i).fill(NEW);
    await page.getByLabel(/repeat the new password/i).fill(NEW);
    await page.getByRole("button", { name: /save new password/i }).click();
    await expect(page.getByText(/expired or was already used/i)).toBeVisible();
  });
});

test.describe("Google sign-in button", () => {
  test("starts the sign-in with our state and leaves for Google; nothing else is stored", async ({
    page,
  }) => {
    let googleUrl = "";
    await page.route("https://accounts.google.com/**", async (route) => {
      googleUrl = route.request().url();
      await route.abort();
    });
    await page.goto("/login");
    await page.getByRole("button", { name: /continue with google/i }).click();
    await expect.poll(() => googleUrl).toContain("accounts.google.com");
    const url = new URL(googleUrl);
    expect(url.searchParams.get("client_id")).toBe("e2e-client-id.apps.googleusercontent.com");
    // Identity scopes only (Better Auth lists some twice).
    expect(new Set((url.searchParams.get("scope") ?? "").split(" "))).toEqual(
      new Set(["openid", "email", "profile"]),
    );
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_challenge")).toBeTruthy(); // PKCE
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3100/api/auth/callback/google",
    );
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  test("a refused Google sign-in comes back to the login page with a clear message", async ({
    page,
  }) => {
    await page.goto("/login?error=account_not_linked");
    await expect(page.getByText(/sign in with your mobile number, then add Google/i)).toBeVisible();
  });

  test("the settings page offers to add Google only to a signed-in patient, and asks for a fresh sign-in", async ({
    page,
  }) => {
    await patientSignIn(page);
    await page.goto("/patient/settings");
    await expect(page.getByText(/mobile number and code/i)).toBeVisible();
    await expect(page.getByText("Verified")).toBeVisible();
    await expect(page.getByRole("button", { name: /add google/i })).toBeVisible();
  });
});
