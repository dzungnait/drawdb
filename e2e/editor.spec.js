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
