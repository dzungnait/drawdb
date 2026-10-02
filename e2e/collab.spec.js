import {
  addTable,
  canvasTables,
  createDiagram,
  expect,
  serverDiagram,
  test,
} from "./helpers.js";

/** Table names on the canvas, sorted. */
const tableNames = (page) =>
  canvasTables(page).evaluateAll((els) =>
    els
      .map((e) => e.querySelector("div")?.innerText.split("\n")[0])
      .filter(Boolean)
      .sort(),
  );

async function renameFirstTable(page, name) {
  await page.locator(".semi-collapse-header").first().click();
  const field = page.locator(".semi-collapse-content input").first();
  await field.fill(name);
  await field.blur();
}

test("editing together live", async ({ person }) => {
  const ada = await person("Ada");
  const bob = await person("Bob");
  const cy = await person("Cy");
  const id = await createDiagram(ada.page);
  await ada.api("POST", `/diagrams/${id}/members`, {
    email: bob.email,
    role: "editor",
  });
  await ada.api("POST", `/diagrams/${id}/members`, {
    email: cy.email,
    role: "viewer",
  });
  for (const p of [bob, cy]) await p.page.goto(`/editor/diagrams/${id}`);

  // Everyone sees who's here
  const presence = ada.page.getByRole("button", { name: "Who's here" });
  await expect(presence.locator(".semi-avatar")).toHaveCount(2);

  // A table Ada adds shows up for the others, without saving over REST
  let puts = 0;
  ada.page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/api/diagrams")) puts++;
  });
  await addTable(ada.page);
  await expect(canvasTables(bob.page)).toHaveCount(2);
  await expect(canvasTables(cy.page)).toHaveCount(2);

  // Bob renames a table; it reaches Ada and the server
  await renameFirstTable(bob.page, "customers");
  await expect.poll(() => tableNames(ada.page)).toContain("customers");
  await expect
    .poll(async () => (await serverDiagram(ada, id)).tables.map((t) => t.name))
    .toContain("customers");
  expect(puts).toBe(0);

  // Ada undoing her own table keeps Bob's rename
  await ada.page.locator("#canvas").click({ position: { x: 1000, y: 700 } });
  await ada.page.keyboard.press("Control+z");
  await expect(canvasTables(bob.page)).toHaveCount(1);
  expect(await tableNames(bob.page)).toEqual(["customers"]);

  // Bob's cursor (its label is white on his color) shows for Ada
  await bob.page.mouse.move(700, 400);
  await bob.page.mouse.move(720, 420, { steps: 3 });
  await expect(
    ada.page.locator("#diagram text[fill='white']", { hasText: "Bob" }),
  ).toBeVisible();

  // The relationship Bob is drawing shows for Ada until he lets go
  const remoteLines = ada.page.locator("#diagram path[stroke-dasharray='8,8']");
  const grip = bob.page
    .locator("#diagram foreignObject button.rounded-full")
    .first();
  const box = await grip.boundingBox();
  await bob.page.mouse.move(box.x + 5, box.y + 5);
  await bob.page.mouse.down();
  await bob.page.mouse.move(box.x + 300, box.y + 200, { steps: 10 });
  await expect(remoteLines).toHaveCount(1);
  await bob.page.mouse.up();
  await expect(remoteLines).toHaveCount(0);

  // The viewer becomes an editor while it's open
  await expect(
    cy.page.getByRole("button", { name: "Add table" }),
  ).toBeDisabled();
  await ada.api("PATCH", `/diagrams/${id}/members/${cy.id}`, {
    role: "editor",
  });
  await expect(
    cy.page.getByRole("button", { name: "Add table" }),
  ).toBeEnabled();

  // Removing Bob closes it for him
  await ada.api("DELETE", `/diagrams/${id}/members/${bob.id}`);
  await expect(bob.page.getByText("Can't open this diagram")).toBeVisible();
});
