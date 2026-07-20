/**
 * Tests E2E del dashboard y páginas principales (post-migración MUI).
 * Login con owner@emitedo.test (usuario normal — el platform admin redirige a /admin).
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// Helper: login con el usuario owner del seed
async function login(page: Page) {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', 'owner@emitedo.test');
  await page.fill('input[name="password"]', 'Admin1234!');
  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

// ─── Dashboard home ───────────────────────────────────────────────────────────
test('dashboard home carga con stats', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/dashboard/);

  // Stats cards actuales (app/(dashboard)/dashboard/page.tsx).
  // Scope a <main>: el rail lateral tiene labels con el mismo texto ocultos
  // mientras está colapsado, y sin acotar el locator los matchea a ellos.
  const contenido = page.getByRole('main');
  await expect(contenido.getByText('Ingresos del mes')).toBeVisible();
  await expect(contenido.getByText('Total histórico')).toBeVisible();
  await expect(contenido.getByText('Secuencias', { exact: true }).first()).toBeVisible();

  // Botón Nueva Factura
  await expect(contenido.getByRole('link', { name: /Nueva Factura/i }).first()).toBeVisible();
  console.log('✓ Dashboard home con stats carga correctamente');
});

// ─── Navegación a páginas principales ────────────────────────────────────────
test('página facturas de venta carga', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/facturas`);
  await expect(page).toHaveURL(/dashboard\/facturas/);
  console.log('✓ Navegación a Facturas funciona');
});

test('página clientes carga', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/clientes`);
  await expect(page).toHaveURL(/dashboard\/clientes/);
  await expect(page.getByText(/cliente/i).first()).toBeVisible({ timeout: 10000 });
  console.log('✓ Navegación a Clientes funciona');
});

test('página secuencias muestra tipos del seed', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/secuencias`);
  await expect(page).toHaveURL(/dashboard\/secuencias/);
  await expect(page.getByText(/31/).first()).toBeVisible({ timeout: 10000 });
  console.log('✓ Página Secuencias muestra tipos del seed');
});

test('página certificado digital carga', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/certificado`);
  await expect(page).toHaveURL(/dashboard\/certificado/);
  await expect(page.getByText(/certificado/i).first()).toBeVisible({ timeout: 10000 });
  console.log('✓ Página Certificado carga correctamente');
});

// ─── Nueva Factura ────────────────────────────────────────────────────────────
test('página Nueva Factura carga el formulario', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/facturas/nueva`);
  await expect(page).toHaveURL(/facturas\/nueva/);

  const submitBtn = page.getByRole('button', { name: /emitir|guardar/i }).first();
  await expect(submitBtn).toBeVisible({ timeout: 15000 });
  console.log('✓ Formulario Nueva Factura carga correctamente');
});

// ─── Gate DGII (F3): readiness ────────────────────────────────────────────────
test('gate DGII: readiness reporta no-listo sin registro ecf-api', async ({ page }) => {
  await login(page);

  // El seed tiene secuencias 31/32 pero NO ecfCodigoPublico → readiness false.
  const readiness = await page.request.get(`${BASE}/api/ecf/readiness`);
  expect(readiness.ok()).toBeTruthy();
  const r = await readiness.json();
  expect(r.ready).toBe(false);
  expect(r.secuenciaFiscalActiva).toBe(true);   // hay secuencias…
  expect(r.registradaEcfApi).toBe(false);       // …pero no registro en ecf-api
  console.log('✓ Readiness DGII reporta no-listo por falta de registro ecf-api');
});

// ─── API de emisión: enforcement server-side del gate DGII ───────────────────
test('API /api/ecf/emitir rechaza 422 tipo fiscal sin DGII lista', async ({ page }) => {
  await login(page);

  const res = await page.evaluate(async () => {
    const r = await fetch('/api/ecf/emitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipoEcf: '32',
        tipoPago: 1,
        razonSocialComprador: 'Consumidor Final',
        items: [{ nombreItem: 'Test', cantidadItem: 1, precioUnitarioItem: 100, tasaItbis: 0.18, indicadorBienoServicio: 1 }],
      }),
    });
    return { status: r.status, body: await r.json() };
  });

  expect(res.status).toBe(422);
  expect(res.body.code ?? res.body.error).toBeDefined();
  console.log('✓ API rechaza emisión fiscal sin DGII lista:', res.body.code ?? res.body.error);
});
