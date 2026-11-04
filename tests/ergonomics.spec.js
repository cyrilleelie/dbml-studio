const { test, expect } = require('@playwright/test');
const { menu } = require('./helpers');

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
  await menu(page, '#btnFile', `button.mi[data-ex="${key}"]`);
  if (await page.locator('#exOk').isVisible()) await page.click('#exOk');
  await expect(page.locator('#status')).toHaveClass(/ok/);
}
const setZoom = (page, k) => page.evaluate(k => window.dbmlStudio.setZoom(k), k);
const centerOn = (page, id) => page.evaluate(id => window.dbmlStudio.centerOn(id, 1), id);
const table = (page, name) => page.locator('#nodesLayer .node.table').filter({ has: page.locator('text.title', { hasText: new RegExp('^\\s*' + name + '\\b') }) });

test('display panel scrolls on a small viewport and offers « Tout cocher »', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 });
  await menu(page, '#btnView', '#btnDisplayPanel');
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

test('menu bar is fully visible and its six menus do not overlap (1280, 1024, 900 px)', async ({ page }) => {
  for (const width of [1280, 1024, 900]) {
    await page.setViewportSize({ width, height: 720 });
    const boxes = await page.locator('#menubar > .menu-wrap > button').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, t: b.textContent }; }));
    expect(boxes.map(x => x.t)).toEqual(['Fichier', 'Édition', 'Affichage', 'Disposition', 'Exporter', 'Aide']);
    for (const [i, a] of boxes.entries()) {
      expect(a.x, `left edge at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(a.r, `right edge at ${width}px`).toBeLessThanOrEqual(width);
      for (const b of boxes.slice(i + 1)) {
        const overlap = a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
        expect(overlap, `overlap at ${width}px`).toBe(false);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('detailed view keeps full tables at any zoom (no names-only mode)', async ({ page }) => {
  await loadExample(page, 'shop');
  const colCount = await page.locator('#nodesLayer .cname').count();
  expect(colCount).toBeGreaterThan(20);
  await setZoom(page, 0.3);
  await expect(page.locator('#nodesLayer .cname')).toHaveCount(colCount);
  await expect(page.locator('#nodesLayer .node.table').first().locator('.ctype').first()).toBeAttached();
  await expect(page.locator('#svg')).not.toHaveClass(/compact/);
  await expect(page.locator('#nodesLayer .compact')).toHaveCount(0);
  // zoom out with the controls as well
  for (let i = 0; i < 3; i++) await page.click('#zOut');
  await expect(page.locator('#nodesLayer .cname')).toHaveCount(colCount);
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

// ---- Export follows the canvas ----
const fs = require('fs');
async function exportImage(page, fmt) {
  await menu(page, '#btnExport', '#btnImage');
  await page.locator(`#imgForm label:has(input[name="fmt"][value="${fmt}"])`).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#imgGo')]);
  return fs.readFileSync(await download.path());
}
// Opens an exported SVG as a standalone document in a second page and runs fn in it.
async function inExported(page, svg, fn, arg) {
  const p2 = await page.context().newPage();
  try {
    await p2.goto('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    return await p2.evaluate(fn, arg);
  } finally { await p2.close(); }
}
const pngSize = buf => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const canvasIds = page => page.evaluate(() => [...document.querySelectorAll('#nodesLayer .node')].map(n => n.dataset.id).sort());
const exportedStats = (page, svg) => inExported(page, svg, () => ({
  ids: [...document.querySelectorAll('.node')].map(n => n.dataset.id).sort(),
  edges: document.querySelectorAll('.edge').length
}));

test('conceptual view at zoom 30 %: exported entities are enlarged like on the canvas, hidden cardinalities stay hidden', async ({ page }) => {
  await loadExample(page, 'shop');
  await menu(page, '#btnView', '#btnConcept');
  await expect(page.locator('#world')).toHaveClass(/concept/);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // let the deferred fit() run
  await setZoom(page, 0.3);
  const k = await page.evaluate(() => window.dbmlStudio.zoom);
  const body = page.locator('#nodesLayer .node[data-id="t:orders"] .body');
  await expect.poll(() => body.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(0);
  const canvasW = await body.evaluate(el => el.getBoundingClientRect().width);
  const baseW = await page.locator('#nodesLayer .node[data-id="t:orders"] .body').evaluate(el => +el.getAttribute('width'));
  const factor = canvasW / k / baseW; // enlargement shown on the canvas
  expect(factor).toBeGreaterThan(1.5);
  await expect(page.locator('#edgesLayer .card').first()).toBeVisible();
  const svg = (await exportImage(page, 'svg')).toString('utf8');
  expect(svg).not.toContain('var(--');
  const exp = await inExported(page, svg, () => {
    const b = document.querySelector('.node[data-id="t:orders"] .body').getBoundingClientRect();
    const line = document.querySelector('.edge .line');
    return { w: b.width, lineW: parseFloat(getComputedStyle(line).strokeWidth), cardShown: [...document.querySelectorAll('.edge .card')].some(c => getComputedStyle(c).display !== 'none') };
  });
  expect(exp.w / baseW).toBeCloseTo(factor, 1);
  expect(exp.lineW).toBeCloseTo(1.9 * factor, 1);
  expect(exp.cardShown).toBe(true);
  // nothing cropped: every entity lies inside the exported canvas
  const inside = await inExported(page, svg, () => {
    const r = document.documentElement.getBoundingClientRect();
    return [...document.querySelectorAll('.node .body')].every(n => { const b = n.getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= r.width && b.bottom <= r.height; });
  });
  expect(inside).toBe(true);
  // below the card threshold, cardinalities are hidden on the canvas and in the export
  await setZoom(page, 0.2);
  await expect(page.locator('#world')).toHaveClass(/nocard/);
  const svg2 = (await exportImage(page, 'svg')).toString('utf8');
  const shown = await inExported(page, svg2, () => [...document.querySelectorAll('.edge .card')].filter(c => getComputedStyle(c).display !== 'none').length);
  expect(shown).toBe(0);
});

test('SVG export has the same nodes and edges as the canvas, also after hiding elements', async ({ page }) => {
  await loadExample(page, 'shop');
  await setZoom(page, 0.5);
  let svg = (await exportImage(page, 'svg')).toString('utf8');
  let st = await exportedStats(page, svg);
  expect(st.ids).toEqual(await canvasIds(page));
  expect(st.edges).toBe(await page.locator('#edgesLayer .edge').count());
  const before = st.ids.length;
  // hide two tables via the display panel
  await menu(page, '#btnView', '#btnDisplayPanel');
  await page.locator('#displayPanel input[data-hide="t:returns"]').uncheck();
  await page.locator('#displayPanel input[data-hide="t:tags"]').uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('#nodesLayer .node')).toHaveCount(before - 2);
  svg = (await exportImage(page, 'svg')).toString('utf8');
  st = await exportedStats(page, svg);
  expect(st.ids).toEqual(await canvasIds(page));
  expect(st.ids).not.toContain('t:returns');
  expect(st.edges).toBe(await page.locator('#edgesLayer .edge').count());
  // same in conceptual view
  await menu(page, '#btnView', '#btnConcept');
  await setZoom(page, 0.4);
  svg = (await exportImage(page, 'svg')).toString('utf8');
  st = await exportedStats(page, svg);
  expect(st.ids).toEqual(await canvasIds(page));
  expect(st.edges).toBe(await page.locator('#edgesLayer .edge').count());
});

test('SVG export keeps the lane bands styled (no default black rectangles)', async ({ page }) => {
  await loadExample(page, 'flow');
  await menu(page, '#btnView', '#btnDisplayPanel');
  await page.locator('#displayPanel input[data-lanes]').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#lanesLayer .lane-band').first()).toBeAttached();
  const n = await page.locator('#lanesLayer .lane-band').count();
  const svg = (await exportImage(page, 'svg')).toString('utf8');
  const r = await inExported(page, svg, () => [...document.querySelectorAll('.lane-band .lb-fill')].map(el => {
    const cs = getComputedStyle(el); return { fill: cs.fill, op: +cs.fillOpacity };
  }));
  expect(r.length).toBe(n);
  for (const x of r) expect(x.op).toBeLessThan(0.2);
});

test('detailed-view PNG export does not depend on the zoom', async ({ page }) => {
  await loadExample(page, 'shop');
  await setZoom(page, 1);
  const a = pngSize(await exportImage(page, 'png'));
  await setZoom(page, 0.3);
  const b = pngSize(await exportImage(page, 'png'));
  expect(b).toEqual(a);
  expect(a.w).toBeGreaterThan(500);
});

test('colored Ref group edges keep their color in the export (detailed and conceptual views)', async ({ page }) => {
  await loadExample(page, 'shop');
  for (const concept of [false, true]) {
    if (concept) await menu(page, '#btnView', '#btnConcept');
    await setZoom(page, 0.5);
    const canvas = await page.evaluate(() => [...document.querySelectorAll('#edgesLayer .edge.refgrouped')].map(g => ({
      a: g.dataset.a, b: g.dataset.b, line: getComputedStyle(g.querySelector('.line')).stroke, mk: getComputedStyle(g.querySelector('.mk')).stroke
    })));
    expect(canvas.length).toBeGreaterThan(0);
    expect(canvas[0].line).not.toBe(await page.evaluate(() => getComputedStyle(document.querySelector('#edgesLayer .edge:not(.refgrouped) .line')).stroke));
    const svg = (await exportImage(page, 'svg')).toString('utf8');
    const exp = await inExported(page, svg, () => [...document.querySelectorAll('.edge.refgrouped')].map(g => ({
      a: g.dataset.a, b: g.dataset.b, line: getComputedStyle(g.querySelector('.line')).stroke, mk: getComputedStyle(g.querySelector('.mk')).stroke
    })));
    expect(exp).toEqual(canvas);
  }
});
