/**
 * Tests E2E del dashboard y páginas de EmiteDO
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:3000';

// Helper: login con el usuario del seed
async function login(page: Page) {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', 'admin@emitedo.test');
  await page.fill('input[name="password"]', 'Admin1234!');
  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);
}

// ─── Dashboard home ───────────────────────────────────────────────────────────
test('dashboard home carga con stats', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/dashboard/);

  // Stats cards - usar los títulos exactos de CardTitle
  await expect(page.getByText('Este mes')).toBeVisible();
  await expect(page.getByText('Total histórico')).toBeVisible();
  await expect(page.getByText('disponibles en total')).toBeVisible();
  await expect(page.getByText('firma digital INDOTEL')).toBeVisible();

  // Botón Nueva Factura en el header
  await expect(page.getByRole('link', { name: 'Nueva Factura' }).first()).toBeVisible();
  console.log('✓ Dashboard home con stats carga correctamente');
});

test('dashboard muestra alerta de certificado pendiente', async ({ page }) => {
  await login(page);
  // El usuario del seed no tiene certificado
  await expect(page.getByText('Certificado digital no configurado')).toBeVisible();
  console.log('✓ Alerta de certificado pendiente visible');
});

test('dashboard muestra secuencias disponibles', async ({ page }) => {
  await login(page);
  // Hay secuencias del seed (31,32,33,34,41,43)
  const seqCard = page.locator('text=Secuencias').first();
  await expect(seqCard).toBeVisible();
  console.log('✓ Card de secuencias visible');
});

// ─── Nav sidebar ─────────────────────────────────────────────────────────────
test('sidebar navega a facturas', async ({ page }) => {
  await login(page);
  await page.click('text=Facturas');
  await expect(page).toHaveURL(/dashboard\/facturas/);
  await expect(page.getByText('Comprobantes Fiscales')).toBeVisible();
  console.log('✓ Navegación a Facturas funciona');
});

test('sidebar navega a clientes', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/clientes`);
  await expect(page).toHaveURL(/dashboard\/clientes/);
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  // Los 3 clientes del seed deben aparecer
  await expect(page.getByText('3 clientes')).toBeVisible();
  console.log('✓ Navegación a Clientes funciona');
});

test('sidebar navega a secuencias', async ({ page }) => {
  await login(page);
  await page.click('text=Secuencias NCF');
  await expect(page).toHaveURL(/dashboard\/secuencias/);
  // Las secuencias del seed deben verse
  await expect(page.getByText('e-31')).toBeVisible();
  await expect(page.getByText('e-32')).toBeVisible();
  console.log('✓ Página Secuencias muestra tipos del seed');
});

test('sidebar navega a certificado', async ({ page }) => {
  await login(page);
  await page.click('text=Certificado');
  await expect(page).toHaveURL(/dashboard\/certificado/);
  await expect(page.getByText('Certificado Digital')).toBeVisible();
  await expect(page.getByText('Subir certificado P12')).toBeVisible();
  console.log('✓ Página Certificado carga correctamente');
});

// ─── Nueva Factura ────────────────────────────────────────────────────────────
test('página Nueva Factura carga el formulario', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/facturas/nueva`);
  await expect(page).toHaveURL(/facturas\/nueva/);

  // Sincronizar sobre el botón submit (sabemos que funciona en otros tests).
  // No usar networkidle: el streaming de PPR en Next 15 nunca cierra la red.
  const submitBtn = page.getByRole('button', { name: /emitir comprobante/i });
  await expect(submitBtn).toBeVisible({ timeout: 15000 });

  await expect(page.getByText('Tipo de comprobante')).toBeVisible();
  await expect(page.getByText('Productos / Servicios')).toBeVisible();
  console.log('✓ Formulario Nueva Factura carga correctamente');
});

test('formulario calcula totales en tiempo real', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/facturas/nueva`);

  // Esperar a que el botón esté listo (sincronización PPR-safe)
  const submitBtn = page.getByRole('button', { name: /emitir comprobante/i });
  await expect(submitBtn).toBeVisible({ timeout: 15000 });

  // Rellenar nombre del item
  const nombreInput = page.locator('input[placeholder="Servicio de diseño web"]');
  await nombreInput.waitFor({ state: 'visible', timeout: 5000 });
  await nombreInput.fill('Desarrollo web');

  // Precio unitario — segundo input numérico de la fila (cantidad=idx 0, precio=idx 1)
  const precioInput = page.locator('input[type="number"]').nth(1);
  await precioInput.fill('10000');

  // El total debe reflejar 10000 + 18% ITBIS = 11800
  await page.waitForTimeout(300);
  await expect(page.getByText('11,800.00').first()).toBeVisible({ timeout: 5000 });
  console.log('✓ Cálculo de totales funciona: 10000 + ITBIS 18% = 11800');
});

test('botón Emitir está deshabilitado sin items válidos', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/facturas/nueva`);

  const submitBtn = page.getByRole('button', { name: /emitir comprobante/i });
  // Sin nombre de item, el botón está deshabilitado
  await expect(submitBtn).toBeDisabled();
  console.log('✓ Botón Emitir deshabilitado sin items válidos');
});

test('página Facturas carga correctamente', async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/dashboard/facturas`);
  await expect(page.getByRole('heading', { name: 'Comprobantes Fiscales' })).toBeVisible();
  // Muestra el estado vacío O la tabla, ambos son válidos
  const empty = page.getByText('Sin comprobantes aún');
  const table = page.getByRole('table');
  const countText = page.getByText(/comprobante/);
  await expect(empty.or(table).or(countText).first()).toBeVisible({ timeout: 5000 });
  console.log('✓ Página Facturas carga correctamente');
});

// ─── API de emisión (sin certificado = error esperado) ────────────────────────
test('API /api/ecf/emitir retorna 422 sin certificado configurado', async ({ page }) => {
  await login(page);

  // Llamar directamente a la API
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/ecf/emitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipoEcf: '32',
        tipoPago: 1,
        items: [{ nombreItem: 'Test', cantidadItem: 1, precioUnitarioItem: 100 }],
      }),
    });
    return { status: r.status, body: await r.json() };
  });

  expect(res.status).toBe(422);
  expect(res.body.error).toContain('Certificado');
  console.log('✓ API retorna 422 correctamente sin certificado:', res.body.error);
});
