/**
 * E2E robusto — usa Radix Select via getByRole + force-click si necesario.
 * Cambia categoría → cambia tipo → verifica campos condicionales.
 */
import { chromium, type Browser, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3002';
const EMAIL = 'alexander.ferreras@yisraeltech.com';
const PASSWORD = 'Admin1234!';

interface R { tipo: string; step: string; ok: boolean; detail?: string; }
const results: R[] = [];
function rec(tipo: string, step: string, ok: boolean, detail?: string) {
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${tipo} ${step}${detail ? ` — ${detail}` : ''}`);
  results.push({ tipo, step, ok, detail });
}

async function login(page: Page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|admin|lite)/, { timeout: 15000 }).catch(() => null);
}

async function gotoNueva(page: Page) {
  await page.goto(`${BASE}/dashboard/facturas/nueva`, { waitUntil: 'networkidle' });
  await page.waitForSelector('form', { timeout: 10000 });
  await page.waitForTimeout(600);
}

/**
 * Select category by visible label, then select tipo.
 * categoryLabel: "Nota de débito" | "Nota de crédito" | "Factura de venta" | etc
 * tipoCode: '31', '32', '33', '34', etc.
 */
async function setCategoryAndTipo(page: Page, categoryLabel: string, tipoCode: string): Promise<boolean> {
  // 1st combobox = category, 2nd = tipo
  const combos = page.locator('[role="combobox"]');
  const total = await combos.count();
  if (total < 2) {
    console.log(`    only ${total} comboboxes found`);
    return false;
  }

  // Click category combobox (1st with categoria-like text)
  const catCombo = combos.nth(0);
  await catCombo.click({ force: true }).catch(() => null);
  await page.waitForTimeout(250);
  // Select option by name
  const catOpt = page.getByRole('option', { name: new RegExp(categoryLabel, 'i') });
  if (await catOpt.count() === 0) {
    console.log(`    category option "${categoryLabel}" not found`);
    return false;
  }
  await catOpt.first().click({ force: true });
  await page.waitForTimeout(400);

  // Tipo combobox might collapse to single option (auto-selected). Verify state.
  // Look for any element showing "e{tipoCode}" or similar after change.
  const html = await page.content();
  if (new RegExp(`\\be${tipoCode}\\b`, 'i').test(html)) {
    return true;
  }
  // If not visible, try clicking 2nd combobox and selecting
  const tipoCombo = combos.nth(1);
  await tipoCombo.click({ force: true }).catch(() => null);
  await page.waitForTimeout(250);
  const tipoOpt = page.getByRole('option', { name: new RegExp(`e${tipoCode}`, 'i') });
  if (await tipoOpt.count() > 0) {
    await tipoOpt.first().click({ force: true });
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

async function snapshot(page: Page, label: string) {
  const screenshotPath = `/tmp/e2e-form-${label}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return screenshotPath;
}

async function main() {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    console.log('=== Login ===');
    await login(page);
    rec('-', 'login', /\/(dashboard|admin|lite)/.test(page.url()), page.url());

    console.log('\n=== Test 1: default form is tipo 31 (Crédito fiscal) ===');
    await gotoNueva(page);
    const htmlDef = await page.content();
    await snapshot(page, 'default');
    rec('e31', 'form loads', /<form/i.test(htmlDef));
    rec('e31', 'shows e31 default', /\be31\b/i.test(htmlDef));
    rec('e31', 'tipoIngresos field visible', /tipo\s+de\s+ingreso|TipoIngresos/i.test(htmlDef));
    rec('e31', 'no ncfModificado for 31', !/ncfModificado|ncf\s+que\s+se\s+modifica/i.test(htmlDef));

    console.log('\n=== Test 2: change category → "Nota de crédito" (tipo 34) ===');
    await gotoNueva(page);
    const ok34 = await setCategoryAndTipo(page, 'Nota de crédito', '34');
    rec('e34', 'category change OK', ok34);
    if (ok34) {
      await page.waitForTimeout(500);
      const html34 = await page.content();
      await snapshot(page, '34');
      rec('e34', 'shows e34 tag in form', /\be34\b/i.test(html34));
      rec('e34', 'ncfModificado field shown', /ncf\s+que\s+se\s+modifica|name="ncfModificado"|placeholder="E31\d/i.test(html34));
      rec('e34', 'codigoModificacion shown', /c[óo]digo\s+de\s+modificaci/i.test(html34));
      rec('e34', 'fechaNcfModificado shown', /fecha\s+del\s+e-?ncf|fechaNcfModificado/i.test(html34));
    }

    console.log('\n=== Test 3: change to "Nota de débito" (tipo 33) ===');
    await gotoNueva(page);
    const ok33 = await setCategoryAndTipo(page, 'Nota de débito', '33');
    rec('e33', 'category change OK', ok33);
    if (ok33) {
      await page.waitForTimeout(500);
      const html33 = await page.content();
      await snapshot(page, '33');
      rec('e33', 'shows e33 tag', /\be33\b/i.test(html33));
      rec('e33', 'ncfModificado shown', /ncf\s+que\s+se\s+modifica|placeholder="E31\d/i.test(html33));
      rec('e33', 'codigoModificacion shown', /c[óo]digo\s+de\s+modificaci/i.test(html33));
    }

    console.log('\n=== Test 4: change to "Factura de venta" → tipo 32 (Consumo) ===');
    await gotoNueva(page);
    const ok32 = await setCategoryAndTipo(page, 'Factura de venta', '32');
    rec('e32', 'change to e32', ok32);
    if (ok32) {
      const html32 = await page.content();
      await snapshot(page, '32');
      rec('e32', 'shows e32', /\be32\b/i.test(html32));
      rec('e32', 'no codigoModificacion (only nota)', !/c[óo]digo\s+de\s+modificaci/i.test(html32));
    }

    console.log('\n=== Test 5: tipoPago=2 (Crédito) should show fechaLimitePago ===');
    // From default state (tipo 31), select tipoPago=Crédito and verify fechaLimitePago appears
    await gotoNueva(page);
    // Find plazo selector — has "Contado", "Crédito" options
    const plazoSel = page.locator('button, [role="combobox"]').filter({ hasText: /contado|plazo/i }).first();
    if (await plazoSel.count() > 0) {
      await plazoSel.click({ force: true }).catch(() => null);
      await page.waitForTimeout(300);
      const credOpt = page.getByRole('option', { name: /crédito|credito|30\s+d[íi]as/i });
      if (await credOpt.count() > 0) {
        await credOpt.first().click({ force: true });
        await page.waitForTimeout(400);
        const htmlCred = await page.content();
        await snapshot(page, 'tipopago2');
        rec('e31', 'fechaLimitePago appears with credito', /vencimiento/i.test(htmlCred));
      } else {
        rec('e31', 'crédito option found', false);
      }
    } else {
      rec('e31', 'plazo selector found', false);
    }

    console.log('\n=== Summary ===');
    const pass = results.filter(r => r.ok).length;
    const fail = results.filter(r => !r.ok).length;
    console.log(`Pass: ${pass} | Fail: ${fail}`);
    if (fail > 0) {
      console.log('\nFailures:');
      for (const r of results.filter(x => !x.ok)) console.log(`  ✗ ${r.tipo} ${r.step}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    console.log('\nScreenshots in /tmp/e2e-form-*.png');
  } catch (e) {
    console.error('FATAL', e instanceof Error ? e.message : e);
  } finally {
    await browser?.close();
  }
}

main();
