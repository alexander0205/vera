/**
 * Tests E2E — módulos POS/Facturación, auto-provisioning y gate DGII.
 *
 * Cubre el flujo nuevo (F0–F3):
 *  1. /pos y /sin-acceso están protegidos por sesión (proxy).
 *  2. Empresa nueva NO tiene el módulo POS → /pos redirige a /sin-acceso.
 *  3. Al activar el módulo POS (toggle self-service → sync modulosHabilitados),
 *     /pos auto-provisiona "Caja principal" y deja abrir turno sin configurar
 *     almacén/terminal a mano.
 *  4. Gate DGII: empresa sin conexión DGII solo ve "Ticket (sin NCF)" en el
 *     selector de numeración del POS (nada de e31/e32).
 *
 * Requiere la app corriendo en localhost:3000 con DB local (igual que el
 * resto de tests Playwright de este repo).
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const EMAIL = `pos_${Date.now()}@emitedo.test`;
const PASS  = 'TestPass123!';

test.describe.configure({ mode: 'serial' });

// ─── Protección de rutas ──────────────────────────────────────────────────────

test('/pos redirige a sign-in sin sesión', async ({ page }) => {
  await page.goto(`${BASE}/pos`);
  await expect(page).toHaveURL(/sign-in/);
});

// ─── Flujo completo: signup → sin módulo → activar → vender ─────────────────

test('signup: empresa nueva queda con sesión activa', async ({ page }) => {
  await page.goto(`${BASE}/sign-up`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  // El flujo actual da la bienvenida en /pricing?welcome=1
  await page.waitForURL(/pricing\?welcome=1/, { timeout: 20_000 });
  await page.goto(`${BASE}/dashboard`);
  await expect(page).toHaveURL(/dashboard/);
});

test('empresa nueva sin módulo POS: /pos → /sin-acceso', async ({ page }) => {
  // Reusar sesión: sign-in
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20_000 });

  await page.goto(`${BASE}/pos`);
  await expect(page).toHaveURL(/sin-acceso/);
  await expect(page.locator('text=No tienes acceso a este módulo')).toBeVisible();
  // Facturación sí está disponible como salida
  await expect(page.locator('text=Ir a Facturación')).toBeVisible();
});

test('activar módulo POS → auto-provisioning y apertura de turno', async ({ page }) => {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20_000 });

  // Activa el módulo POS vía el endpoint self-service del perfil (mismo que
  // usa el switch de Configuración; sincroniza modulosHabilitados).
  const res = await page.request.post(`${BASE}/api/equipo/perfil`, {
    data: { posHabilitado: true },
  });
  expect(res.ok()).toBeTruthy();

  // /pos ya no redirige: auto-provisiona almacén+terminal y muestra apertura.
  await page.goto(`${BASE}/pos`);
  await expect(page).toHaveURL(/\/pos/);
  await expect(page.locator('text=Abrir turno de caja')).toBeVisible();
  // Terminal default creada por ensurePosDefaults:
  await expect(page.locator('text=Caja principal')).toBeVisible();

  // Abrir turno (fondo 0) y llegar a la pantalla de venta.
  await page.click('text=Abrir turno y empezar a vender');
  await expect(page.locator('input[placeholder*="Buscar o escanear"]')).toBeVisible({ timeout: 15_000 });
});

test('gate DGII: sin conexión solo aparece Ticket (sin NCF)', async ({ page }) => {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20_000 });

  // readiness debe reportar NO listo para una empresa recién creada.
  const readiness = await page.request.get(`${BASE}/api/ecf/readiness`);
  expect(readiness.ok()).toBeTruthy();
  const body = await readiness.json();
  expect(body.ready).toBe(false);

  // En el POS, el selector de numeración solo ofrece el ticket sin NCF.
  await page.goto(`${BASE}/pos`);
  await expect(page.locator('input[placeholder*="Buscar o escanear"]')).toBeVisible({ timeout: 15_000 });
  // Abre el dropdown de numeración del carrito.
  const numeracion = page.locator('label:has-text("Numeración")');
  await expect(numeracion).toBeVisible();
  await numeracion.locator('..').locator('[role="combobox"]').click();
  await expect(page.locator('li[role="option"]:has-text("Ticket (sin NCF)")')).toBeVisible();
  await expect(page.locator('li[role="option"]:has-text("e32")')).toHaveCount(0);
  await expect(page.locator('li[role="option"]:has-text("e31")')).toHaveCount(0);
});

test('venta simple: tile visible en el catálogo del POS', async ({ page }) => {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20_000 });

  await page.goto(`${BASE}/pos`);
  await expect(page.locator('text=Venta simple').first()).toBeVisible({ timeout: 15_000 });
});
