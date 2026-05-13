import { chromium } from '@playwright/test';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3002/sign-in');
  await page.fill('input[name="email"]', 'alexander.ferreras@yisraeltech.com');
  await page.fill('input[name="password"]', 'Admin1234!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|admin/);
  await page.goto('http://localhost:3002/dashboard/facturas/nueva', { waitUntil: 'networkidle' });
  await page.waitForSelector('form');
  await page.waitForTimeout(800);

  // 1) Click "Nota de débito" categoria
  await page.locator('[role="combobox"]').nth(0).click({ force: true });
  await page.waitForTimeout(300);
  await page.getByRole('option', { name: /Nota de débito/i }).first().click({ force: true });
  await page.waitForTimeout(1500);

  // 2) Now manually click 2nd combo and inspect
  const combos = page.locator('[role="combobox"]');
  console.log('combo[0]:', await combos.nth(0).innerText());
  console.log('combo[1]:', await combos.nth(1).innerText());

  // 3) Click 2nd combo (tipo)
  await combos.nth(1).click({ force: true });
  await page.waitForTimeout(300);
  const tipoOpts = await page.getByRole('option').allInnerTexts();
  console.log('tipo opts:', tipoOpts);

  // 4) Click "e33" option explicitly
  const e33Opt = page.getByRole('option', { name: /e33/i });
  if (await e33Opt.count() > 0) {
    await e33Opt.first().click({ force: true });
    await page.waitForTimeout(800);
    console.log('after e33 click:');
    console.log('  combo[1]:', await combos.nth(1).innerText());
    const body = await page.locator('body').innerHTML();
    console.log('  has placeholder E31:', /placeholder="E31\d/.test(body) ? 'YES' : 'NO');
    console.log('  has "que se modifica":', /que se modifica/i.test(body));
    console.log('  Input count w/ placeholder E31*:', await page.locator('input[placeholder^="E31"]').count());
  } else {
    console.log('e33 option not found! All opts:', tipoOpts);
  }

  await browser.close();
})();
