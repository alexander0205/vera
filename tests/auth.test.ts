/**
 * Tests E2E del flujo de autenticación de EmiteDO
 * Prueba: sign-up, sign-in, acceso al dashboard, logout
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const TEST_EMAIL = `test_${Date.now()}@emitedo.test`;
const TEST_PASS = 'TestPass123!';

// ─── Landing page ─────────────────────────────────────────────────────────────
test('landing page carga con branding Zero', async ({ page }) => {
  await page.goto(BASE);
  await expect(page).toHaveTitle(/Zero/);
  await expect(page.locator('text=Zero').first()).toBeVisible();
  await expect(page.locator('text=DGII').first()).toBeVisible();
  await expect(page.locator('text=e-CF').first()).toBeVisible();
});

// ─── Pricing page ─────────────────────────────────────────────────────────────
test('pricing page muestra los 4 planes', async ({ page }) => {
  await page.goto(`${BASE}/pricing`);
  // Planes actuales de lib/config/plans.ts
  await expect(page.getByText('Starter').first()).toBeVisible();
  await expect(page.getByText('Invoice').first()).toBeVisible();
  await expect(page.getByText('Business').first()).toBeVisible();
  await expect(page.getByText('Pro').first()).toBeVisible();
});

// ─── Rutas protegidas ─────────────────────────────────────────────────────────
test('dashboard redirige a sign-in sin sesión', async ({ page }) => {
  await page.goto(`${BASE}/dashboard`);
  await expect(page).toHaveURL(/sign-in/);
});

// ─── Sign-up ──────────────────────────────────────────────────────────────────
test('sign-up crea cuenta nueva (bienvenida en pricing) y sesión válida', async ({ page }) => {
  await page.goto(`${BASE}/sign-up`);

  // Llenar el formulario
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASS);

  // Submit — el flujo actual da la bienvenida en /pricing?welcome=1
  await Promise.all([
    page.waitForURL(/pricing\?welcome=1/, { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  // La sesión quedó creada: el dashboard es accesible directamente
  await page.goto(`${BASE}/dashboard`);
  await expect(page).toHaveURL(/dashboard/);
  console.log(`✓ Sign-up exitoso: ${TEST_EMAIL}`);
});

// ─── Dashboard accesible post-auth ────────────────────────────────────────────
test('dashboard carga correctamente con sesión activa', async ({ page }) => {
  // Sign-in primero
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', 'owner@emitedo.test');
  await page.fill('input[name="password"]', 'Admin1234!');

  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  await expect(page).toHaveURL(/dashboard/);

  // Verificar que el dashboard tiene contenido
  const body = await page.textContent('body');
  expect(body).toBeTruthy();
  console.log('✓ Dashboard accesible después de sign-in');
});

// ─── Sign-in con credenciales del seed ────────────────────────────────────────
test('sign-in con credenciales de prueba funciona', async ({ page }) => {
  await page.goto(`${BASE}/sign-in`);

  await page.fill('input[name="email"]', 'owner@emitedo.test');
  await page.fill('input[name="password"]', 'Admin1234!');

  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  await expect(page).toHaveURL(/dashboard/);
  console.log('✓ Sign-in con admin@emitedo.test exitoso');
});

// ─── Sign-in con credenciales incorrectas ────────────────────────────────────
test('sign-in muestra error con contraseña incorrecta', async ({ page }) => {
  await page.goto(`${BASE}/sign-in`);

  await page.fill('input[name="email"]', 'owner@emitedo.test');
  await page.fill('input[name="password"]', 'ContraseñaMal123!');
  await page.click('button[type="submit"]');

  // Esperar el mensaje de error (Alert MUI, no redirect). Filtrar por texto:
  // Next agrega un route-announcer con role=alert que rompe el strict mode.
  const alert = page.getByRole('alert').filter({ hasText: 'Invalid' });
  await expect(alert).toBeVisible({ timeout: 5000 });
  console.log('✓ Error de credenciales mostrado correctamente');
});

// ─── Logout ───────────────────────────────────────────────────────────────────
test('logout cierra sesión y redirige al home', async ({ page }) => {
  // Login primero
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', 'owner@emitedo.test');
  await page.fill('input[name="password"]', 'Admin1234!');

  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  await expect(page).toHaveURL(/dashboard/);

  // Abrir el menú de usuario (avatar MUI en el header) y cerrar sesión
  await page.locator('header button:has(.MuiAvatar-root), button:has(.MuiAvatar-root)').last().click();
  await page.getByText('Cerrar sesión').click();

  // Esperar a que la cookie se borre
  await page.waitForTimeout(500);

  // Después del logout, /dashboard debe redirigir a sign-in
  await page.goto(`${BASE}/dashboard`);
  await expect(page).toHaveURL(/sign-in/);
  console.log('✓ Logout funciona correctamente');
});
