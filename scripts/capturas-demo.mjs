import { chromium } from '@playwright/test';
import { SignJWT } from 'jose';
import fs from 'node:fs';

/**
 * Capturas del sistema con la empresa de DEMOSTRACIÓN (team 36).
 *
 * Entra firmando la cookie de sesión con el AUTH_SECRET del entorno local, que
 * es lo mismo que hacen las pruebas E2E: no se escribe ninguna contraseña en
 * ningún formulario.
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

const clave = new TextEncoder().encode(env.AUTH_SECRET);
const token = await new SignJWT({
  user: { id: 50 },
  activeTeamId: 36,
  expires: new Date(Date.now() + 86_400_000).toISOString(),
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('1 day from now')
  .sign(clave);

const PANTALLAS = [
  { ruta: '/dashboard', archivo: 'demo-facturacion.png', espera: 4000 },
  { ruta: '/dashboard/productos', archivo: 'demo-inventario.png', espera: 3500 },
  { ruta: '/dashboard/cuentas-por-cobrar', archivo: 'demo-cartera.png', espera: 3500 },
  { ruta: '/contabilidad', archivo: 'demo-contabilidad.png', espera: 4000 },
  { ruta: '/contabilidad/libro-diario', archivo: 'demo-libro-diario.png', espera: 4000 },
  { ruta: '/escolar/cargos', archivo: 'demo-colegio-cargos.png', espera: 4500 },
  { ruta: '/pos', archivo: 'demo-pos.png', espera: 4500 },
  { ruta: '/escolar/dashboard', archivo: 'demo-colegio.png', espera: 5000 },
  { ruta: '/escolar/estudiantes', archivo: 'demo-colegio-estudiantes.png', espera: 4000 },
];

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'session', value: token, domain: 'localhost', path: '/' }]);
const pagina = await ctx.newPage();

for (const p of PANTALLAS) {
  try {
    await pagina.goto('http://localhost:3000' + p.ruta, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pagina.waitForTimeout(p.espera);
    const url = pagina.url();
    const texto = (await pagina.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 110);
    await pagina.screenshot({ path: 'public/home/capturas/' + p.archivo });
    console.log(`✓ ${p.archivo}  ←  ${url.replace('http://localhost:3000', '')}  ·  ${texto}`);
  } catch (e) {
    console.log(`✗ ${p.ruta}: ${String(e).split('\n')[0]}`);
  }
}
await navegador.close();
