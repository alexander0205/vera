/**
 * Prueba manual del cliente SIGERD + descubridor de rutas del portal.
 *
 * Las credenciales se leen de variables de entorno: no se escriben en disco,
 * no se guardan en el repo y no aparecen en el historial si usas `read -s`.
 *
 *   read -s -p "Clave SIGERD: " SIGERD_PASSWORD && export SIGERD_PASSWORD
 *   export SIGERD_USUARIO='000-0000000-0'
 *   npx tsx scripts/sigerd-login-test.ts
 *
 * Argumentos opcionales:
 *   --perfil=N        índice del perfil a usar cuando hay varios (por defecto 0)
 *   --ruta=/Home      ruta a descargar tras el login (repetible)
 *   --guardar=out.html vuelca el HTML de la última ruta para inspeccionarlo
 *
 * Al terminar imprime todos los enlaces internos del portal: ese listado es el
 * mapa de módulos disponibles para el rol del usuario y sirve para decidir qué
 * consultas implementar.
 */

import { writeFileSync } from 'fs';
import { SigerdClient } from '../lib/sigerd/client';
import { SigerdError } from '../lib/sigerd/types';

function arg(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=');
}

function args(nombre: string): string[] {
  return process.argv
    .filter((a) => a.startsWith(`--${nombre}=`))
    .map((a) => a.split('=').slice(1).join('='));
}

async function main() {
  const usuario = process.env.SIGERD_USUARIO;
  const password = process.env.SIGERD_PASSWORD;

  if (!usuario || !password) {
    console.error('Faltan SIGERD_USUARIO y/o SIGERD_PASSWORD en el entorno.');
    console.error("  read -s -p 'Clave: ' SIGERD_PASSWORD && export SIGERD_PASSWORD");
    process.exit(1);
  }

  const cli = new SigerdClient();

  console.log(`→ Login como ${usuario.slice(0, 3)}***`);
  const r = await cli.iniciarSesion(usuario, password);

  if (r.estado === 'seleccion-perfil') {
    console.log(`\n✓ Credenciales OK. ${r.perfiles.length} perfil(es):`);
    r.perfiles.forEach((p, i) => {
      console.log(`  [${i}] ${p.nombreRol}${p.nombreCentro ? ` — ${p.nombreCentro}` : ''}  (id=${p.id})`);
    });

    const idx = Number(arg('perfil') ?? 0);
    const elegido = r.perfiles[idx];
    if (!elegido) {
      console.error(`\nÍndice de perfil inválido: ${idx}`);
      process.exit(1);
    }
    console.log(`\n→ Seleccionando perfil [${idx}] ${elegido.nombreRol}`);
    await cli.seleccionarPerfil(elegido);
  } else {
    console.log('\n✓ Credenciales OK (perfil único, sesión abierta).');
  }

  console.log('→ Verificando sesión…');
  console.log(`  autenticado: ${await cli.estaAutenticado()}`);
  console.log(`  cookies: ${Object.keys(cli.exportarSesion().cookies).join(', ') || '(ninguna)'}`);

  const rutas = args('ruta');
  rutas.unshift('/');

  let ultimoHtml = '';
  const enlaces = new Set<string>();

  for (const ruta of rutas) {
    try {
      const html = await cli.html(ruta);
      ultimoHtml = html;
      const titulo = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '(sin título)';
      console.log(`\n── ${ruta} → HTTP OK, ${html.length} bytes — "${titulo}"`);

      for (const m of html.matchAll(/href=["'](\/[^"'#?]{2,})["']/gi)) {
        const href = m[1];
        if (!/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map)$/i.test(href)) enlaces.add(href);
      }
    } catch (e) {
      const msg = e instanceof SigerdError ? `${e.codigo}: ${e.message}` : String(e);
      console.log(`\n── ${ruta} → ERROR ${msg}`);
    }
  }

  if (enlaces.size) {
    console.log(`\n── Rutas internas encontradas (${enlaces.size}) ──`);
    [...enlaces].sort().forEach((h) => console.log(`  ${h}`));
  }

  const salida = arg('guardar');
  if (salida && ultimoHtml) {
    writeFileSync(salida, ultimoHtml);
    console.log(`\nHTML guardado en ${salida}`);
  }

  await cli.cerrarSesion();
  console.log('\n✓ Sesión cerrada.');
}

main().catch((e) => {
  if (e instanceof SigerdError) console.error(`\n✗ SigerdError[${e.codigo}] ${e.message}`);
  else console.error('\n✗', e);
  process.exit(1);
});
