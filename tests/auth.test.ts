/**
 * Tests E2E del flujo de autenticación de EmiteDO
 * Prueba: sign-up, sign-in, acceso al dashboard, logout
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';
const TEST_EMAIL = `test_${Date.now()}@emitedo.test`;
const TEST_PASS = 'TestPass123!';

// ─── Landing page ─────────────────────────────────────────────────────────────
test('landing page carga con branding EmiteDO', async ({ page }) => {
  await page.goto(BASE);
  await expect(page).toHaveTitle(/EmiteDO/);
  await expect(page.locator('text=EmiteDO').first()).toBeVisible();
  await expect(page.locator('text=Ley 32-23').first()).toBeVisible();
  await expect(page.locator('text=DGII').first()).toBeVisible();
  await expect(page.locator('text=e-CF').first()).toBeVisible();
});

// ─── Pricing page ─────────────────────────────────────────────────────────────
test('pricing page muestra los 4 planes en DOP', async ({ page }) => {
  await page.goto(`${BASE}/pricing`);
  // Verificar los headings de los planes (h2)
  await expect(page.getByRole('heading', { name: 'Gratis' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Básico' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pro' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Business' })).toBeVisible();
  await expect(page.locator('text=DOP').first()).toBeVisible();
});

// ─── Rutas protegidas ─────────────────────────────────────────────────────────
test('dashboard redirige a sign-in sin sesión', async ({ page }) => {
  await page.goto(`${BASE}/dashboard`);
  await expect(page).toHaveURL(/sign-in/);
});

// ─── Sign-up ──────────────────────────────────────────────────────────────────
test('sign-up crea cuenta nueva y redirige al dashboard', async ({ page }) => {
  await page.goto(`${BASE}/sign-up`);

  // Llenar el formulario
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASS);

  // Submit y esperar redirect
  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  // Verificar que estamos en el dashboard
  await expect(page).toHaveURL(/dashboard/);
  console.log(`✓ Sign-up exitoso: ${TEST_EMAIL}`);
});

// ─── Dashboard accesible post-auth ────────────────────────────────────────────
test('dashboard carga correctamente con sesión activa', async ({ page }) => {
  // Sign-in primero
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', 'admin@emitedo.test');
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

  await page.fill('input[name="email"]', 'admin@emitedo.test');
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

  await page.fill('input[name="email"]', 'admin@emitedo.test');
  await page.fill('input[name="password"]', 'ContraseñaMal123!');
  await page.click('button[type="submit"]');

  // Esperar el mensaje de error (no redirect)
  await page.waitForSelector('.text-red-500', { timeout: 5000 });
  const errorText = await page.textContent('.text-red-500');
  expect(errorText).toContain('Invalid');
  console.log('✓ Error de credenciales mostrado correctamente:', errorText);
});

// ─── Logout ───────────────────────────────────────────────────────────────────
test('logout cierra sesión y redirige al home', async ({ page }) => {
  // Login primero
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', 'admin@emitedo.test');
  await page.fill('input[name="password"]', 'Admin1234!');

  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  await expect(page).toHaveURL(/dashboard/);

  // Abrir el menú de usuario (avatar en el header)
  await page.locator('button[aria-haspopup]').first().click();
  // Click en "Sign out" en el dropdown
  await page.getByText('Sign out').click();

  // Esperar a que la cookie se borre
  await page.waitForTimeout(500);

  // Después del logout, /dashboard debe redirigir a sign-in
  await page.goto(`${BASE}/dashboard`);
  await expect(page).toHaveURL(/sign-in/);
  console.log('✓ Logout funciona correctamente');
});
