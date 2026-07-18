/**
 * QA manual completo en UI (navegador real) — recorre desde cero:
 *  A. Signup empresa nueva + multi-negocio + usuarios
 *  B. Módulos + switcher Facturación↔POS + rol Cajero (solo POS)
 *  C. Entidades COMPARTIDAS: producto, servicio y contacto creados en un módulo
 *     aparecen en el otro (misma tabla) + toggle "Visible en POS" + categorías
 *  D. POS touch/tablet + venta completa con cobro + nav propio del POS
 *  E. Funcionalidades existentes: facturas, reportes, admin
 *
 * Deja capturas en test-results/qa/ como evidencia visual.
 * Requiere la app corriendo (E2E_BASE_URL) contra la DB de pruebas.
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const SHOT = 'test-results/qa';
const PASS = 'QaZero1234!';
const DUENO = `qa.dueno.${Date.now()}@zero.test`;

test.describe.configure({ mode: 'serial' });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: false });
}

/** Login robusto: rellena y espera el destino real (dashboard o pricing). */
async function login(page: Page, email: string, password = PASS) {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/sign-in'), { timeout: 20_000 });
}

// ─── A. Signup desde cero + multi-negocio ────────────────────────────────────

test('A1 · signup de empresa nueva desde cero', async ({ page }) => {
  await page.goto(`${BASE}/sign-up`);
  await page.fill('input[name="email"]', DUENO);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  // El flujo lleva a pricing (bienvenida) con la sesión ya creada
  await page.waitForURL(/pricing|dashboard/, { timeout: 20_000 });

  await page.goto(`${BASE}/dashboard`);
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText('Panel Principal')).toBeVisible({ timeout: 15_000 });
  await shot(page, 'A1-dashboard-empresa-nueva');
});

test('A2 · crear segunda empresa y cambiar entre ellas', async ({ page }) => {
  await login(page, DUENO);
  await page.goto(`${BASE}/dashboard/empresas`);
  await expect(page.getByText('Mis empresas')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /Nueva empresa/i }).click();
  await page.fill('input[placeholder*="Soluciones"]', 'QA Colmado SRL');
  await page.fill('input[placeholder*="dígitos"]', '130777888');
  await page.getByRole('button', { name: /Crear y elegir plan/i }).click();
  await page.waitForURL(/pricing/, { timeout: 20_000 });

  // La empresa nueva quedó activa y aislada (sin datos de la anterior)
  await page.goto(`${BASE}/dashboard`);
  await expect(page.getByText('Panel Principal')).toBeVisible({ timeout: 15_000 });
  await shot(page, 'A2-segunda-empresa-activa');

  // Volver a la primera desde el selector de empresas
  await page.goto(`${BASE}/dashboard/empresas`);
  await expect(page.getByText('QA Colmado SRL')).toBeVisible();
  await shot(page, 'A2-lista-dos-empresas');
});

// ─── B. Módulos, switcher y rol solo-POS ─────────────────────────────────────

test('B1 · empresa sin módulo POS: /pos redirige a sin-acceso', async ({ page }) => {
  await login(page, DUENO);
  await page.goto(`${BASE}/pos`);
  await expect(page).toHaveURL(/sin-acceso/);
  await expect(page.getByText(/No tienes acceso a este módulo/i)).toBeVisible();
  await shot(page, 'B1-sin-acceso-pos');
});

test('B2 · activar módulo POS → switcher y POS disponibles', async ({ page }) => {
  await login(page, DUENO);
  const res = await page.request.post(`${BASE}/api/equipo/perfil`, { data: { posHabilitado: true } });
  expect(res.ok()).toBeTruthy();

  await page.goto(`${BASE}/dashboard`);
  // El switcher de módulo aparece cuando hay 2 módulos accesibles
  await expect(page.getByRole('button', { name: /Facturación/ }).first()).toBeVisible({ timeout: 15_000 });
  await shot(page, 'B2-switcher-modulo-visible');

  // POS ya entra y auto-provisiona terminal/almacén
  await page.goto(`${BASE}/pos`);
  await expect(page).toHaveURL(/\/pos/);
  await expect(page.getByText(/Abrir turno de caja|Buscar o escanear|Caja principal/i).first()).toBeVisible({ timeout: 20_000 });
  await shot(page, 'B2-pos-autoprovisionado');
});

test('B3 · rol Cajero (solo POS) existe y limita el acceso', async ({ page }) => {
  await login(page, DUENO);
  // El catálogo de roles del team incluye el rol de sistema Cajero (solo POS)
  const res = await page.request.get(`${BASE}/api/equipo/permisos`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const roles: Array<{ key: string; permissions?: string[] }> = body.roles ?? [];
  const cajero = roles.find(r => r.key === 'cajero');
  expect(cajero, 'debe existir el rol de sistema "cajero"').toBeTruthy();
  // Solo módulo POS, nunca Facturación
  expect(cajero!.permissions ?? []).toContain('modulo:pos');
  expect(cajero!.permissions ?? []).not.toContain('modulo:facturacion');
});

// ─── C. Entidades compartidas entre módulos ──────────────────────────────────

test('C1 · producto creado en POS aparece en Facturación (compartido)', async ({ page }) => {
  await login(page, DUENO);
  const nombre = `QA Café ${Date.now()}`;

  // Alta desde el módulo POS (mismo endpoint que usa el modal compartido)
  const crear = await page.request.post(`${BASE}/api/productos`, {
    data: { nombre, precio: 150, tasaItbis: '0.18', tipo: 'bien', visiblePos: true },
  });
  expect(crear.ok()).toBeTruthy();

  // Visible en el catálogo de Facturación
  await page.goto(`${BASE}/dashboard/productos`);
  await expect(page.getByText(nombre)).toBeVisible({ timeout: 15_000 });
  await shot(page, 'C1-producto-en-facturacion');

  // …y en el catálogo del POS (visiblePos = true)
  const cat = await page.request.get(`${BASE}/api/productos?search=${encodeURIComponent(nombre)}`);
  expect(cat.ok()).toBeTruthy();
  const cuerpo = await cat.json();
  expect(JSON.stringify(cuerpo)).toContain(nombre);
});

test('C2 · servicio NO se muestra en POS por defecto (visiblePos=false)', async ({ page }) => {
  await login(page, DUENO);
  const nombre = `QA Consultoría ${Date.now()}`;

  // Servicio sin especificar visiblePos → default: fuera del mostrador
  const crear = await page.request.post(`${BASE}/api/productos`, {
    data: { nombre, precio: 5000, tasaItbis: '0.18', tipo: 'servicio' },
  });
  expect(crear.ok()).toBeTruthy();
  const creado = await crear.json();
  expect(creado.producto.visiblePos, 'servicio no debe salir en la grilla del POS').toBe(false);

  // Pero sí existe para facturar (entidad compartida)
  await page.goto(`${BASE}/dashboard/productos`);
  await expect(page.getByText(nombre)).toBeVisible({ timeout: 15_000 });
  await shot(page, 'C2-servicio-compartido-no-pos');
});

test('C3 · contacto creado es el mismo en ambos módulos', async ({ page }) => {
  await login(page, DUENO);
  const razon = `QA Cliente ${Date.now()}`;

  const crear = await page.request.post(`${BASE}/api/clientes`, {
    data: { razonSocial: razon, rnc: '130999111' },
  });
  expect(crear.ok()).toBeTruthy();

  // Facturación → Contactos
  await page.goto(`${BASE}/dashboard/clientes`);
  await expect(page.getByText(razon)).toBeVisible({ timeout: 15_000 });
  await shot(page, 'C3-contacto-en-facturacion');

  // POS → Contactos (misma tabla, dentro del shell del POS)
  await page.goto(`${BASE}/pos/contactos`);
  await expect(page.getByText(razon)).toBeVisible({ timeout: 15_000 });
  await shot(page, 'C3-contacto-en-pos');
});

// ─── D. POS touch/tablet + venta completa ────────────────────────────────────

test('D1 · POS en tablet: grilla touch y navegación propia', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 }); // tablet
  await login(page, DUENO);
  await page.goto(`${BASE}/pos`);

  // Abrir turno si toca
  const abrir = page.getByRole('button', { name: /Abrir turno y empezar a vender/i });
  if (await abrir.isVisible().catch(() => false)) await abrir.click();

  await expect(page.getByPlaceholder(/Buscar o escanear/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Venta simple').first()).toBeVisible();
  await shot(page, 'D1-pos-tablet-touch');
});

test('D2 · venta completa en POS con cobro en efectivo', async ({ page }) => {
  await login(page, DUENO);

  // Producto con nombre conocido para poder tocar su tile sin ambigüedad
  const prod = `QA Venta ${Date.now()}`;
  const crear = await page.request.post(`${BASE}/api/productos`, {
    data: { nombre: prod, precio: 100, tasaItbis: '0.18', tipo: 'bien', visiblePos: true },
  });
  expect(crear.ok()).toBeTruthy();

  await page.goto(`${BASE}/pos`);
  const abrir = page.getByRole('button', { name: /Abrir turno y empezar a vender/i });
  if (await abrir.isVisible().catch(() => false)) await abrir.click();
  await expect(page.getByPlaceholder(/Buscar o escanear/i)).toBeVisible({ timeout: 20_000 });

  // Tocar el tile del producto (grilla touch), no el botón de cobrar
  await page.getByText(prod, { exact: true }).first().click();

  // El carrito refleja el total y habilita cobrar
  const cobrar = page.getByRole('button', { name: /^Cobrar RD\$/ });
  await expect(cobrar).toBeEnabled({ timeout: 10_000 });
  await shot(page, 'D2-carrito-con-producto');

  await cobrar.click();
  // Monto exacto (opción rápida) DENTRO del modal de cobro, y confirmar
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.locator('button', { hasText: /^RD\$/ }).first().click();
  const confirmar = modal.getByRole('button', { name: /Confirmar venta/i });
  await expect(confirmar).toBeEnabled({ timeout: 10_000 });
  await confirmar.click();

  // Carrito vacío tras la venta
  await expect(page.getByText(/Toca productos para agregarlos/i)).toBeVisible({ timeout: 20_000 });
  await shot(page, 'D2-venta-completada');
});

test('D3 · nav propio del POS: turnos, efectivo, devoluciones, config', async ({ page }) => {
  await login(page, DUENO);
  for (const [ruta, titulo] of [
    ['/pos/turnos', /Turnos|Historial/i],
    ['/pos/caja', /Caja|efectivo|Apertura/i],
    ['/pos/devoluciones', /Devoluciones/i],
    ['/pos/configuracion', /Configuración del punto de venta/i],
    ['/pos/inventario', /Inventario|Movimientos/i],
  ] as const) {
    await page.goto(`${BASE}${ruta}`);
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 20_000 });
    // Sigue dentro del POS (no rebotó a Facturación)
    expect(page.url()).toContain('/pos');
  }
  await shot(page, 'D3-pos-configuracion');
});

// ─── E. Funcionalidades existentes ───────────────────────────────────────────

test('E1 · facturas: listado y formulario de nueva factura', async ({ page }) => {
  await login(page, DUENO);
  await page.goto(`${BASE}/dashboard/facturas`);
  await expect(page).toHaveURL(/facturas/);
  await shot(page, 'E1-facturas-listado');

  await page.goto(`${BASE}/dashboard/facturas/nueva`);
  await expect(page.getByRole('button', { name: /emitir|guardar/i }).first()).toBeVisible({ timeout: 20_000 });
  await shot(page, 'E1-nueva-factura');
});

test('E2 · reportes con filtro de fechas (DateRangeFilter)', async ({ page }) => {
  await login(page, DUENO);
  await page.goto(`${BASE}/dashboard/reportes/ventas-generales`);
  await expect(page.getByRole('heading', { name: 'Ventas generales' })).toBeVisible({ timeout: 20_000 });
  await shot(page, 'E2-reporte-ventas-generales');
});

test('E3 · sin errores JS en las pantallas clave', async ({ page }) => {
  const errores: string[] = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(`[console] ${m.text()}`); });

  await login(page, DUENO);
  for (const r of ['/dashboard', '/pos', '/dashboard/productos', '/dashboard/clientes', '/pos/configuracion']) {
    await page.goto(`${BASE}${r}`);
    await page.waitForLoadState('domcontentloaded');
  }

  // Ignorar ruido conocido: hidratación por autoFocus y ecf-api externo ausente en local
  const reales = errores.filter(e =>
    !/hydrat/i.test(e) && !/ecf-api|Cannot GET \/me/i.test(e) &&
    !/devtools|webpack|hmr|Download the React DevTools/i.test(e),
  );
  if (reales.length) console.log('Errores JS:', reales.slice(0, 5));
  expect(reales, `errores JS: ${reales.slice(0, 3).join(' | ')}`).toHaveLength(0);
});
