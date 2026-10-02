import {
  addTable,
  canvasTables,
  choose,
  createDiagram,
  expect,
  modal,
  newEmail,
  PASSWORD,
  serverTableCount,
  test,
} from "./helpers.js";

const rows = (page) => page.locator(".semi-table-tbody tr");

test("sharing a diagram with people as editors or viewers", async ({
  person,
}) => {
  const owner = await person("Owner");
  const editor = await person("Editor");
  const viewer = await person("Viewer");
  const visitor = await person("Visitor", { signedOut: true });
  const id = await createDiagram(owner.page);
  const url = `/editor/diagrams/${id}`;

  // Not shared yet
  await editor.page.goto(url);
  await expect(editor.page.getByText("Can't open this diagram")).toBeVisible();
  await visitor.page.goto(url);
  await expect(
    visitor.page.getByText("Sign in to open this diagram"),
  ).toBeVisible();

  // The owner shares by email; someone without an account gets an invite
  const { page } = owner;
  await page.getByRole("button", { name: "Share" }).first().click();
  await expect(
    modal(page).getByText("People with access", { exact: true }),
  ).toBeVisible();
  const later = newEmail("Later");
  for (const [email, role] of [
    [editor.email, "Editor"],
    [viewer.email, "Viewer"],
    [later, "Editor"],
  ]) {
    await modal(page).locator("input[type=email]").fill(email);
    await choose(modal(page).locator(".semi-select").first(), role);
    await modal(page).getByRole("button", { name: "Share" }).click();
    await expect(modal(page).getByText(email)).toBeVisible();
  }
  await page.keyboard.press("Escape");

  // The editor can edit
  await editor.page.reload();
  await expect(canvasTables(editor.page)).toHaveCount(1);
  await addTable(editor.page);
  await expect.poll(() => serverTableCount(owner, id)).toBe(2);

  // The viewer can only look
  await viewer.page.goto(url);
  await expect(canvasTables(viewer.page)).toHaveCount(2);
  await expect(viewer.page.getByText("Read only")).toBeVisible();
  await expect(
    viewer.page.getByRole("button", { name: "Add table" }),
  ).toBeDisabled();

  // The home page shows what's shared with whom
  await editor.page.goto("/");
  await expect(rows(editor.page)).toHaveCount(1);
  await expect(rows(editor.page)).toContainText("Editor");
  await editor.page.getByText("Owned by me").click();
  await expect(rows(editor.page).locator(".font-medium")).toHaveCount(0);

  // Removing the viewer closes it for them
  await page.goto("/");
  await rows(page).first().locator("button").click();
  await page
    .locator(".semi-dropdown-item")
    .filter({ hasText: /^Share$/ })
    .click();
  const viewerRow = modal(page)
    .locator(".flex.items-center")
    .filter({ hasText: viewer.email })
    .last();
  await viewerRow.getByRole("button", { name: "Remove access" }).click();
  await expect(modal(page).getByText(viewer.email)).toBeHidden();
  await viewer.page.reload();
  await expect(viewer.page.getByText("Can't open this diagram")).toBeVisible();
  await page.keyboard.press("Escape");

  // The invitee finds it after signing up
  const invitee = await person("Later", { signedOut: true });
  await invitee.api("POST", "/auth/register", {
    email: later,
    password: PASSWORD,
    name: "Later",
  });
  await invitee.page.goto("/");
  await expect(rows(invitee.page).locator(".font-medium")).toHaveCount(1);

  // The editor leaves
  await editor.page.getByText("All", { exact: true }).click();
  await rows(editor.page).first().locator("button").click();
  await editor.page
    .locator(".semi-dropdown-item")
    .filter({ hasText: /^Leave$/ })
    .click();
  await modal(editor.page)
    .locator("button")
    .filter({ hasText: /^Leave$/ })
    .click();
  await expect(editor.page.getByText("You left the diagram")).toBeVisible();
  await expect(rows(editor.page).locator(".font-medium")).toHaveCount(0);
});

test("handing a diagram over to someone else", async ({ person }) => {
  const owner = await person("Owner");
  const bob = await person("Bob");
  const id = await createDiagram(owner.page);
  await owner.api("POST", `/diagrams/${id}/members`, {
    email: bob.email,
    role: "editor",
  });
  await bob.page.goto(`/editor/diagrams/${id}`);
  await expect(canvasTables(bob.page)).toHaveCount(1);

  // From the share dialog on the home page
  const { page } = owner;
  await page.goto("/");
  await rows(page).first().locator("button").click();
  await page
    .locator(".semi-dropdown-item")
    .filter({ hasText: /^Share$/ })
    .click();
  const bobRow = modal(page)
    .locator(".flex.items-center")
    .filter({ hasText: bob.email })
    .last();
  // The select keeps showing "Editor" and asks to confirm instead
  await expect(async () => {
    await bobRow.locator(".semi-select").click();
    await page
      .locator(".semi-select-option")
      .filter({ hasText: /^Make owner$/ })
      .click({ timeout: 2000 });
    await expect(page.getByText("will own this diagram")).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 10_000 });
  await modal(page)
    .locator("button")
    .filter({ hasText: /^Make owner$/ })
    .click();
  await expect(page.getByText("Bob now owns this diagram")).toBeVisible();
  // Now only an editor here: no sharing controls
  await expect(
    page.locator(".semi-modal-content input[type=email]"),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(rows(page)).toContainText("Bob");

  // Bob owns it, also in the editor he has open
  await bob.page.getByRole("button", { name: "Share" }).first().click();
  await expect(modal(bob.page).locator("input[type=email]")).toBeVisible();
  await bob.page.goto("/");
  await expect(rows(bob.page)).toContainText("Owner");
});
