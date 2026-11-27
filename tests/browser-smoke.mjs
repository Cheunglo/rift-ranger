import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firefox } from 'playwright';

const localOrigin = 'http://ranger.test';
const url = process.env.RANGER_TEST_URL || localOrigin;
const types = { html: 'text/html', css: 'text/css', mjs: 'text/javascript', svg: 'image/svg+xml' };
let browser;

before(async () => { browser = await firefox.launch(); });
after(async () => { await browser?.close(); });

async function openGame(t, options) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    await page.close();
    assert.deepEqual(errors, []);
  });
  // Serve the real modules directly to the browser with no external web server.
  if (!process.env.RANGER_TEST_URL) {
    await page.route(localOrigin + '/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const name = pathname === '/' ? 'index.html' : pathname.slice(1);
      const match = /^[\w-]+\.(html|css|mjs|svg)$/.exec(name);
      if (!match) return route.fulfill({ status: 404 });
      const body = await readFile(new URL('../' + name, import.meta.url));
      return route.fulfill({ contentType: types[match[1]], body });
    });
  }
  await page.goto(url);
  return page;
}

test('desktop controls use Space and display combat HP from round state', { timeout: 20000 }, async t => {
  const page = await openGame(t, { viewport: { width: 1280, height: 620 } });
  await page.locator('#keyboard').click();
  assert(await page.locator('#mobile-controls').isHidden());
  await page.locator('#warning-toggle').focus();
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => document.querySelector('#arena').dataset.auraStage === '1');
  await page.keyboard.up('Space');
  assert.equal(await page.evaluate(() => window.scrollY), scrollY);
  assert.equal(await page.locator('#warning-toggle').getAttribute('aria-expanded'), 'true');
  // Changing the bar does not change the opponent's combat HP.
  await page.locator('#enemy').evaluate(bar => { bar.value = 10; });
  await page.keyboard.press('j');
  assert(Number(await page.locator('#enemy').getAttribute('value')) > 80);
  assert.equal(await page.locator('#arena').getAttribute('data-aura-stage'), '0');
  await page.keyboard.press('k');
  assert(Number(await page.locator('#enemy').getAttribute('value')) < 94);
  await page.locator('#exit').click();
  assert(await page.locator('#overlay').isVisible());
  assert.equal(await page.locator('#enemy').getAttribute('value'), '100');
});

test('mobile tutorial shows touch instructions and advances on Slash', { timeout: 20000 }, async t => {
  const page = await openGame(t, { viewport: { width: 360, height: 640 }, hasTouch: true });
  await page.locator('#tutorial').click();
  await page.locator('#mobile').click();
  assert.match(await page.locator('#tutorial-instruction').textContent(), /Tap Slash/);
  assert.equal(await page.locator('#mobile-controls button').count(), 5);
  await page.locator('[data-action="basic"]').tap();
  await page.waitForFunction(() => document.querySelector('#tutorial-title').textContent === 'Block the laser');
  assert.match(await page.locator('#tutorial-instruction').textContent(), /hold Block/);
});
