import { chromium } from '@playwright/test';
import { SignJWT } from 'jose';
import fs from 'node:fs';

/**
 * Capturas del sistema para la web, sacadas de las empresas de DEMOSTRACIÓN.
 *
 *   node scripts/capturas-demo.mjs negocio   → Distribuidora Demo Zero (portada, ERP,
 *                                              contabilidad, punto de venta)
 *   node scripts/capturas-demo.mjs colegio   → Colegio Demo Zero (/colegios)
 *
 * Las dos empresas las siembran `seed-demo-negocio.ts` y `seed-demo-completo.ts`
 * en el sandbox. El servidor de desarrollo tiene que estar corriendo contra ese
 * sandbox (`.env.local`); `BASE_URL` dice dónde, por defecto localhost:3000.
 *
 * Entra firmando la cookie de sesión con el AUTH_SECRET del entorno local, que
 * es lo mismo que hacen las pruebas E2E: no se escribe ninguna contraseña en
 * ningún formulario.
 *
 * Antes de fotografiar la empresa de negocio le pide al PROPIO sistema que
 * aplique su configuración contable recomendada, la encienda y genere los
 * asientos. La captura de Contabilidad salía con «la contabilidad automática
 * está apagada» y un libro diario vacío: justo lo contrario de lo que vende.
 *
 * Lo que NUNCA hace: cobrar en el punto de venta. Mete productos al carrito y
 * fotografía; una venta de verdad emitiría un comprobante.
 */

// Next carga `.env.local` y completa lo que falte con `.env`; el servidor de
// desarrollo firma con el AUTH_SECRET que resulte de esa mezcla, así que hay
// que leerla igual o la cookie no le vale.
function leer(archivo) {
  if (!fs.existsSync(archivo)) return {};
  return Object.fromEntries(
    fs.readFileSync(archivo, 'utf8').split('\n')
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
  );
}
const env = { ...leer('.env'), ...leer('.env.local') };
if (!env.AUTH_SECRET) { console.error('✗ sin AUTH_SECRET'); process.exit(1); }

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MODO = process.argv[2] ?? 'negocio';

const EMPRESAS = {
  negocio: {
    team: Number(process.env.DEMO_TEAM ?? 37),
    user: Number(process.env.DEMO_USER ?? 53),
    pantallas: [
      { ruta: '/dashboard', archivo: 'demo-facturacion.png', espera: 4500 },
      { ruta: '/dashboard/productos', archivo: 'demo-inventario.png', espera: 3500 },
      { ruta: '/dashboard/cuentas-por-cobrar', archivo: 'demo-cartera.png', espera: 4000 },
      { ruta: '/contabilidad', archivo: 'demo-contabilidad.png', espera: 4500 },
      { ruta: '/contabilidad/libro-diario', archivo: 'demo-libro-diario.png', espera: 4500 },
      // El hero en el teléfono: la de escritorio encogida a 340 px queda con
      // letra de tres píxeles, y el panel en su versión móvil corta la cifra
      // de ingresos. Va un pedazo del de escritorio —ingresos y tendencia—,
      // que sí se lee.
      { ruta: '/dashboard', archivo: 'demo-facturacion-recorte.png', espera: 4500, recorte: ['Ingresos del mes', 'Tendencia de ingresos'] },
    ],
    movil: [],
  },
  colegio: {
    team: Number(process.env.DEMO_TEAM ?? 36),
    user: Number(process.env.DEMO_USER ?? 50),
    pantallas: [
      { ruta: '/escolar/dashboard', archivo: 'demo-colegio.png', espera: 5000 },
      { ruta: '/escolar/cargos', archivo: 'demo-colegio-cargos.png', espera: 4500 },
      { ruta: '/escolar/estudiantes', archivo: 'demo-colegio-estudiantes.png', espera: 4000 },
    ],
    movil: [],
  },
};

const empresa = EMPRESAS[MODO];
if (!empresa) { console.error(`✗ modo desconocido: ${MODO} (negocio | colegio)`); process.exit(1); }

const token = await new SignJWT({
  user: { id: empresa.user },
  activeTeamId: empresa.team,
  expires: new Date(Date.now() + 86_400_000).toISOString(),
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('1 day from now')
  .sign(new TextEncoder().encode(env.AUTH_SECRET));

const navegador = await chromium.launch();

async function contexto(opciones) {
  const ctx = await navegador.newContext(opciones);
  await ctx.addCookies([{ name: 'session', value: token, domain: new URL(BASE).hostname, path: '/' }]);
  return ctx;
}

/**
 * Lo que no debe salir en una foto pública, quitado justo antes de tomarla.
 *
 * El globo rojo «1 Issue» del modo desarrollo de Next salía dentro de la
 * captura del punto de venta que está en la web. Un estilo inyectado al cargar
 * no basta: React lo retira al hidratar `<html>`. Se quita el nodo.
 */
async function limpiarParaFoto(pagina) {
  // El cargador de llegada (`components/loader-llegada.tsx`) tapa la pantalla
  // un rato después de pintar, y en el teléfono se quedó en la foto con su
  // cita de Séneca. Se espera a que se vaya solo; quitarlo a mano dejaría ver
  // la pantalla a medio montar.
  await pagina.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(e => {
    const r = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    return r.width > innerWidth * 0.6 && r.height > innerHeight * 0.6 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05;
  }), null, { timeout: 25_000 }).catch(() => console.log('  ⚠ el cargador seguía encima al tomar la foto'));
  await pagina.waitForTimeout(600);
  await pagina.evaluate(() => {
    document.querySelectorAll('nextjs-portal').forEach(n => n.remove());
    // El buscador de la cabecera toma el foco al cargar y sale con su anillo azul.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function fotografiar(pagina, p) {
  try {
    await pagina.goto(BASE + p.ruta, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    // El panel lee sus cifras de un `unstable_cache` de 30 s, que en la primera
    // visita entrega lo viejo y refresca por detrás: sin la segunda carga, la
    // foto salía con los doce meses sumados en el mes de hoy.
    await pagina.waitForTimeout(2500);
    await pagina.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    await pagina.waitForTimeout(p.espera);
    await limpiarParaFoto(pagina);
    const url = pagina.url().replace(BASE, '');
    if (url !== p.ruta) console.log(`  ⚠ ${p.ruta} redirigió a ${url}`);
    const clip = p.recorte ? await cajaQueEnvuelve(pagina, p.recorte) : undefined;
    await pagina.screenshot({ path: 'public/home/capturas/' + p.archivo, clip });
    const texto = (await pagina.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 100);
    console.log(`✓ ${p.archivo}  ←  ${url}  ·  ${texto}`);
  } catch (e) {
    console.log(`✗ ${p.ruta}: ${String(e).split('\n')[0]}`);
  }
}

/**
 * El rectángulo que envuelve las tarjetas cuyos títulos se nombran, con un
 * margen. Se mide en la página y no se escribe a mano: si el panel cambia de
 * diseño, el recorte lo sigue.
 */
async function cajaQueEnvuelve(pagina, titulos) {
  const cajas = await pagina.evaluate((titulos) => titulos.map(t => {
    const hoja = [...document.querySelectorAll('body *')]
      .find(e => e.childElementCount === 0 && e.textContent.trim().toLowerCase() === t.toLowerCase());
    // Sube hasta la tarjeta: el primer ancestro con borde y ancho de tarjeta.
    let c = hoja;
    while (c && !(getComputedStyle(c).borderTopWidth !== '0px' && c.getBoundingClientRect().width > 220)) c = c.parentElement;
    const r = (c ?? hoja)?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, derecha: r.right, abajo: r.bottom } : null;
  }), titulos);
  if (cajas.some(c => !c)) throw new Error(`no encontré las tarjetas ${titulos.join(', ')}`);
  const margen = 18;
  const x = Math.min(...cajas.map(c => c.x)) - margen;
  const y = Math.min(...cajas.map(c => c.y)) - margen;
  return {
    x, y,
    width: Math.max(...cajas.map(c => c.derecha)) + margen - x,
    height: Math.max(...cajas.map(c => c.abajo)) + margen - y,
  };
}

/** Configuración recomendada, encendido y asientos, por la API del sistema. */
async function prepararContabilidad(ctx) {
  const api = ctx.request;
  const pedir = async (metodo, ruta, datos) => {
    const r = await api.fetch(BASE + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      data: datos ? JSON.stringify(datos) : undefined,
      // Un barrido son cientos de asientos, uno por uno, contra Neon.
      timeout: 0,
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok()) throw new Error(`${metodo} ${ruta} → ${r.status()} ${JSON.stringify(cuerpo).slice(0, 200)}`);
    return cuerpo;
  };

  await pedir('POST', '/api/contabilidad/cuentas/restaurar-base');
  await pedir('PATCH', '/api/contabilidad/config', { seccion: 'recomendada' });
  await pedir('PATCH', '/api/contabilidad/config', { seccion: 'activar', activa: true });

  // Cada barrido asienta hasta 200 documentos por tipo: se repite hasta que no
  // quede nada pendiente o deje de avanzar.
  let antes = Infinity;
  for (let vuelta = 1; vuelta <= 8; vuelta++) {
    const r = await pedir('POST', '/api/contabilidad/libro-diario');
    const { pendientes } = await pedir('GET', '/api/contabilidad/libro-diario?pagina=1');
    const quedan = typeof pendientes === 'number' ? pendientes : Object.values(pendientes ?? {}).reduce((a, b) => a + Number(b || 0), 0);
    const fallidos = r.fallidos?.length ?? 0;
    console.log(`  asientos, vuelta ${vuelta}: ${JSON.stringify(r).slice(0, 140)} · quedan ${quedan}`);
    if (fallidos > 0) console.log(`  ⚠ ${fallidos} documentos no se asentaron: ${JSON.stringify(r.fallidos.slice(0, 3))}`);
    if (quedan === 0 || quedan >= antes) break;
    antes = quedan;
  }
}

/** Abre el turno si hace falta y llena el carrito. No cobra. */
async function fotografiarPuntoDeVenta(pagina) {
  try {
    await pagina.goto(BASE + '/pos', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await pagina.waitForTimeout(4000);
    const abrir = pagina.getByRole('button', { name: /abrir turno/i });
    if (await abrir.isVisible().catch(() => false)) {
      await pagina.getByPlaceholder('0.00').fill('5000');
      await abrir.click();
      await pagina.waitForTimeout(5000);
    }
    for (const [nombre, veces] of [['Arroz selecto', 2], ['Café molido', 1], ['Detergente en polvo', 1], ['Papel higiénico', 3]]) {
      const tarjeta = pagina.getByText(nombre, { exact: false }).first();
      for (let i = 0; i < veces; i++) {
        await tarjeta.click({ timeout: 8000 });
        await pagina.waitForTimeout(350);
      }
    }
    await pagina.waitForTimeout(1200);
    // Al tocar las tarjetas la rejilla rueda; se devuelve arriba para que se
    // vean enteras.
    await pagina.evaluate(() => document.querySelectorAll('*').forEach(e => { if (e.scrollTop > 0) e.scrollTop = 0; }));
    await pagina.waitForTimeout(400);
    await limpiarParaFoto(pagina);
    await pagina.screenshot({ path: 'public/home/capturas/demo-pos.png' });
    const texto = (await pagina.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 100);
    console.log(`✓ demo-pos.png  ←  /pos  ·  ${texto}`);
  } catch (e) {
    console.log(`✗ /pos: ${String(e).split('\n')[0]}`);
  }
}

// `SOLO=movil` rehace solo la versión de teléfono, sin volver a asentar ni
// pasar por la caja.
const soloMovil = process.env.SOLO === 'movil';

if (!soloMovil) {
  const escritorio = await contexto({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  if (MODO === 'negocio') await prepararContabilidad(escritorio);

  const pagina = await escritorio.newPage();
  for (const p of empresa.pantallas) await fotografiar(pagina, p);
  if (MODO === 'negocio') await fotografiarPuntoDeVenta(pagina);
}

if (empresa.movil.length > 0) {
  const telefono = await contexto({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const paginaMovil = await telefono.newPage();
  for (const p of empresa.movil) await fotografiar(paginaMovil, p);
}

await navegador.close();
