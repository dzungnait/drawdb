import { test as base, expect } from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8088";
export const PASSWORD = "correct horse";

// Every run makes new accounts, so the database never needs resetting
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let count = 0;
export const newEmail = (name) =>
  `${name.toLowerCase()}-${run}-${++count}@e2e.test`;

/** Same-origin requests need the Origin header, like the browser sends. */
const ORIGIN = { Origin: BASE_URL };

async function api(context, method, path, data) {
  const res = await context.request.fetch(`/api${path}`, {
    method,
    headers: ORIGIN,
    data,
  });
  if (!res.ok()) {
    throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  }
  return res.status() === 204 ? null : res.json();
}

/**
 * Someone with their own browser: signed up (unless `signedOut`), with
 * `api()` for requests as them. Errors thrown in their pages fail the test.
 */
async function makePerson(browser, name, { signedOut = false } = {}) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const person = {
    name,
    email: null,
    page,
    context,
    errors,
    api: (method, path, data) => api(context, method, path, data),
  };
  if (!signedOut) {
    person.email = newEmail(name);
    const { user } = await person.api("POST", "/auth/register", {
      email: person.email,
      password: PASSWORD,
      name,
    });
    person.id = user.id;
  }
  return person;
}

export const test = base.extend({
  /** `await person("Ada")` gives a new person; `{ signedOut: true }` a visitor. */
  person: async ({ browser }, use) => {
    const people = [];
    await use(async (name, options) => {
      const p = await makePerson(browser, name, options);
      people.push(p);
      return p;
    });
    for (const p of people) {
      expect(p.errors, `errors in ${p.name}'s pages`).toEqual([]);
      await p.context.close();
    }
  },
});
export { expect };

// ---- editor

export const modal = (page) => page.locator(".semi-modal-content").last();

/**
 * Picks an option (its whole text, or a RegExp) of a Semi select, retrying
 * while its list animates in.
 */
export async function choose(select, label) {
  const page = select.page();
  const text = label instanceof RegExp ? label : new RegExp(`^${label}$`);
  await expect(async () => {
    await select.click();
    await page
      .locator(".semi-select-option")
      .filter({ hasText: text })
      .last()
      .click({ timeout: 2000 });
    await expect(select).toContainText(label, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}
export const canvasTables = (page) => page.locator("#diagram foreignObject");

/** Opens a new diagram in the editor, picking the database. */
export async function openNewDiagram(page, database = "PostgreSQL") {
  await page.goto("/editor");
  await page.getByText(database, { exact: true }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
}

export async function addTable(page) {
  // Clicking an empty spot first, so nothing is selected
  await page.locator("#canvas").click({ position: { x: 600, y: 300 } });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add table" }).click();
}

/** A new diagram with one table, saved to the server; returns its id. */
export async function createDiagram(page, database) {
  await openNewDiagram(page, database);
  await addTable(page);
  await page.waitForURL(/\/editor\/diagrams\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop();
  await expect(page.getByText(/Last saved/)).toBeVisible();
  return id;
}

/** The diagram as the server has it, seen by `person`. */
export const serverDiagram = async (person, id) =>
  (await person.api("GET", `/diagrams/${id}`)).diagram;

export const serverTableCount = async (person, id) =>
  (await serverDiagram(person, id)).tables.length;
