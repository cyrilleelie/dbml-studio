const { test, expect } = require('@playwright/test');
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
});
test.afterEach(() => { expect(external, 'no network request expected').toEqual([]); expect(errors).toEqual([]); });

const nodes = page => page.locator('#nodesLayer .node');
const edW = page => page.locator('#editorPane').evaluate(el => el.getBoundingClientRect().width);

test('four top-level menus in order; Affichage and Disposition no longer exist', async ({ page }) => {
  const labels = await page.locator('#menubar > .menu-wrap > button').allTextContents();
  expect(labels).toEqual(['Fichier', 'Édition', 'Exporter', 'Aide']);
  for (const id of ['#btnView', '#btnDispo', '#viewMenu', '#layoutMenu']) await expect(page.locator(id)).toHaveCount(0);
  await expect(page.locator('#menubar')).not.toContainText('Affichage');
  await expect(page.locator('#menubar')).not.toContainText('Disposition');
  await expect(page.locator('#btnExamples')).toHaveCount(0);
  await expect(page.locator('#btnHelp')).toHaveCount(0);
});

test('hovering another menu while one is open switches to it; Escape closes', async ({ page }) => {
  await page.click('#btnFile');
  await expect(page.locator('#fileMenu')).toBeVisible();
  await page.hover('#btnExport');
  await expect(page.locator('#fileMenu')).toBeHidden();
  await expect(page.locator('#exportMenu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#exportMenu')).toBeHidden();
});

test('arrow keys navigate the menu bar and items', async ({ page }) => {
  await page.focus('#btnFile');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#fileMenu')).toBeVisible();
  await expect(page.locator('#btnNewFlow')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#editMenu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btnCopy')).toBeFocused();
});

test('canvas toolbar offers zoom, view and layout commands in one click, each with a French title', async ({ page }) => {
  const ids = await page.locator('.toolbar button').evaluateAll(bs => bs.map(b => b.id));
  expect(ids).toEqual(['zOut', 'zIn', 'btnConcept', 'btnDisplayPanel', 'btnFit', 'btnToggleEditor', 'btnLayout', 'btnCollapseAll', 'btnLockPanel']);
  const attrs = await page.locator('.toolbar button').evaluateAll(bs => bs.map(b => [b.title, b.getAttribute('aria-label')]));
  for (const [t, l] of attrs) { expect(t).toBeTruthy(); expect(l).toBeTruthy(); }
  for (const id of ids) await expect(page.locator('#' + id)).toBeVisible();
});

test('Vue conceptuelle toggles from the canvas and shows a pressed state', async ({ page }) => {
  const b = page.locator('#btnConcept');
  await expect(b).toHaveAttribute('aria-pressed', 'false');
  await b.click();
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#world')).toHaveClass(/concept/);
  await b.click();
  await expect(b).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#world')).not.toHaveClass(/concept/);
});

test('Vue conceptuelle is hidden for flow schemas', async ({ page }) => {
  await menu(page, '#btnFile', 'button.mi[data-ex="flow"]');
  if (await page.locator('#exOk').isVisible()) await page.click('#exOk');
  await expect(page.locator('#btnConcept')).toBeHidden();
  await expect(page.locator('#btnLayout')).toBeVisible();
});

test('Réorganiser, Tout afficher, Tout replier, Éditeur work from the canvas', async ({ page }) => {
  await menu(page, '#btnFile', 'button.mi[data-ex="shop"]');
  if (await page.locator('#exOk').isVisible()) await page.click('#exOk');
  await expect(nodes(page).first()).toBeVisible();
  await page.click('#btnLayout');
  await expect(page.locator('#btnCollapseAll')).toHaveText('Tout replier');
  await page.click('#btnCollapseAll');
  await expect(page.locator('#btnCollapseAll')).toHaveText('Tout déplier');
  await page.click('#btnCollapseAll');
  await expect(page.locator('#btnCollapseAll')).toHaveText('Tout replier');
  await page.evaluate(() => window.dbmlStudio.setZoom(0.3));
  const k = () => page.evaluate(() => window.dbmlStudio.zoom);
  expect(await k()).toBeCloseTo(0.3, 1);
  await page.click('#btnFit');
  expect(await k()).not.toBeCloseTo(0.3, 1);
  // editor toggle
  const ed = page.locator('#btnToggleEditor');
  await expect(ed).toHaveAttribute('aria-pressed', 'true');
  await ed.click();
  await expect(page.locator('#editorPane')).toBeHidden();
  await expect(ed).toHaveAttribute('aria-pressed', 'false');
  await ed.click();
  await expect(page.locator('#editorPane')).toBeVisible();
  await expect(ed).toHaveAttribute('aria-pressed', 'true');
});

test('Éléments affichés and Verrouiller open their panels from the canvas, outside click closes them', async ({ page }) => {
  await page.click('#btnDisplayPanel');
  await expect(page.locator('#displayPanel')).toBeVisible();
  await expect(page.locator('#btnDisplayPanel')).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.click(700, 500);
  await expect(page.locator('#displayPanel')).toBeHidden();
  await page.click('#btnLockPanel');
  await expect(page.locator('#lockPanel')).toBeVisible();
  await page.mouse.click(700, 500);
  await expect(page.locator('#lockPanel')).toBeHidden();
});

test('canvas toolbar stays inside the canvas and clickable at 900 and 1024 px', async ({ page }) => {
  for (const width of [900, 1024]) {
    await page.setViewportSize({ width, height: 720 });
    const r = await page.evaluate(() => {
      const cp = document.getElementById('canvasPane').getBoundingClientRect();
      return [...document.querySelectorAll('.toolbar button')].map(b => { const x = b.getBoundingClientRect(); return { id: b.id, ok: x.left >= cp.left && x.right <= cp.right && x.bottom <= cp.bottom && x.width > 0 }; });
    });
    for (const x of r) expect(x.ok, `${x.id} at ${width}px`).toBe(true);
    await page.click('#btnLockPanel');
    await expect(page.locator('#lockPanel')).toBeVisible();
    await page.click('#btnLockPanel');
  }
});

test('Supprimer la sélection is disabled without selection', async ({ page }) => {
  await page.click('#btnEdit');
  await expect(page.locator('#btnDelete')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.locator('#nodesLayer .node.table').first().click();
  await page.click('#btnEdit');
  await expect(page.locator('#btnDelete')).toBeEnabled();
  await page.click('#btnDelete');
  await expect(page.locator('#delModal')).toBeVisible();
});

test('Ctrl+K opens the palette, also from the editor; Escape closes', async ({ page }) => {
  await page.click('#src');
  await page.keyboard.press('Control+k');
  await expect(page.locator('#palette')).toBeVisible();
  await expect(page.locator('#palInput')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#palette')).toBeHidden();
  await expect(page.locator('#src')).toBeFocused();
  await page.click('#btnAide');
  await page.click('#btnPalette');
  await expect(page.locator('#palette')).toBeVisible();
});

test('palette: « concept » filters to Vue conceptuelle and Enter toggles it', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('concept');
  const rows = page.locator('#palList li');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Vue conceptuelle');
  await expect(rows.first()).toContainText('Affichage');
  await page.keyboard.press('Enter');
  await expect(page.locator('#palette')).toBeHidden();
  await expect(page.locator('#world')).toHaveClass(/concept/);
});

test('palette still offers every view and layout command, and runs them', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const expected = { 'Vue conceptuelle': 'Affichage', 'Éléments affichés': 'Affichage', 'Tout afficher': 'Affichage', 'Masquer l’éditeur': 'Affichage',
    'Réorganiser': 'Disposition', 'Tout replier': 'Disposition', 'Verrouiller les positions': 'Disposition' };
  for (const [label, group] of Object.entries(expected)) {
    await page.fill('#palInput', label);
    const row = page.locator('#palList li').first();
    await expect(row, label).toContainText(label);
    await expect(row, label).toContainText(group);
    await expect(row, label).not.toHaveClass(/off/);
  }
  await page.fill('#palInput', 'verrouiller');
  await page.keyboard.press('Enter');
  await expect(page.locator('#lockPanel')).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.fill('#palInput', 'masquer l');
  await page.keyboard.press('Enter');
  await expect(page.locator('#editorPane')).toBeHidden();
  await page.keyboard.press('Control+k');
  await page.fill('#palInput', 'afficher l');
  await expect(page.locator('#palList li').first()).toContainText('Afficher l’éditeur');
  await page.keyboard.press('Enter');
  await expect(page.locator('#editorPane')).toBeVisible();
});

test('palette hides Vue conceptuelle for flow schemas and greys out Tout replier in conceptual view', async ({ page }) => {
  await page.click('#btnConcept');
  await page.keyboard.press('Control+k');
  await page.fill('#palInput', 'replier');
  await expect(page.locator('#palList li').first()).toHaveClass(/off/);
  await page.keyboard.press('Escape');
  await menu(page, '#btnFile', 'button.mi[data-ex="flow"]');
  if (await page.locator('#exOk').isVisible()) await page.click('#exOk');
  await page.keyboard.press('Control+k');
  await page.fill('#palInput', 'conceptuelle');
  await expect(page.locator('#palList')).toContainText('Aucune commande');
});

test('palette search ignores accents and word order', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('cinematique nouveau');
  const rows = page.locator('#palList li');
  await expect(rows.first()).toContainText('Nouveau schéma de cinématique');
  await page.fill('#palInput', 'zzzz');
  await expect(page.locator('#palList')).toContainText('Aucune commande');
});

test('palette: arrows move, disabled commands are dimmed and not runnable', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('supprimer');
  const row = page.locator('#palList li').first();
  await expect(row).toHaveClass(/off/);
  await row.click({ force: true });
  await expect(page.locator('#palette')).toBeVisible();
  await page.fill('#palInput', '');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#palList li.sel')).toHaveAttribute('data-i', '1');
});

test('palette can load an example, with confirmation when the editor was modified', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('boutique');
  await page.keyboard.press('Enter');
  await expect(page.locator('#status')).toHaveClass(/ok/);
  await expect(nodes(page).filter({ hasText: 'order_items' }).first()).toBeAttached();
  // modify the code: the example now requires a confirmation
  await page.fill('#src', 'Table zzz {\n  id integer\n}\n');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('cinematique assurance');
  await page.keyboard.press('Enter');
  await expect(page.locator('#exConfirm')).toBeVisible();
  await page.click('#exOk');
  await expect(page.locator('#src')).toHaveValue(/dwh\.fait_sinistre/);
});

test('help dialog opens from Aide and lists shortcuts; syntax link opens docs in a new tab', async ({ page }) => {
  await menu(page, '#btnAide', '#btnShortcuts');
  const dlg = page.locator('#helpModal');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('Maj + glisser');
  await expect(dlg).toContainText('Palette de commandes');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  const a = page.locator('#lnkSyntax');
  await expect(a).toHaveAttribute('href', 'https://dbml.dbdiagram.io/docs/');
  await expect(a).toHaveAttribute('target', '_blank');
  await expect(a).toHaveAttribute('rel', /noopener/);
});

test('splitter: drag resizes and persists, arrows resize, double-click resets, canvas keeps 240 px', async ({ page }) => {
  const sp = page.locator('#splitter');
  const box = await sp.boundingBox();
  await page.mouse.move(box.x + 3, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 203, box.y + 200, { steps: 5 });
  await page.mouse.up();
  const w = await edW(page);
  expect(w).toBeGreaterThan(box.x + 150);
  await page.reload();
  await expect(page.locator('#status')).toHaveClass(/ok/);
  expect(Math.abs((await edW(page)) - w)).toBeLessThan(2);
  await sp.focus();
  await page.keyboard.press('ArrowLeft');
  expect(Math.abs((await edW(page)) - (w - 24))).toBeLessThan(2);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(Math.abs((await edW(page)) - (w + 24))).toBeLessThan(2);
  // clamp: the canvas keeps at least 240 px
  const vw = page.viewportSize().width;
  for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowRight');
  const canvasW = await page.locator('#canvasPane').evaluate(el => el.getBoundingClientRect().width);
  expect(canvasW).toBeGreaterThanOrEqual(239);
  await page.setViewportSize({ width: 800, height: 700 });
  await expect.poll(() => page.locator('#canvasPane').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(239);
  expect(vw).toBeGreaterThan(800);
  await sp.dblclick();
  await page.setViewportSize({ width: vw, height: 720 });
  expect(Math.abs((await edW(page)) - vw * 0.38)).toBeLessThan(3);
});
