// Open a top-level menu (by its button id), then click one of its items.
async function menu(page, buttonId, itemSelector) {
  await page.click(buttonId);
  if (itemSelector) await page.click(itemSelector);
}
module.exports = { menu };
