import {
  canvasTables,
  choose,
  createDiagram,
  expect,
  test,
} from "./helpers.js";

const commentsButton = (page) => page.getByRole("button", { name: "Comments" });
const panel = (page) =>
  page.locator(".semi-sidesheet").filter({
    hasText: "Comments",
  });

test("commenting on tables, live for everyone with access", async ({
  person,
}) => {
  const ada = await person("Ada");
  const cy = await person("Cy");
  const id = await createDiagram(ada.page);
  await ada.api("POST", `/diagrams/${id}/members`, {
    email: cy.email,
    role: "viewer",
  });
  await cy.page.goto(`/editor/diagrams/${id}`);
  await expect(canvasTables(cy.page)).toHaveCount(1);

  // A viewer comments on a field of the table
  await commentsButton(cy.page).click();
  const cyPanel = panel(cy.page);
  await choose(cyPanel.locator(".semi-select").first(), /^table_/);
  await choose(cyPanel.locator(".semi-select").nth(1), "id");
  await cyPanel
    .getByPlaceholder("Add a comment… (Ctrl+Enter to send)")
    .fill("Should this be a UUID?");
  await cyPanel.getByRole("button", { name: "Comment", exact: true }).click();
  // In the thread (the box it was typed in is cleared right after)
  await expect(
    cyPanel.locator(".whitespace-pre-wrap", {
      hasText: "Should this be a UUID?",
    }),
  ).toBeVisible();
  await expect(cyPanel.locator("textarea").first()).toHaveValue("");
  await expect(cyPanel.getByText(/^table_.*\.id$/)).toBeVisible();

  // Ada sees it on the canvas right away, and answers from there
  const badge = ada.page.locator("[data-comment-badge]");
  await expect(badge).toHaveText("1");
  await expect(commentsButton(ada.page)).toContainText("1");
  await badge.click();
  const adaPanel = panel(ada.page);
  await expect(adaPanel.getByText("Should this be a UUID?")).toBeVisible();
  await adaPanel.getByPlaceholder("Reply…").fill("Yes, let's switch");
  await adaPanel.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(cyPanel.getByText("Yes, let's switch")).toBeVisible();

  // Resolved: off the canvas, under Resolved
  await adaPanel.getByRole("button", { name: "Resolve" }).click();
  await expect(adaPanel.getByText("No open comments")).toBeVisible();
  await expect(badge).toHaveCount(0);
  await expect(cyPanel.getByText("No open comments")).toBeVisible();
  await adaPanel.getByText("Resolved", { exact: true }).click();
  await expect(adaPanel.getByText("Resolved by Ada")).toBeVisible();
});

test("no comments with just a link", async ({ person }) => {
  const ada = await person("Ada");
  const bob = await person("Bob");
  const id = await createDiagram(ada.page);
  await expect(commentsButton(ada.page)).toBeVisible();
  const { links } = await ada.api("PUT", `/diagrams/${id}/links/editor`, {});
  await bob.page.goto(`/editor/diagrams/${id}?link=${links[0].token}`);
  await expect(canvasTables(bob.page)).toHaveCount(1);
  await expect(commentsButton(bob.page)).toHaveCount(0);
});

test("commenting straight from a table or field on the canvas", async ({
  person,
}) => {
  const ada = await person("Ada");
  const bob = await person("Bob");
  const id = await createDiagram(ada.page);
  await ada.api("POST", `/diagrams/${id}/members`, {
    email: bob.email,
    role: "editor",
  });
  await bob.page.goto(`/editor/diagrams/${id}`);
  await expect(canvasTables(bob.page)).toHaveCount(1);

  // A field: hover it, click the comment button, type, Ctrl+Enter
  const { page } = ada;
  const table = canvasTables(page).first();
  await table.locator("span.overflow-hidden", { hasText: "id" }).hover();
  await table.getByRole("button", { name: "Comment on this field" }).click();
  const adaPanel = panel(page);
  await expect(adaPanel.locator(".semi-select").first()).toContainText("id");
  await page.keyboard.type("Make this a bigint");
  await page.keyboard.press("Control+Enter");
  await expect(
    adaPanel.locator(".whitespace-pre-wrap", { hasText: "Make this a bigint" }),
  ).toBeVisible();

  // Bob sees which field has comments
  await expect(bob.page.locator("[data-field-comments]")).toHaveCount(1);

  // A table, from its header (the panel may cover it, so close it first)
  await adaPanel.locator(".semi-sidesheet-close").click();
  await table.locator("div.font-bold").first().hover();
  await table.getByRole("button", { name: "Comment on this table" }).click();
  await expect(adaPanel.locator(".semi-select").first()).toContainText(
    "Whole table",
  );
  await page.keyboard.type("Rename to accounts?");
  await page.keyboard.press("Control+Enter");
  await expect(bob.page.locator("[data-comment-badge]")).toHaveText("2");
});
