// Browser walkthrough: BASE_URL=http://localhost:3000 SHOTS=/some/dir node scripts/e2e.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const shots = process.env.SHOTS;
const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const dialogs = [];
page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base);
await page.getByLabel('Zutat hinzufügen').fill('Tomate');
await page.keyboard.press('Enter');
await page.getByLabel('Zutat hinzufügen').fill('zwiebel, nudeln, ');
await page.getByLabel('Zutat hinzufügen').fill('<img src=x onerror=alert(1)>');
await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Weiter zu den Geräten' }).click();
await page.getByLabel('Stabmixer').check();
await shot(page, '1-geraete-mobil');
await page.getByRole('button', { name: 'Rezepte suchen' }).click();
await page.waitForFunction(() => /gefunden|Keine passenden|nicht erreichbar/.test(document.getElementById('status').textContent), null, { timeout: 40000 });
const status = await page.locator('#status').textContent();
console.log('Status:', status);
console.log('Quellen:', await page.locator('#sources li').allTextContents());
const cards = await page.locator('#results article').count();
console.log('Karten:', cards);
assert.ok(cards >= 1, 'mindestens ein Rezept erwartet');
await shot(page, '2-ergebnisse-mobil');

// favorite survives reload
await page.locator('.heart').first().click();
await page.reload();
assert.equal((await page.locator('#favorites-count').textContent()).trim(), '1');
assert.equal(await page.locator('#ingredient-list li').count(), 4);
await page.getByRole('button', { name: /Merkliste/ }).click();
assert.equal(await page.locator('#favorites-list article').count(), 1);

// dark mode
await page.getByRole('button', { name: 'Merkliste' }).click().catch(() => {});
await page.getByRole('button', { name: /Dunkel|dunklen/ }).click();
assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
await page.getByRole('button', { name: 'Rezepte', exact: false }).filter({ hasText: '3' }).click().catch(() => {});
await shot(page, '3-dunkel-mobil');

// desktop
await page.setViewportSize({ width: 1280, height: 900 });
await shot(page, '4-desktop');

assert.deepEqual(dialogs, [], 'XSS: kein Dialog darf aufgehen');
assert.deepEqual(errors.filter((e) => !/403|Failed to load resource/.test(e)), [], 'keine Konsolenfehler');
await browser.close();
console.log('E2E ok');
