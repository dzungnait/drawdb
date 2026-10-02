import { randomUUID } from "node:crypto";
import { choose, expect, test } from "./helpers.js";

/** Diagram names in the list, top to bottom. */
const listed = (page) =>
  page.locator(".semi-table-tbody tr .font-medium").allInnerTexts();

async function make(person, name, database) {
  const diagramId = randomUUID();
  await person.api("POST", "/diagrams", { diagramId, name, database });
  return diagramId;
}

test("the list searches, filters and sorts", async ({ person }) => {
  const ada = await person("Ada");
  const zed = await person("Zed");
  await make(ada, "Billing", "postgresql");
  await make(ada, "accounts", "mysql");
  await make(ada, "Catalog", "postgresql");
  const shared = await make(zed, "Warehouse", "sqlite");
  await zed.api("POST", `/diagrams/${shared}/members`, {
    email: ada.email,
    role: "viewer",
  });

  const { page } = ada;
  await page.goto("/");
  // Newest first by default
  await expect
    .poll(() => listed(page))
    .toEqual(["Warehouse", "Catalog", "accounts", "Billing"]);
  await expect(page.getByText("4 diagrams")).toBeVisible();

  // By name, ignoring case; again for descending
  const nameHeader = page.locator("th").filter({ hasText: "Name" });
  await nameHeader.click();
  await expect
    .poll(() => listed(page))
    .toEqual(["accounts", "Billing", "Catalog", "Warehouse"]);
  await nameHeader.click();
  await expect
    .poll(() => listed(page))
    .toEqual(["Warehouse", "Catalog", "Billing", "accounts"]);

  // Remembered after a reload
  await page.reload();
  await expect
    .poll(() => listed(page))
    .toEqual(["Warehouse", "Catalog", "Billing", "accounts"]);

  // Search matches the owner and the database too
  const search = page.getByPlaceholder("Search by name, owner or database");
  await search.fill("zed");
  await expect.poll(() => listed(page)).toEqual(["Warehouse"]);
  await search.fill("mysql");
  await expect.poll(() => listed(page)).toEqual(["accounts"]);
  await search.fill("nothing like it");
  await expect(page.getByText("No diagrams match")).toBeVisible();
  await search.fill("");

  // Filter by database
  await choose(
    page.locator(".semi-select").filter({ has: page.locator(".bi-database") }),
    "PostgreSQL",
  );
  await expect.poll(() => listed(page)).toEqual(["Catalog", "Billing"]);
  await expect(page.getByText("2 diagrams")).toBeVisible();
});
