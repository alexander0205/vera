/**
 * QA completo en UI de un COLEGIO desde cero.
 *
 * Un solo recorrido, con navegador real y clics reales, de todo lo que hace una
 * escuela el primer día: alta de la empresa, activación del módulo,
 * configuración académica, estudiantes, matrículas, cargos, usuarios y 10
 * facturas.
 *
 * Va en UN test a propósito. Repartirlo en varios obligaba a un login por test
 * y eso choca contra el rate limit de /sign-in (10 intentos por IP por minuto):
 * la mitad de la corrida fallaba por el propio test, no por la app.
 *
 * Es un test de DESCUBRIMIENTO: no corta al primer fallo. Cada paso roto se
 * anota y sigue, para que una corrida devuelva la lista completa de problemas.
 * Resumen al final; capturas en test-results/qa-colegio/.
 *
 * Requiere la app corriendo (E2E_BASE_URL) contra la DB de pruebas.
 */

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { activarEscolarParaUsuario } from './helpers/modulos';

const BASE  = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const SHOT  = 'test-results/qa-colegio';
const PASS  = 'QaColegio1234!';
const SELLO = Date.now();
const DUENO = `qa.colegio.${SELLO}@zero.test`;
const MAESTRA = `qa.maestra.${SELLO}@zero.test`;

interface Problema { paso: string; detalle: string; tipo: 'roto' | 'consola' | 'ux' }
const problemas: Problema[] = [];
const anotar = (tipo: Problema['tipo'], paso: string, detalle: string) => {
  problemas.push({ tipo, paso, detalle });
  console.log(`  ⚠ [${tipo}] ${paso}: ${detalle}`);
};

let rutaActual = '/';

/** Ejecuta un paso sin abortar la corrida: si truena, se anota y se sigue. */
async function paso(nombre: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    anotar('roto', nombre, e instanceof Error ? e.message.split('\n')[0].slice(0, 200) : String(e));
  }
}

const IGNORAR = /devtools|webpack|hmr|favicon|Download the React|Fast Refresh/i;

async function shot(page: Page, nombre: string) {
  fs.mkdirSync(SHOT, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/${nombre}.png`, fullPage: true }).catch(() => {});
}

async function ir(page: Page, ruta: string) {
  rutaActual = ruta;
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
}

const ESTUDIANTES = [
  ['Ana',    'Pérez'],
  ['Luis',   'Gómez'],
  ['María',  'Santos'],
  ['Carlos', 'Reyes'],
  ['Sofía',  'Núñez'],
];

test('QA completo de un colegio desde cero', async ({ page }) => {
  test.setTimeout(1_800_000);
  // Sin esto, un localizador que no existe se queda esperando hasta agotar el
  // timeout del TEST (media hora) y se lleva por delante toda la corrida: un
  // solo selector malo tapa el resto de los hallazgos.
  page.setDefaultTimeout(15_000);

  page.on('pageerror', e => anotar('consola', rutaActual, `pageerror: ${e.message.slice(0, 180)}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORAR.test(t)) return;
    anotar('consola', rutaActual, t.slice(0, 180));
  });

  // ── 1. Alta del colegio ───────────────────────────────────────────────────
  rutaActual = '/sign-up';
  await page.goto(`${BASE}/sign-up`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', DUENO);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.includes('/sign-up'), null, { timeout: 30_000 });

  const teamId = await activarEscolarParaUsuario(DUENO);
  console.log(`  · colegio creado (team ${teamId}, ${DUENO})`);

  await paso('el módulo escolar abre tras activarlo', async () => {
    await ir(page, '/escolar');
    await expect(page.getByRole('heading', { name: 'Estudiantes', exact: true }))
      .toBeVisible({ timeout: 25_000 });
  });
  await shot(page, '01-modulo-activo');

  // ── 2. Configuración académica ────────────────────────────────────────────
  await ir(page, '/escolar/configuracion');

  await paso('crear período escolar', async () => {
    await page.getByRole('button', { name: /Nuevo período/i }).first().click();
    await page.getByPlaceholder(/Ej: 2025-2026/).fill('Año 2026-2027');
    await page.locator('input[type="date"]').nth(0).fill('2026-08-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-06-30');
    await page.getByRole('button', { name: /^Guardar|^Crear/i }).first().click();
    await expect(page.getByText('Año 2026-2027').first()).toBeVisible({ timeout: 15_000 });
  });

  await paso('crear curso', async () => {
    await page.getByRole('button', { name: /Nuevo curso/i }).first().click();
    await page.getByPlaceholder(/Ej: Primero A/).fill('1ro Primaria');
    await page.getByRole('button', { name: /^Guardar|^Crear/i }).first().click();
    await expect(page.getByText('1ro Primaria').first()).toBeVisible({ timeout: 15_000 });
  });

  // El concepto de pago EXIGE un producto vinculado: el modal no ofrece campo
  // de nombre libre. Un colegio recién creado no tiene productos, así que hay
  // que salir a Facturación primero — sin ningún aviso en pantalla.
  await paso('crear el producto que respalda el concepto', async () => {
    const res = await page.request.post(`${BASE}/api/productos`, {
      data: { nombre: 'Mensualidad', precio: 2500, tipo: 'servicio', tasaItbis: 'exento' },
    });
    if (!res.ok()) throw new Error(`POST /api/productos → ${res.status()} ${(await res.text()).slice(0, 120)}`);
  });

  await paso('crear concepto de pago vinculado al producto', async () => {
    await ir(page, '/escolar/configuracion');
    await page.getByRole('button', { name: /Nuevo concepto/i }).first().click();
    await page.getByPlaceholder(/Buscar producto o servicio/).fill('Mensualidad');
    await page.waitForTimeout(1500);
    await page.getByText('Mensualidad', { exact: false }).last().click();
    await page.getByRole('button', { name: /^Guardar|^Crear/i }).first().click();
    await page.waitForTimeout(1500);
    await expect(page.getByText('Mensualidad').first()).toBeVisible({ timeout: 15_000 });
  });
  await shot(page, '02-configuracion');

  // ── 3. Estudiantes ────────────────────────────────────────────────────────
  for (const [nombres, apellidos] of ESTUDIANTES) {
    await paso(`alta de ${nombres} ${apellidos}`, async () => {
      await ir(page, '/escolar/estudiantes/nuevo');
      await page.getByLabel('Nombres *').fill(nombres);
      await page.getByLabel('Apellidos *').fill(apellidos);

      await page.getByRole('combobox', { name: 'Período' }).click();
      await page.getByRole('option', { name: /2026-2027/ }).first().click();
      await page.getByRole('combobox', { name: 'Curso' }).click();
      await page.getByRole('option', { name: /1ro Primaria/ }).first().click();

      await page.getByRole('button', { name: /Guardar|Crear|Inscribir/i }).first().click();
      await page.waitForFunction(
        () => !location.pathname.includes('/nuevo'), null, { timeout: 20_000 });
    });
  }

  await paso('el directorio lista los 5 estudiantes', async () => {
    await ir(page, '/escolar/estudiantes');
    for (const [nombres] of ESTUDIANTES) {
      await expect(page.getByText(nombres, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    }
  });
  await shot(page, '03-estudiantes');

  // ── 4. Matrículas ─────────────────────────────────────────────────────────
  await paso('cada estudiante quedó matriculado', async () => {
    await ir(page, '/escolar/matriculas');
    await expect(page.getByRole('heading', { name: 'Matrículas', exact: true })).toBeVisible({ timeout: 20_000 });
    const filas = await page.getByRole('row').count();
    expect(filas).toBeGreaterThanOrEqual(ESTUDIANTES.length + 1); // +1 encabezado
  });
  await shot(page, '04-matriculas');

  // ── 5. Cargos ─────────────────────────────────────────────────────────────
  await ir(page, '/escolar/cargos');
  await paso('generar cargos para todo el curso', async () => {
    await page.getByRole('button', { name: /Generar cargos/i }).first().click();
    await page.waitForTimeout(1500);
    await page.getByPlaceholder(/3500\.00/).first().fill('2500');
    await page.getByRole('button', { name: /^Generar/i }).last().click();
    await page.waitForTimeout(3000);
  });

  await paso('los cargos generados aparecen con su saldo', async () => {
    await ir(page, '/escolar/cargos');
    await expect(page.getByText(/Mensualidad/).first()).toBeVisible({ timeout: 15_000 });
  });
  await shot(page, '05-cargos');

  // ── 6. Usuarios ───────────────────────────────────────────────────────────
  await paso('invitar personal del colegio', async () => {
    await ir(page, '/cuenta/usuarios');
    await page.getByRole('button', { name: /Invitar|Nuevo usuario|Agregar/i }).first().click();
    await page.waitForTimeout(1000);
    // El campo de email del modal no tiene placeholder ni label asociado, así
    // que solo se puede localizar por su tipo (ver findings del QA).
    const dialogo = page.getByRole('dialog');
    await dialogo.locator('input[type="email"], input[type="text"]').first().fill(MAESTRA);
    await page.getByRole('button', { name: /Enviar|Invitar|Guardar/i }).last().click();
    await page.waitForTimeout(2000);
  });

  await paso('existe el rol "Personal del colegio"', async () => {
    await ir(page, '/cuenta/roles');
    await expect(page.getByText(/Personal del colegio/i).first()).toBeVisible({ timeout: 20_000 });
  });
  await shot(page, '06-usuarios');

  // ── 7. Diez facturas ──────────────────────────────────────────────────────
  await paso('crear el contacto al que se le factura', async () => {
    const res = await page.request.post(`${BASE}/api/clientes`, {
      data: { razonSocial: 'Tutor QA Colegio', rnc: '130555444', email: 'tutor.qa@zero.test' },
    });
    if (!res.ok()) throw new Error(`POST /api/clientes → ${res.status()} ${(await res.text()).slice(0, 120)}`);
  });

  let emitidas = 0;
  for (let i = 1; i <= 10; i++) {
    await paso(`factura ${i}/10`, async () => {
      await ir(page, '/dashboard/facturas/nueva');
      // El form de factura es pesado: hay que esperar a que exista de verdad.
      // Sin esta espera, el primer intento cae en el compilado en frío de la
      // ruta y arrastra a los 10.
      const buscarCliente = page.getByPlaceholder(/Buscar cliente por nombre/).first();
      await buscarCliente.waitFor({ state: 'visible', timeout: 60_000 });
      await buscarCliente.fill('Tutor QA');
      await page.waitForTimeout(1200);
      await page.getByText('Tutor QA Colegio').first().click();

      await page.getByPlaceholder(/Buscar producto o servicio/).first().fill('Mensualidad');
      await page.waitForTimeout(1200);
      await page.getByText('Mensualidad').first().click();
      await page.waitForTimeout(800);

      await page.getByRole('button', { name: /Guardar factura/i }).first().click();
      await page.waitForTimeout(3000);
      emitidas += 1;
    });
  }
  console.log(`  · facturas completadas: ${emitidas}/10`);
  await shot(page, '07-facturas');

  await paso('el listado de facturas muestra lo emitido', async () => {
    await ir(page, '/dashboard/facturas');
    await expect(page.getByText(/Tutor QA Colegio/).first()).toBeVisible({ timeout: 20_000 });
  });

  // ── 8. Barrido de pantallas ───────────────────────────────────────────────
  const RUTAS = [
    '/dashboard', '/dashboard/facturas', '/dashboard/clientes', '/dashboard/productos',
    '/dashboard/cuentas-por-cobrar', '/dashboard/reportes',
    '/escolar', '/escolar/estudiantes', '/escolar/matriculas', '/escolar/cargos',
    '/escolar/pagos', '/escolar/configuracion',
    '/cuenta', '/cuenta/empresa', '/cuenta/usuarios', '/cuenta/roles', '/cuenta/plan',
  ];

  for (const r of RUTAS) {
    await paso(`carga ${r}`, async () => {
      const res = await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded' });
      rutaActual = r;
      if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
      await page.waitForTimeout(1200);
      const hayTitulo = await page.getByRole('heading').first().isVisible().catch(() => false);
      if (!hayTitulo) throw new Error('la pantalla no muestra ningún encabezado');
    });
    await shot(page, `08${r.replace(/\//g, '-')}`);
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  fs.mkdirSync(SHOT, { recursive: true });
  fs.writeFileSync(`${SHOT}/problemas.json`, JSON.stringify(problemas, null, 2));

  console.log('\n══════ RESUMEN QA COLEGIO ══════');
  if (!problemas.length) {
    console.log('Sin problemas detectados.');
  } else {
    const porTipo = problemas.reduce<Record<string, number>>((a, p) => {
      a[p.tipo] = (a[p.tipo] ?? 0) + 1; return a;
    }, {});
    console.log(`${problemas.length} anotaciones: ${JSON.stringify(porTipo)}\n`);
    const vistos = new Set<string>();
    for (const p of problemas) {
      const clave = `${p.tipo}|${p.paso}|${p.detalle.slice(0, 60)}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      console.log(`[${p.tipo}] ${p.paso}\n    ${p.detalle}\n`);
    }
  }
  console.log('════════════════════════════════');
});
