/**
 * Auditoría visual: recorre las pantallas clave y guarda capturas grandes
 * (full page) para revisar layout a ojo. No hace aserciones de negocio —
 * su valor es detectar UI rota (desbordes, contenido pisado, vacíos).
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PASS = 'UiAudit1234!';
const EMAIL = `ui.audit.${Date.now()}@zero.test`;
const DIR = 'test-results/ui-audit';

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

async function shot(page: Page, name: string) {
  fs.mkdirSync(DIR, { recursive: true });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);           // deja asentar datos/SWR
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

test('captura todas las pantallas', async ({ page }) => {
  // Errores de consola por ruta — delatan UI rota que la captura no muestra
  const errores: string[] = [];
  let rutaActual = '';
  const ignorar = /hydrat|devtools|webpack|hmr|favicon|Download the React/i;
  page.on('pageerror', e => errores.push(`[${rutaActual}] ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error' && !ignorar.test(m.text())) {
      errores.push(`[${rutaActual}] ${m.text().slice(0, 300)}`);
    }
  });

  // Alta de negocio nuevo (queda como propietario, con ambos módulos)
  await page.goto(`${BASE}/sign-up`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/sign-up'), { timeout: 30_000 });

  await page.request.post(`${BASE}/api/equipo/perfil`, { data: { posHabilitado: true } });

  const rutas: [string, string][] = [
    ['/dashboard',          '01-dashboard'],
    ['/cuenta',             '02-cuenta-landing'],
    ['/cuenta/usuarios',    '03-cuenta-usuarios'],
    ['/cuenta/roles',       '04-cuenta-roles'],
    ['/cuenta/plan',        '05-cuenta-plan'],
    ['/cuenta/empresas',    '06-cuenta-empresas'],
    ['/cuenta/empresa',     '07-cuenta-empresa'],
    ['/pos',                '08-pos'],
    ['/pos/configuracion',  '09-pos-config'],
    ['/pos/caja',           '10-pos-caja'],
    ['/dashboard/productos','11-productos'],
    ['/dashboard/clientes', '12-contactos'],
  ];

  for (const [ruta, nombre] of rutas) {
    rutaActual = ruta;
    await page.goto(`${BASE}${ruta}`);
    await shot(page, nombre);
    console.log(`✓ ${nombre} → ${page.url()}`);
  }

  if (errores.length) {
    console.log(`\n⚠ ${errores.length} errores de consola:`);
    for (const e of [...new Set(errores)]) console.log('  · ' + e);
  }
  expect(errores, `errores de consola:\n${[...new Set(errores)].join('\n')}`).toEqual([]);
});
