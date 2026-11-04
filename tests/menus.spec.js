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

test('six top-level menus in order', async ({ page }) => {
  const labels = await page.locator('#menubar > .menu-wrap > button').allTextContents();
  expect(labels).toEqual(['Fichier', 'Édition', 'Affichage', 'Disposition', 'Exporter', 'Aide']);
  await expect(page.locator('#btnExamples')).toHaveCount(0);
  await expect(page.locator('#btnHelp')).toHaveCount(0);
});

test('hovering another menu while one is open switches to it; Escape closes', async ({ page }) => {
  await page.click('#btnFile');
  await expect(page.locator('#fileMenu')).toBeVisible();
  await page.hover('#btnView');
  await expect(page.locator('#fileMenu')).toBeHidden();
  await expect(page.locator('#viewMenu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#viewMenu')).toBeHidden();
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

test('bottom toolbar only has zoom controls', async ({ page }) => {
  const ids = await page.locator('.toolbar button').evaluateAll(bs => bs.map(b => b.id));
  expect(ids).toEqual(['zOut', 'zIn', 'zFit']);
  await expect(page.locator('#zPct')).toBeVisible();
  await expect(page.locator('.toolbar')).not.toContainText('Réorganiser');
});

test('Vue conceptuelle toggles from the Affichage menu and shows a check state', async ({ page }) => {
  // the default document is a model schema: the item is available
  await page.click('#btnView');
  await expect(page.locator('#btnConcept')).toHaveAttribute('aria-checked', /true|false/);
  const before = await page.locator('#btnConcept').getAttribute('aria-checked');
  await page.click('#btnConcept');
  await page.click('#btnView');
  expect(await page.locator('#btnConcept').getAttribute('aria-checked')).not.toBe(before);
  await page.keyboard.press('Escape');
});

test('Vue conceptuelle is hidden for flow schemas', async ({ page }) => {
  await menu(page, '#btnFile', 'button.mi[data-ex="flow"]');
  if (await page.locator('#exOk').isVisible()) await page.click('#exOk');
  await page.click('#btnView');
  await expect(page.locator('#btnConcept')).toBeHidden();
});

test('Réorganiser, Tout afficher, Tout replier work from their menus', async ({ page }) => {
  await menu(page, '#btnFile', 'button.mi[data-ex="shop"]');
  if (await page.locator('#exOk').isVisible()) await page.click('#exOk');
  await expect(nodes(page).first()).toBeVisible();
  await menu(page, '#btnDispo', '#btnLayout');
  await expect(page.locator('#layoutMenu')).toBeHidden();
  await page.click('#btnDispo');
  await expect(page.locator('#btnCollapseAll')).toHaveText('Tout replier');
  await page.click('#btnCollapseAll');
  await page.click('#btnDispo');
  await expect(page.locator('#btnCollapseAll')).toHaveText('Tout déplier');
  await page.keyboard.press('Escape');
  await menu(page, '#btnView', '#btnFit');
  await page.click('#zFit');
});

test('Éléments affichés and Verrouiller open their panels, outside click closes them', async ({ page }) => {
  await menu(page, '#btnView', '#btnDisplayPanel');
  await expect(page.locator('#displayPanel')).toBeVisible();
  await page.mouse.click(700, 500);
  await expect(page.locator('#displayPanel')).toBeHidden();
  await menu(page, '#btnDispo', '#btnLockPanel');
  await expect(page.locator('#lockPanel')).toBeVisible();
  await page.mouse.click(700, 500);
  await expect(page.locator('#lockPanel')).toBeHidden();
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
