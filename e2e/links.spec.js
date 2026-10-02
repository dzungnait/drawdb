import {
  addTable,
  canvasTables,
  createDiagram,
  expect,
  modal,
  PASSWORD,
  serverTableCount,
  test,
} from "./helpers.js";

test("view and edit links", async ({ person }) => {
  const owner = await person("Owner");
  const bob = await person("Bob");
  const { page } = owner;
  const id = await createDiagram(page);

  // Turn on both links
  await page.getByRole("button", { name: "Share" }).first().click();
  await expect(modal(page).getByText("Share with a link")).toBeVisible();
  await modal(page)
    .getByRole("switch", { name: "Anyone with the link can view" })
    .click();
  await modal(page)
    .getByRole("switch", { name: "Anyone with the link can edit" })
    .click();
  const urls = modal(page).locator("input[readonly]");
  await expect(urls).toHaveCount(2);
  const [viewUrl, editUrl] = await urls.evaluateAll((els) =>
    els.map((e) => e.value),
  );
  await page.keyboard.press("Escape");

  // Signed out, the view link shows it read-only and changes nothing
  const visitor = await person("Visitor", { signedOut: true });
  let writes = 0;
  visitor.page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/api/diagrams")) writes++;
  });
  await visitor.page.goto(viewUrl);
  await expect(canvasTables(visitor.page)).toHaveCount(1);
  await expect(visitor.page.getByText("Read only")).toBeVisible();
  expect(writes).toBe(0);

  // Signed out, the edit link asks to sign in, then edits
  await bob.context.clearCookies();
  await bob.page.goto(editUrl);
  await expect(bob.page.getByText("Sign in to edit it")).toBeVisible();
  await expect(bob.page.getByText("Read only")).toBeVisible();
  await bob.page
    .locator(".bi-pencil-square")
    .locator("..")
    .getByRole("button", { name: "Sign in" })
    .click();
  await modal(bob.page).locator("input").nth(0).fill(bob.email);
  await modal(bob.page).locator("input").nth(1).fill(PASSWORD);
  await modal(bob.page).getByRole("button", { name: "Sign in" }).click();
  await expect(bob.page.getByText("Sign in to edit it")).toBeHidden();
  await expect(bob.page.getByText("Read only")).toBeHidden();
  await addTable(bob.page);
  await expect.poll(() => serverTableCount(owner, id)).toBe(2);

  // A new view link replaces the old one
  await page.reload();
  await page.getByRole("button", { name: "Share" }).first().click();
  await modal(page).getByRole("button", { name: "New link" }).first().click();
  await modal(page)
    .locator("button")
    .filter({ hasText: /^New link$/ })
    .click();
  await visitor.page.goto(viewUrl);
  await expect(visitor.page.getByText("This link doesn't work")).toBeVisible();

  // Turning off the edit link ends Bob's access
  await page
    .locator(".semi-modal-content")
    .first()
    .getByRole("switch", { name: "Anyone with the link can edit" })
    .click();
  await expect
    .poll(async () =>
      (await owner.api("GET", `/diagrams/${id}/links`)).links.map(
        (l) => l.role,
      ),
    )
    .toEqual(["viewer"]);
  await bob.page.goto(editUrl);
  await expect(bob.page.getByText("This link doesn't work")).toBeVisible();
});
