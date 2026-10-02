import {
  addTable,
  canvasTables,
  createDiagram,
  expect,
  modal,
  serverTableCount,
  test,
} from "./helpers.js";

// The e2e stack keeps a version on every save (VERSION_INTERVAL_MINUTES=0)

test("versions can be named, previewed and restored", async ({ person }) => {
  const ada = await person("Ada");
  const { page } = ada;
  const id = await createDiagram(page);
  await addTable(page);
  await expect.poll(() => serverTableCount(ada, id)).toBe(2);
  await addTable(page);
  await expect.poll(() => serverTableCount(ada, id)).toBe(3);

  // The history: the current state, then older ones
  await page.locator(".fa-code-branch").click();
  await expect(page.getByText("Current version")).toBeVisible();
  const versions = page.locator(".semi-sidesheet .hover-1");
  await expect(versions).toHaveCount(3);

  // Name the current state
  await page.getByRole("button", { name: "Save this version" }).click();
  await modal(page).locator("input").fill("Release 1");
  await modal(page)
    .locator("button")
    .filter({ hasText: /^Save$/ })
    .click();
  await expect(page.getByText("Version saved")).toBeVisible();
  await expect(page.getByText("Release 1", { exact: true })).toBeVisible();

  // Previewing the oldest is read-only, and nothing gets saved
  await versions.last().click();
  await expect(page.getByText(/You're viewing a version from/)).toBeVisible();
  await expect(canvasTables(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Add table" })).toBeDisabled();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+s");
  await expect.poll(() => serverTableCount(ada, id)).toBe(3);

  // Back to the current state
  await page
    .locator(".semi-sidesheet")
    .getByRole("button", { name: "Back to current" })
    .click();
  await expect(canvasTables(page)).toHaveCount(3);
  await expect(page.getByText(/You're viewing/)).toBeHidden();

  // Restore the oldest: saved for everyone, and editing goes on from there
  await versions.last().click();
  await page
    .locator(".semi-sidesheet")
    .getByRole("button", { name: "Restore this version" })
    .click();
  await modal(page)
    .locator("button")
    .filter({ hasText: /^Restore this version$/ })
    .click();
  await expect(page.getByText("Version restored")).toBeVisible();
  await expect.poll(() => serverTableCount(ada, id)).toBe(1);
  await expect(canvasTables(page)).toHaveCount(1);
  await page.locator(".semi-sidesheet-close").click();
  await addTable(page);
  await expect.poll(() => serverTableCount(ada, id)).toBe(2);
  await expect(
    page.getByText("This diagram was changed elsewhere"),
  ).toBeHidden();
});
