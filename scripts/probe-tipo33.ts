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
  await page.waitForTimeout(500);

  const combos = page.locator('[role="combobox"]');
  console.log('total combos:', await combos.count());
  for (let i = 0; i < await combos.count(); i++) {
    console.log(`  [${i}]:`, (await combos.nth(i).innerText().catch(()=>'?')).slice(0,60));
  }

  await combos.nth(0).click({ force: true });
  await page.waitForTimeout(400);

  const opts = await page.getByRole('option').allInnerTexts();
  console.log('opts after cat click:', opts);

  await page.getByRole('option', { name: /Nota de débito/i }).first().click({ force: true });
  await page.waitForTimeout(1000);

  // Re-check combos after change
  console.log('\nAfter category change:');
  for (let i = 0; i < await combos.count(); i++) {
    console.log(`  combo[${i}]:`, (await combos.nth(i).innerText().catch(()=>'?')).slice(0,80));
  }

  const body = await page.locator('body').innerHTML();
  console.log('\nhas placeholder E310000000001:', /E310000000001/.test(body));
  console.log('has "que se modifica":', /que se modifica/i.test(body));
  console.log('has "ódigo de modificación":', /ódigo de modificaci/i.test(body));
  console.log('has tag "e33":', /\be33\b/i.test(body));
  console.log('has "Nota de débito":', /Nota de débito/i.test(body));
  console.log('Inputs placeholder E31*:', await page.locator('input[placeholder^="E31"]').count());

  await page.screenshot({ path: '/tmp/probe-33.png', fullPage: true });
  await browser.close();
})();
