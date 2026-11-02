const { test, expect } = require('@playwright/test');

const SHOP_TABLES = ['users', 'user_profiles', 'addresses', 'categories', 'products', 'tags', 'orders', 'order_items', 'returns'];
const FLOW_TABLES = ['src_contrats.contrat', 'src_contrats.personne', 'src_sinistres.declaration', 'stg.contrat', 'stg.personne', 'stg.sinistre',
  'dwh.dim_assure', 'dwh.dim_contrat', 'dwh.fait_sinistre', 'mart.indicateur_sp'];

// Fresh page per test; console/page errors are collected and asserted in afterEach.
let errors;
test.beforeEach(async ({ page, baseURL }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // Google Fonts is the only network call: stub it so tests are offline-safe
  await page.route(/^https?:/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(baseURL);
  await expect(page.locator('#status')).toHaveClass(/ok/);
});
test.afterEach(() => { expect(errors).toEqual([]); });

async function loadExample(page, key) {
  await page.click('#btnExamples');
  await page.click(`button.mi[data-ex="${key}"]`);
  // a confirmation appears only if the editor content was modified
  if (await page.locator('#exOk').isVisible()) await page.click('#exOk');
  await expect(page.locator('#status')).toHaveClass(/ok/);
}
const tableNodes = page => page.locator('#nodesLayer .node.table');
const tableTitles = async page => (await tableNodes(page).locator('text.title').allTextContents()).map(s => s.trim());

test('page loads without console or page errors', async ({ page }) => {
  await expect(page.locator('#svg')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('Syntaxe valide');
});

for (const [key, tables, mustHave] of [
  ['shop', SHOP_TABLES, ['users', 'products', 'orders', 'order_items', 'returns']],
  ['flow', FLOW_TABLES, ['dwh.fait_sinistre', 'mart.indicateur_sp']],
]) {
  test(`example "${key}" renders without parse error`, async ({ page }) => {
    await loadExample(page, key);
    await expect(page.locator('#status')).toHaveText('Syntaxe valide');
    await expect(tableNodes(page)).toHaveCount(tables.length);
    const titles = await tableTitles(page);
    for (const t of mustHave) expect(titles.some(x => x.split(/\s/)[0] === t)).toBe(true);
    await expect(page.locator('#edgesLayer').locator('*').first()).toBeAttached();
  });

  test(`parseDBML on example "${key}"`, async ({ page }) => {
    await loadExample(page, key);
    const r = await page.evaluate(() => {
      const d = parseDBML(document.getElementById('src').value);
      return { tables: d.tables.map(t => t.name), refs: d.refs.length, mappings: d.mappings.length, enums: d.enums.length };
    });
    expect(r.tables).toHaveLength(tables.length);
    for (const t of tables) expect(r.tables).toContain(t);
    if (key === 'shop') { expect(r.refs).toBeGreaterThanOrEqual(8); expect(r.enums).toBe(2); }
    else { expect(r.refs).toBeGreaterThanOrEqual(3); expect(r.mappings).toBe(3); expect(r.enums).toBe(1); }
  });
}

test('invalid DBML reports a localized error', async ({ page }) => {
  await page.fill('#src', 'Table a {\n  id integer\n}\nTable b {\n  id integer [\n');
  const status = page.locator('#status');
  await expect(status).toHaveClass(/bad/);
  await expect(status).toHaveText(/^Ligne \d+ :/);
  await expect(page.locator('#gutter .err')).toHaveCount(1);
  // direct parser call carries the line too
  const line = await page.evaluate(() => { try { parseDBML('Table a {\n id int\n'); } catch (e) { return e.line; } });
  expect(line).toBeGreaterThan(0);
});

test('SQL export contains tables and enum type', async ({ page }) => {
  await loadExample(page, 'shop');
  await page.click('#btnExport');
  await page.click('#btnSql');
  const sql = page.locator('#sqlOut');
  await expect(sql).toBeVisible();
  const text = await sql.inputValue();
  for (const t of SHOP_TABLES) expect(text).toMatch(new RegExp(`CREATE TABLE[^\\n]*\\b${t}\\b`));
  expect(text).toMatch(/CREATE TYPE[^\n]*order_status/);
});

test('SVG export downloads an SVG with table names', async ({ page }) => {
  await loadExample(page, 'shop');
  await page.click('#btnExport');
  await page.click('#btnImage');
  await page.locator('#imgForm label:has(input[name="fmt"][value="svg"])').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#imgGo')]);
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  const content = require('fs').readFileSync(await download.path(), 'utf8');
  expect(content).toMatch(/^\s*(<\?xml|<svg)/);
  expect(content).toContain('order_items');
});
