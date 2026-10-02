import { expect, test } from "./helpers.js";

test("signed out, the home page offers to sign in or use the editor", async ({
  person,
}) => {
  const { page } = await person("Visitor", { signedOut: true });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use without an account" }).click();
  await expect(page).toHaveURL(/\/editor$/);
});

test("pages that were removed show the 404 page", async ({ person }) => {
  const { page } = await person("Visitor", { signedOut: true });
  for (const path of ["/templates", "/bug-report", "/nope"]) {
    await page.goto(path);
    await expect(page.getByText("404")).toBeVisible();
  }
  await page.goto("/diagrams");
  await expect(page).toHaveURL(/\/$/);
});

test("the language can be switched on the home page", async ({ person }) => {
  const { page } = await person("Visitor", { signedOut: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByText("Tiếng Việt").click();
  await expect(
    page.getByRole("button", { name: "Đăng nhập" }).first(),
  ).toBeVisible();

  // Remembered, and the editor follows
  await page.reload();
  await page.getByRole("button", { name: "Dùng không cần tài khoản" }).click();
  await expect(page).toHaveURL(/\/editor$/);
});

test("signed in, the home page lists the diagrams", async ({ person }) => {
  const { page } = await person("Ada");
  await page.goto("/");
  await expect(page.getByText("Owned by me")).toBeVisible();
  await expect(page.getByRole("button", { name: "New diagram" })).toBeVisible();
});
