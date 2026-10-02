import { expect, modal, newEmail, openNewDiagram, test } from "./helpers.js";

const avatar = (page) => page.locator(".semi-avatar");

async function signIn(page, email, password) {
  await page.getByRole("button", { name: "Sign in" }).click();
  await modal(page).locator("input").nth(0).fill(email);
  await modal(page).locator("input").nth(1).fill(password);
  await modal(page).locator("button[type=submit]").click();
}

async function openAccountMenu(page, item) {
  await avatar(page).click();
  await page.getByText(item, { exact: true }).click();
}

test("signing up, changing the password and deleting the account", async ({
  person,
}) => {
  const { page } = await person("Visitor", { signedOut: true });
  const email = newEmail("Ada");
  await openNewDiagram(page, "MySQL");

  // Sign up, with the form checking the password first
  await page.getByRole("button", { name: "Sign in" }).click();
  await modal(page).getByText("Create account", { exact: true }).click();
  const fields = modal(page).locator("input");
  await fields.nth(0).fill("Ada Lovelace");
  await fields.nth(1).fill(email);
  await fields.nth(2).fill("short");
  await modal(page).getByRole("button", { name: "Create account" }).click();
  await expect(
    modal(page).getByText("Use at least 8 characters"),
  ).toBeVisible();
  await fields.nth(2).fill("correct horse");
  await modal(page).getByRole("button", { name: "Create account" }).click();
  await expect(avatar(page)).toHaveText("AL");

  // Still signed in after a reload (a new diagram asks for the database again)
  await page.reload();
  await expect(avatar(page)).toBeVisible();
  await page.getByText("MySQL", { exact: true }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  // Rename and change the password
  await openAccountMenu(page, "Account settings");
  await modal(page).locator("input").first().fill("Ada L.");
  await modal(page).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  const passwords = modal(page).locator("input[type=password]");
  await passwords.nth(0).fill("correct horse");
  await passwords.nth(1).fill("battery staple");
  await passwords.nth(2).fill("battery stapl");
  await modal(page).getByRole("button", { name: "Change password" }).click();
  await expect(modal(page).getByText("Passwords don't match")).toBeVisible();
  await passwords.nth(2).fill("battery staple");
  await modal(page).getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password updated")).toBeVisible();
  await page.keyboard.press("Escape");

  // Only the new password works
  await openAccountMenu(page, "Sign out");
  await signIn(page, email, "correct horse");
  await expect(modal(page).getByText("Wrong email or password")).toBeVisible();
  await modal(page).locator("input").nth(1).fill("battery staple");
  await modal(page).locator("button[type=submit]").click();
  await expect(avatar(page)).toBeVisible();

  // Delete the account
  await openAccountMenu(page, "Account settings");
  await modal(page)
    .getByPlaceholder("Enter your password to confirm")
    .fill("battery staple");
  await modal(page).getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("Account deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("password links that don't work, and mail being off", async ({
  person,
}) => {
  const { page } = await person("Visitor", { signedOut: true });

  // This stack has no mail, so there's no reset by email
  await openNewDiagram(page, "MySQL");
  await page.getByRole("button", { name: "Sign in" }).click();
  await modal(page).getByText("Forgot password?").click();
  await expect(
    modal(page).getByText("isn't available on this server"),
  ).toBeVisible();

  await page.goto("/reset-password?token=bogus-token-123");
  await page.locator("input[type=password]").nth(0).fill("whatever123");
  await page.locator("input[type=password]").nth(1).fill("whatever123");
  await page.getByRole("button", { name: "Choose a new password" }).click();
  await expect(page.getByText("invalid or has expired")).toBeVisible();

  await page.goto("/verify-email?token=bogus-token-123");
  await expect(page.getByText("invalid or has expired")).toBeVisible();

  // An error coming back from an OAuth provider
  await page.goto("/editor?auth_error=oauth_cancelled");
  await expect(page.getByText("Sign-in was cancelled")).toBeVisible();
});
