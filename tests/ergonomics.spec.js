const { test, expect } = require('@playwright/test');

// Same setup as app.spec.js: collect console/page errors, forbid any network request.
let errors, external;
test.beforeEach(async ({ page, baseURL }) => {
  errors = [];
  external = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route(/^https?:/, r => { external.push(r.request().url()); return r.abort(); });
  await page.goto(baseURL);
  await expect(page.locator('#status')).toHaveClass(/ok/);
});
test.afterEach(() => { expect(external, 'no network request expected').toEqual([]); expect(errors).toEqual([]); });

async function loadExample(page, key) {
  await page.click('#btnExamples');
  await page.click(`button.mi[data-ex="${key}"]`);
  if (await page.locator('#exOk').isVisible()) await page.click('#exOk');
  await expect(page.locator('#status')).toHaveClass(/ok/);
}
const setZoom = (page, k) => page.evaluate(k => window.dbmlStudio.setZoom(k), k);
const centerOn = (page, id) => page.evaluate(id => window.dbmlStudio.centerOn(id, 1), id);
const table = (page, name) => page.locator('#nodesLayer .node.table').filter({ has: page.locator('text.title', { hasText: new RegExp('^\\s*' + name + '\\b') }) });

test('display panel scrolls on a small viewport and offers « Tout cocher »', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 });
  await page.click('#btnDisplayPanel');
  const panel = page.locator('#displayPanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('label:has(#showAllEls)')).toHaveText('Tout cocher');
  const m = await panel.evaluate(el => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { overflowY: cs.overflowY, maxHeight: cs.maxHeight, scrollable: el.scrollHeight > el.clientHeight || el.querySelector('.fp-body').scrollHeight > el.querySelector('.fp-body').clientHeight, top: r.top, bottom: r.bottom };
  });
  expect(m.overflowY).toBe('auto');
  expect(m.maxHeight).not.toBe('none');
  expect(m.top).toBeGreaterThanOrEqual(0);
  expect(m.bottom).toBeLessThanOrEqual(420);
});

test('« Masquer » lives in the editor header, hides the editor, and it can be shown again', async ({ page }) => {
  const btn = page.locator('#editorHead #btnCollapseEditor');
  await expect(page.locator('#editorHead')).toContainText('Code DBML');
  await expect(btn).toHaveText('Masquer');
  await btn.click();
  await expect(page.locator('#editorPane')).toBeHidden();
  await page.click('#btnReopenEditor');
  await expect(page.locator('#editorPane')).toBeVisible();
  await expect(btn).toBeVisible();
});

test('help text moved out of the bottom bar into a popover', async ({ page }) => {
  await expect(page.locator('#helpPop')).toBeHidden();
  await page.click('#btnHelp');
  await expect(page.locator('#helpPop')).toBeVisible();
  await expect(page.locator('#helpPop')).toContainText('Maj+glisser');
  await expect(page.locator('.toolbar')).not.toContainText('Maj+glisser');
});

test('semantic zoom: compact tables below the threshold, full tables above', async ({ page }) => {
  await loadExample(page, 'shop');
  const threshold = await page.evaluate(() => window.dbmlStudio.SEMANTIC_ZOOM_MIN);
  expect(threshold).toBeGreaterThan(0.3);
  expect(threshold).toBeLessThan(0.8);
  await setZoom(page, 1);
  await expect(page.locator('#svg')).not.toHaveClass(/compact/);
  await expect(page.locator('#nodesLayer .node.compact')).toHaveCount(0);
  await expect(page.locator('#nodesLayer .cname').first()).toBeAttached();
  // zoom out through the controls
  await setZoom(page, 0.7);
  for (let i = 0; i < 3; i++) await page.click('#zOut');
  await expect(page.locator('#svg')).toHaveClass(/compact/);
  await expect(page.locator('#nodesLayer .node.table.compact')).toHaveCount(9);
  await expect(page.locator('#nodesLayer .cname')).toHaveCount(0);
  const titles = await page.locator('#nodesLayer .node.table.compact text.title').allTextContents();
  expect(titles.some(t => t.trim().startsWith('orders'))).toBe(true);
  // region labels keep a constant on-screen size: scale = 1/zoom
  const k = await page.evaluate(() => window.dbmlStudio.zoom);
  const scale = await page.locator('#groupsLayer text.glabel').first().evaluate(t => t.transform.baseVal.getItem(1).matrix.a);
  expect(scale).toBeCloseTo(1 / k, 1);
  // edges stay attached to the (shorter) compact node
  await expect(page.locator('#edgesLayer .edge').first()).toBeAttached();
  await setZoom(page, 1);
  await expect(page.locator('#svg')).not.toHaveClass(/compact/);
  await expect(page.locator('#nodesLayer .node.compact')).toHaveCount(0);
  await expect(page.locator('#nodesLayer .cname').first()).toBeAttached();
});

test('hovering a table highlights its edges and dims the others', async ({ page }) => {
  await loadExample(page, 'shop');
  await centerOn(page, 't:orders');
  const edges = page.locator('#edgesLayer .edge');
  await expect(edges.locator('xpath=self::*[contains(@class,"hl")]')).toHaveCount(0);
  const t = table(page, 'orders');
  await t.locator('text.title').hover();
  const related = await page.evaluate(() => window.dbmlStudio.relatedEdgeCount('t:orders'));
  expect(related).toBeGreaterThan(0);
  await expect(page.locator('#edgesLayer .edge.hl')).toHaveCount(related);
  await expect(page.locator('#edgesLayer .edge.faded')).toHaveCount(await edges.count() - related);
  await expect(page.locator('#nodesLayer .node.faded').first()).toBeAttached();
  await expect(t).not.toHaveClass(/faded/);
  // leaving the table restores everything
  await page.mouse.move(5, 500);
  await expect(page.locator('#edgesLayer .edge.hl')).toHaveCount(0);
  await expect(page.locator('#edgesLayer .edge.faded')).toHaveCount(0);
  await expect(page.locator('#nodesLayer .node.faded')).toHaveCount(0);
});

test('selection focus survives hovering (existing select behaviour)', async ({ page }) => {
  await loadExample(page, 'shop');
  await centerOn(page, 't:orders');
  await table(page, 'orders').locator('text.title').click();
  await expect(table(page, 'orders')).toHaveClass(/sel/);
  await expect(page.locator('#edgesLayer .edge.hot').first()).toBeAttached();
  await page.mouse.move(5, 500);
  await expect(page.locator('#edgesLayer .edge.hot').first()).toBeAttached(); // selection focus survives hover end
});

test('SVG export stays complete when zoomed out', async ({ page }) => {
  await loadExample(page, 'shop');
  await setZoom(page, 0.3);
  await expect(page.locator('#svg')).toHaveClass(/compact/);
  await page.click('#btnExport');
  await page.click('#btnImage');
  await page.locator('#imgForm label:has(input[name="fmt"][value="svg"])').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#imgGo')]);
  const content = require('fs').readFileSync(await download.path(), 'utf8');
  for (const col of ['shipping_address_id', 'unit_price', 'created_at']) expect(content).toContain(col);
  expect(content).toContain('order_items');
  // the on-screen view returns to compact afterwards
  await expect(page.locator('#svg')).toHaveClass(/compact/);
  await expect(page.locator('#nodesLayer .node.compact').first()).toBeAttached();
});
