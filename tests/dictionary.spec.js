const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { menu } = require('./helpers');

let errors, external;
test.beforeEach(async ({ page, baseURL }) => {
  errors = [];
  external = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route(/^https?:/, r => { external.push(r.request().url()); return r.abort(); });
  await page.goto(baseURL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#status')).toHaveClass(/ok/);
  await menu(page, '#btnFile', '[data-ex="shop"]');
  await expect(page.locator('#status')).toHaveClass(/ok/);
});
test.afterEach(() => { expect(external, 'no network request expected').toEqual([]); expect(errors).toEqual([]); });

async function download(page, format) {
  await menu(page, '#btnExport', '#btnDict');
  await expect(page.locator('#dictModal')).toBeVisible();
  await page.locator(`#dictModal input[value="${format}"]`).check({ force: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dictSave')]);
  return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') };
}

test('Exporter menu lists the data dictionary entry', async ({ page }) => {
  await page.click('#btnExport');
  await expect(page.locator('#btnDict')).toContainText('Dictionnaire de données…');
  await expect(page.locator('#btnDict small')).toHaveText('HTML autonome ou Markdown');
});

test('HTML dictionary downloads a standalone file with the boutique model', async ({ page }) => {
  const { name, text } = await download(page, 'html');
  expect(name).toMatch(/\.html$/);
  expect(text).toMatch(/^<!doctype html>/);
  expect(text).not.toMatch(/https?:|<link|<script|dbml-studio:layout/);
  expect(text).toContain('<h1>boutique</h1>');
  for (const t of ['users', 'user_profiles', 'addresses', 'products']) expect(text).toContain(`>${t}</h3>`);
  expect(text).toContain('varchar(255)');
  expect(text).toContain('Identifiant de connexion, normalisé en minuscules');
  expect(text).toContain('Comptes clients');
  expect(text).toContain('un-à-un (1:1)');
  expect(text).toContain('<h2>Régions</h2>');
  expect(text).toContain('<h3>comptes</h3>');
});

test('Markdown dictionary downloads a .md file with GFM tables', async ({ page }) => {
  const { name, text } = await download(page, 'md');
  expect(name).toMatch(/\.md$/);
  expect(text).toMatch(/^# boutique/);
  expect(text).toContain('| Champ | Type | Contraintes | Description |');
  expect(text).toContain('varchar(255)');
  expect(text).toContain('Identifiant de connexion, normalisé en minuscules');
  expect(text).toContain('## Relations');
  expect(text).toContain('### comptes');
  expect(text).not.toContain('dbml-studio:layout');
});

test('notes are escaped in HTML and Markdown; Copier fills the clipboard path without error', async ({ page }) => {
  await page.fill('#src', "Table t {\n  a int [note: 'x <b>&</b> | y']\n}\n");
  await expect(page.locator('#nodesLayer .node')).toHaveCount(1);
  const html = await download(page, 'html');
  expect(html.text).toContain('x &lt;b&gt;&amp;&lt;/b&gt; | y');
  expect(html.text).not.toContain('<b>&</b>');
  await page.locator('#dictModal input[value="md"]').check({ force: true });
  await expect(page.locator('#dictOut')).toHaveValue(/x &lt;b>&&lt;\/b> \\\| y/);
  await page.click('#dictCopy');
  await page.click('#dictClose');
  await expect(page.locator('#dictModal')).toBeHidden();
});
