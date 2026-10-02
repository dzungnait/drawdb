import {
  choose,
  createDiagram,
  expect,
  modal,
  newEmail,
  PASSWORD,
  test,
} from "./helpers.js";

test("teams, and diagrams shared with a team", async ({ person }) => {
  const ada = await person("Ada");
  const bob = await person("Bob");
  const { page } = ada;

  // Create a team and add people; someone without an account is invited
  await page.goto("/teams");
  await page.getByRole("button", { name: "New team" }).first().click();
  await modal(page).locator("input").fill("Backend");
  await modal(page)
    .locator("button")
    .filter({ hasText: /^Create$/ })
    .click();
  await expect(page).toHaveURL(/\/teams\/[0-9a-f-]{36}$/);
  const teamId = page.url().split("/").pop();
  const dan = newEmail("Dan");
  for (const email of [bob.email, dan]) {
    await page.locator("input[type=email]").fill(email);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator(".divide-y")).toContainText(email);
  }

  // Share a diagram with the team, as viewers
  const id = await createDiagram(page);
  await page.getByRole("button", { name: "Share" }).first().click();
  const teamsSection = modal(page).getByText("Teams with access").locator("..");
  await choose(teamsSection.locator(".semi-select").first(), "Backend");
  await choose(teamsSection.locator(".semi-select").nth(1), "Viewer");
  await teamsSection.getByRole("button", { name: "Share" }).click();
  await expect(teamsSection).toContainText("2 members");
  await page.keyboard.press("Escape");

  // Bob sees it through the team, read-only
  await bob.page.goto("/");
  await expect(bob.page.locator(".semi-table-tbody tr")).toContainText(
    "Backend",
  );
  await bob.page.goto(`/editor/diagrams/${id}`);
  await expect(bob.page.getByText("Read only")).toBeVisible();

  // Made editors: applies while Bob has it open
  await ada.api("PATCH", `/diagrams/${id}/teams/${teamId}`, {
    role: "editor",
  });
  await expect(bob.page.getByText("Read only")).toBeHidden();

  // Ada's home page filtered by the team
  await page.goto(`/?team=${teamId}`);
  await expect(page.locator(".semi-table-tbody tr .font-medium")).toHaveCount(
    1,
  );

  // Leaving the team closes the diagram for Bob
  await ada.api("DELETE", `/teams/${teamId}/members/${bob.id}`);
  await expect(bob.page.getByText("Can't open this diagram")).toBeVisible();

  // The invitee is in the team once signed up
  const later = await person("Dan", { signedOut: true });
  await later.api("POST", "/auth/register", {
    email: dan,
    password: PASSWORD,
    name: "Dan",
  });
  await later.page.goto("/teams");
  await expect(later.page.getByText("Backend").first()).toBeVisible();
});
