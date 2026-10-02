import { expect, openNewDiagram, test } from "./helpers.js";

test("fields can be duplicated from the side panel and the canvas", async ({
  person,
}) => {
  const { page } = await person("Visitor", { signedOut: true });
  await openNewDiagram(page);
  await page.getByRole("button", { name: "Add table" }).click();
  const fields = page
    .locator("#diagram foreignObject")
    .first()
    .locator("span.overflow-hidden");
  await expect(fields).toHaveText(["id"]);

  // From the side panel
  await page.locator(".semi-collapse-header").first().click();
  await page.getByTitle("Duplicate").first().click();
  await expect(fields).toHaveCount(2);

  // On the canvas, when hovering a field
  await fields.first().hover();
  await page.locator("#diagram").getByTitle("Duplicate").click();
  await expect(fields).toHaveCount(3);

  await page.keyboard.press("Control+z");
  await expect(fields).toHaveCount(2);
});

// The SQL parsers, the DBML parser and jsPDF are loaded only when used

test("importing SQL", async ({ person }) => {
  const { page } = await person("Visitor", { signedOut: true });
  await openNewDiagram(page);
  await page.getByText("File", { exact: true }).click();
  await page.getByText("Import from SQL", { exact: true }).click();
  await page.getByRole("tab", { name: "Upload file" }).click();
  await page
    .locator(".semi-modal-content .semi-upload-hidden-input")
    .setInputFiles({
      name: "shop.sql",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "CREATE TABLE users (id INT PRIMARY KEY, email TEXT);\n" +
          "CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id));\n",
      ),
    });
  await page
    .locator(".semi-modal-content button")
    .filter({ hasText: /^Import$/ })
    .click();
  await expect(page.locator("#diagram foreignObject")).toHaveCount(2);
  await expect(page.getByText("Relationships (1)")).toBeVisible();
});

test("the DBML view and exporting a PDF", async ({ person }) => {
  const { page } = await person("Visitor", { signedOut: true });
  await openNewDiagram(page);
  await page.getByRole("button", { name: "Add table" }).click();

  await page.getByText("View", { exact: true }).click();
  await page.getByText("DBML view", { exact: true }).click();
  await expect(page.locator(".monaco-editor").first()).toContainText("Table");

  await page.getByText("File", { exact: true }).click();
  await page.getByText("Export as", { exact: true }).hover();
  const download = page.waitForEvent("download");
  await page.getByText("PDF", { exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
});

test("importing a DBML file", async ({ person }) => {
  const { page } = await person("Visitor", { signedOut: true });
  await openNewDiagram(page);
  await page.getByText("File", { exact: true }).click();
  await page.getByText("Import from", { exact: true }).hover();
  await page.getByText("DBML", { exact: true }).click();
  await page
    .locator(".semi-modal-content .semi-upload-hidden-input")
    .setInputFiles({
      name: "shop.dbml",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Table users {\n  id int [pk]\n}\n\nTable orders {\n  id int [pk]\n  user_id int [ref: > users.id]\n}\n",
      ),
    });
  await expect(page.getByText("shop.dbml")).toBeVisible();
  await page
    .locator(".semi-modal-content button")
    .filter({ hasText: /^Import$/ })
    .click();
  await expect(page.locator("#diagram foreignObject")).toHaveCount(2);
});

test("resizing a table follows the pointer at any zoom", async ({ person }) => {
  const { page } = await person("Visitor", { signedOut: true });
  await openNewDiagram(page);
  await page.getByRole("button", { name: "Add table" }).click();
  const table = page.locator("#diagram foreignObject").first();
  const width = async () => Number(await table.getAttribute("width"));
  const before = await width();

  // Zoomed in, a canvas unit is more than a screen pixel
  const box = await table.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect
    .poll(async () => (await table.boundingBox()).width / before)
    .toBeGreaterThan(1.2);
  const zoomed = await table.boundingBox();
  const scale = zoomed.width / before;

  await page.mouse.move(zoomed.x + 20, zoomed.y + 10);
  const handle = page.locator('#diagram rect[style*="ew-resize"]').nth(1);
  const h = await handle.boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 60, h.y + h.height / 2, {
    steps: 6,
  });
  await page.mouse.move(h.x + h.width / 2 + 120, h.y + h.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  expect(Math.abs((await width()) - (before + 120 / scale))).toBeLessThan(3);

  await page.keyboard.press("Control+z");
  await expect.poll(width).toBe(before);
});

test("a table's header menu stays open when the pointer leaves the table", async ({
  person,
}) => {
  const { page } = await person("Visitor", { signedOut: true });
  await openNewDiagram(page);
  await page.getByRole("button", { name: "Add table" }).click();
  const tables = page.locator("#diagram foreignObject");
  // Its buttons are only there while hovering it
  await expect(tables.first().getByTitle("See more")).toHaveCount(0);
  await tables.first().locator("div").first().hover();
  await tables.first().getByTitle("See more").click();

  const duplicate = page
    .locator(".semi-popover-content")
    .getByRole("button", { name: "Duplicate" });
  await expect(duplicate).toBeVisible();
  // Away from the table, onto an empty spot of the canvas
  await page.mouse.move(40, 700, { steps: 8 });
  await page.waitForTimeout(300);
  await expect(duplicate).toBeVisible();
  await duplicate.click();
  await expect(tables).toHaveCount(2);
});
