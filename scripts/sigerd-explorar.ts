/**
 * Explorador de SIGERD: se loguea, recorre el portal y levanta el mapa completo
 * de rutas, formularios y endpoints AJAX disponibles para el rol del usuario.
 *
 * SESIÓN: reutiliza la guardada en `~/.sigerd/` y solo pide contraseña si
 * caducó. La contraseña no se guarda nunca, no queda en el historial del shell
 * y no aparece en el reporte de salida.
 *
 *   npx tsx scripts/sigerd-explorar.ts
 *
 * Opciones:
 *   --usuario=225-0000000-0   cédula (si no, se pide o se lee de SIGERD_USUARIO)
 *   --perfil=N                índice del perfil cuando hay varios (por defecto 0)
 *   --profundidad=2           saltos desde la portada (por defecto 2)
 *   --max=60                  máximo de páginas a visitar (por defecto 60)
 *   --salida=sigerd-mapa      prefijo de los archivos .json y .md generados
 *
 * SEGURIDAD DEL RECORRIDO: solo hace GET, un request a la vez y con pausa entre
 * cada uno. Cualquier URL que huela a acción destructiva o de escritura se
 * descarta sin visitarla (ver RUTAS_PROHIBIDAS).
 */

import { writeFileSync } from 'fs';
import { SigerdClient } from '../lib/sigerd/client';
import { abrirSesion } from '../lib/sigerd/cli-sesion';
import { guardarSesionArchivo } from '../lib/sigerd/sesion-archivo';
import { SigerdError, type SigerdPerfil } from '../lib/sigerd/types';

// ───────────────────────────── Configuración ─────────────────────────────

/** Nunca se visitan: escriben, borran o cierran la sesión. */
const RUTAS_PROHIBIDAS =
  /(eliminar|delete|borrar|remove|anular|desactivar|inactivar|guardar|save|crear|create|nuevo|new|editar|edit|update|actualizar|insertar|enviar|submit|aprobar|rechazar|logoff|logout|salir|cerrarsesion|signout|reset|restaurar|generar|procesar)/i;

/**
 * Recursos que no son páginas. Incluye los bundles de ASP.NET, que no llevan
 * extensión: llegan como `/Content/css?v=…` o `/Bundles/commonsScripts?v=…`.
 */
const ESTATICOS =
  /(\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|map|pdf|xlsx?|docx?|zip)(\?|$)|\/(css|js)(\?|$)|^\/Bundles\/)/i;

const PAUSA_MS = 350;

// ────────────────────────────── Utilidades ───────────────────────────────

function arg(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=');
}

const tiene = (nombre: string) => process.argv.includes(`--${nombre}`);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Formulario {
  action: string;
  method: string;
  campos: string[];
}

interface Pagina {
  ruta: string;
  titulo: string;
  bytes: number;
  error?: string;
  formularios: Formulario[];
  /** URLs encontradas dentro de scripts inline: son los endpoints AJAX reales. */
  endpointsAjax: string[];
  /** `<script src>` de la página: los bundles se escanean en la fase 2. */
  scripts: string[];
  enlaces: string[];
  /** Indicios de tablas de datos server-side (DataTables, Kendo, etc.). */
  tablas: string[];
}

// ─────────────────────────────── Parsers ─────────────────────────────────

function titulo(html: string): string {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim().replace(/\s+/g, ' ') ?? '(sin título)';
}

function enlacesDe(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["'](\/[^"'\s>]*)["']/gi)) {
    const href = m[1].split('#')[0];
    if (!href || href === '/' || ESTATICOS.test(href)) continue;
    out.add(href);
  }
  return [...out];
}

function formulariosDe(html: string): Formulario[] {
  const out: Formulario[] = [];
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = m[1];
    const cuerpo = m[2];
    const action = attrs.match(/action=["']([^"']*)["']/i)?.[1] ?? '';
    const method = (attrs.match(/method=["']([^"']*)["']/i)?.[1] ?? 'get').toUpperCase();

    const campos = new Set<string>();
    for (const c of cuerpo.matchAll(/<(?:input|select|textarea)\b[^>]*name=["']([^"']+)["']/gi)) {
      if (c[1] !== '__RequestVerificationToken' && c[1] !== 'fake') campos.add(c[1]);
    }
    out.push({ action, method, campos: [...campos] });
  }
  return out;
}

/** URLs dentro de scripts inline: así fue como se descubrió Account/CargarInformacion. */
function endpointsAjaxDe(html: string): string[] {
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .join('\n');

  const out = new Set<string>();

  // "/Controlador/Accion" y rootDir + "Controlador/Accion"
  for (const m of inline.matchAll(/["'`](\/?[A-Za-z][A-Za-z0-9_]*\/[A-Za-z][A-Za-z0-9_/]*)["'`]/g)) {
    const url = m[1].startsWith('/') ? m[1] : `/${m[1]}`;
    if (ESTATICOS.test(url)) continue;
    if (url.split('/').length > 5) continue;
    out.add(url);
  }
  // Url.Action("Accion", "Controlador") renderizado del lado servidor
  for (const m of inline.matchAll(/url\s*:\s*["'`]([^"'`]+)["'`]/gi)) {
    if (m[1].startsWith('/') || m[1].startsWith('http')) out.add(m[1]);
  }
  return [...out];
}

/** Librerías de terceros: su código no contiene endpoints del portal. */
const LIBRERIAS = /(jquery|bootstrap|modernizr|respond|knockout|moment|popper|select2|chosen|highcharts|kendo\.all)/i;

/** `<script src>` propios del portal, sin librerías conocidas. */
function scriptsDe(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const src = m[1];
    if (LIBRERIAS.test(src)) continue;
    if (src.startsWith('/')) out.add(src);
    else if (src.startsWith('http')) {
      try {
        const u = new URL(src);
        out.add(`${u.pathname}${u.search}`);
      } catch {
        /* src raro: se ignora */
      }
    }
  }
  return [...out];
}

/**
 * Extrae rutas `/Controlador/Accion` de un bundle JS. Aquí es donde viven los
 * endpoints que alimentan los grids, que no aparecen en el HTML.
 */
function endpointsDeJs(js: string): string[] {
  const out = new Set<string>();

  const anotar = (crudo: string) => {
    const url = crudo.split('#')[0];
    if (!url || url.length > 120 || ESTATICOS.test(url)) return;
    // Tiene que parecer una ruta: al menos un `/` interno, nada de `"url"` suelto.
    if (!url.includes('/')) return;
    out.add(url.startsWith('/') ? url : `/${url}`);
  };

  // Literales `/Controlador/Accion` con dos o más segmentos.
  for (const m of js.matchAll(/["'`](\/[A-Za-z][\w.-]*(?:\/[\w.-]+){1,4})["'`]/g)) anotar(m[1]);

  // `url: "..."` / `url = "..."` de jQuery y DataTables.
  for (const m of js.matchAll(/\burl\s*[:=]\s*["'`]([^"'`\s]+)["'`]/gi)) anotar(m[1]);

  // Primer argumento de los helpers de jQuery: $.get("Ctrl/Accion", …)
  for (const m of js.matchAll(/\$\.(?:get|post|getJSON|ajax|load)\s*\(\s*["'`]([^"'`\s]+)["'`]/g)) {
    anotar(m[1]);
  }

  // El portal construye TODAS sus llamadas como `rootDir + "Ctrl/Accion"`, sin
  // barra inicial. Sin este patrón no se ve ni uno solo de sus endpoints.
  for (const m of js.matchAll(/\brootDir\s*\+\s*["'`]([^"'`]+)["'`]/g)) anotar(m[1].split('?')[0]);

  return [...out];
}

function tablasDe(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/id=["']([^"']*(?:tabla|table|grid|Grid|List)[^"']*)["']/g)) out.add(m[1]);
  return [...out];
}

function esVisitable(ruta: string): boolean {
  if (!ruta.startsWith('/')) return false;
  if (ESTATICOS.test(ruta)) return false;
  if (RUTAS_PROHIBIDAS.test(ruta)) return false;
  return true;
}

// ──────────────────────────────── Main ───────────────────────────────────

async function main() {
  // Señal de vida inmediata: `npx tsx` tarda unos segundos en arrancar y sin
  // esto el script parece colgado antes de pedir nada.
  console.log('SIGERD — explorador de rutas (solo lectura)\n');

  const profundidadMax = Number(arg('profundidad') ?? 2);
  const maxPaginas = Number(arg('max') ?? 60);
  const prefijo = arg('salida') ?? 'sigerd-mapa';

  // Reutiliza la sesión de ~/.sigerd/ si sigue viva; solo pide clave si murió.
  const { cli, reutilizada } = await abrirSesion({
    usuario: arg('usuario'),
    perfil: Number(arg('perfil') ?? 0),
    forzar: tiene('forzar-login'),
    onEvento: (m) => console.log(`   ${m}`),
  });
  const perfil = cli.perfilActivo;
  if (reutilizada) console.log('✓ Sin pedir contraseña.');

  console.log(`✓ Sesión abierta. Cookies: ${Object.keys(cli.exportarSesion().cookies).join(', ')}`);
  console.log(`✓ Home del portal: ${cli.inicio}`);
  console.log(`\n→ Recorriendo el portal (solo GET, profundidad ${profundidadMax}, máx ${maxPaginas} páginas)…\n`);

  const visitadas = new Map<string, Pagina>();
  const descartadas = new Set<string>();
  // Arranca en la home real: `/` es la página de login, no sirve como semilla.
  const cola: Array<{ ruta: string; nivel: number }> = [{ ruta: cli.inicio, nivel: 0 }];

  while (cola.length && visitadas.size < maxPaginas) {
    const { ruta, nivel } = cola.shift()!;
    if (visitadas.has(ruta)) continue;

    let pagina: Pagina;
    try {
      const html = await cli.html(ruta);
      pagina = {
        ruta,
        titulo: titulo(html),
        bytes: html.length,
        formularios: formulariosDe(html),
        endpointsAjax: endpointsAjaxDe(html),
        scripts: scriptsDe(html),
        enlaces: enlacesDe(html),
        tablas: tablasDe(html),
      };
      console.log(
        `  ✓ ${ruta}  —  ${pagina.titulo}  (${pagina.bytes} B, ${pagina.enlaces.length} enlaces, ${pagina.scripts.length} scripts)`,
      );
    } catch (e) {
      const msg = e instanceof SigerdError ? `${e.codigo}: ${e.message}` : String(e);
      pagina = {
        ruta, titulo: '', bytes: 0, error: msg,
        formularios: [], endpointsAjax: [], scripts: [], enlaces: [], tablas: [],
      };
      console.log(`  ✗ ${ruta}  —  ${msg}`);

      if (e instanceof SigerdError && e.codigo === 'sesion-expirada') {
        // Volcamos el HTML crudo: sin verlo no se distingue "cookie caducada"
        // de "esta ruta simplemente devuelve el login".
        try {
          const crudo = await cli.fetch(ruta).then((r) => r.text());
          writeFileSync(`${prefijo}-sesion-caida.html`, crudo);
          console.log(`   ↳ HTML guardado en ${prefijo}-sesion-caida.html (${crudo.length} B)`);
        } catch {
          /* si ni eso responde, seguimos con el corte normal */
        }
        console.log('\n⚠ La sesión caducó a mitad del recorrido. Se corta aquí.');
        visitadas.set(ruta, pagina);
        break;
      }
    }

    visitadas.set(ruta, pagina);

    if (nivel < profundidadMax) {
      for (const href of pagina.enlaces) {
        if (visitadas.has(href) || cola.some((c) => c.ruta === href)) continue;
        if (!esVisitable(href)) {
          descartadas.add(href);
          continue;
        }
        cola.push({ ruta: href, nivel: nivel + 1 });
      }
    }

    await dormir(PAUSA_MS);
  }

  const paginas = [...visitadas.values()];
  const ajax = new Set<string>();
  paginas.forEach((p) => p.endpointsAjax.forEach((e) => ajax.add(e)));

  // ── Fase 2: los bundles JS ──
  // Los grids se llenan por AJAX desde código que vive en archivos .js, no en
  // el HTML. Sin escanearlos no aparece ni un endpoint de datos.
  const bundles = new Set<string>();
  paginas.forEach((p) => p.scripts.forEach((s) => bundles.add(s)));

  console.log(`\n→ Fase 2: escaneando ${bundles.size} bundles JS en busca de endpoints…\n`);

  const endpointsJs = new Map<string, string[]>(); // endpoint → bundles donde aparece
  for (const bundle of bundles) {
    try {
      const res = await cli.fetch(bundle);
      const js = await res.text();
      const hallados = endpointsDeJs(js);
      hallados.forEach((e) => {
        const previos = endpointsJs.get(e) ?? [];
        previos.push(bundle);
        endpointsJs.set(e, previos);
      });
      console.log(`  ✓ ${bundle.slice(0, 70)}  —  ${js.length} B, ${hallados.length} rutas`);
    } catch (e) {
      const msg = e instanceof SigerdError ? e.codigo : String(e);
      console.log(`  ✗ ${bundle.slice(0, 70)}  —  ${msg}`);
    }
    await dormir(PAUSA_MS);
  }

  const reporte = {
    generadoEn: new Date().toISOString(),
    // El reporte no lleva la cédula completa: describe el portal, no a la persona.
    usuario: perfil?.nombreRol ?? 'sesión activa',
    perfil: perfil ? { id: perfil.id, rol: perfil.nombreRol, centro: perfil.nombreCentro } : 'único',
    paginasVisitadas: paginas.length,
    paginas,
    endpointsAjaxUnicos: [...ajax].sort(),
    bundlesEscaneados: [...bundles].sort(),
    endpointsDesdeJs: Object.fromEntries([...endpointsJs.entries()].sort(([a], [b]) => a.localeCompare(b))),
    enlacesDescartadosPorSeguridad: [...descartadas].sort(),
  };

  writeFileSync(`${prefijo}.json`, JSON.stringify(reporte, null, 2));

  const md: string[] = [
    `# Mapa de SIGERD`,
    ``,
    `- Perfil: ${typeof reporte.perfil === 'string' ? reporte.perfil : `${reporte.perfil.rol} (${reporte.perfil.id})`}`,
    `- Páginas visitadas: ${paginas.length}`,
    `- Endpoints AJAX en HTML: ${ajax.size}`,
    `- Bundles JS escaneados: ${bundles.size}`,
    `- Rutas halladas en JS: ${endpointsJs.size}`,
    ``,
    `## Páginas`,
    ``,
  ];

  for (const p of paginas) {
    md.push(`### \`${p.ruta}\` — ${p.error ? `❌ ${p.error}` : p.titulo}`);
    if (p.formularios.length) {
      md.push('', 'Formularios:');
      p.formularios.forEach((f) =>
        md.push(`- \`${f.method} ${f.action || p.ruta}\` → campos: ${f.campos.join(', ') || '(ninguno)'}`),
      );
    }
    if (p.tablas.length) md.push('', `Tablas/grids: ${p.tablas.join(', ')}`);
    if (p.endpointsAjax.length) {
      md.push('', 'AJAX:');
      p.endpointsAjax.forEach((e) => md.push(`- \`${e}\``));
    }
    md.push('');
  }

  md.push(`## Endpoints AJAX hallados en HTML`, ``, ...[...ajax].sort().map((e) => `- \`${e}\``), ``);

  md.push(`## Rutas halladas en los bundles JS`, ``);
  md.push(`Estas son las candidatas a endpoints de datos de los grids.`, ``);
  for (const [endpoint, origenes] of [...endpointsJs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    md.push(`- \`${endpoint}\`  ←  ${origenes.length} bundle(s)`);
  }
  md.push('');

  md.push(
    `## Descartados por seguridad (no visitados)`,
    ``,
    ...[...descartadas].sort().map((e) => `- \`${e}\``),
  );

  writeFileSync(`${prefijo}.md`, md.join('\n'));

  console.log(
    `\n✓ ${paginas.length} páginas · ${ajax.size} AJAX en HTML · ${endpointsJs.size} rutas en JS · ${descartadas.size} descartados`,
  );
  console.log(`✓ Reporte: ${prefijo}.json  y  ${prefijo}.md`);

  // No se cierra: la sesión debe sobrevivir para la próxima corrida.
  guardarSesionArchivo(cli.exportarSesion());
  console.log('✓ Sesión conservada en ~/.sigerd/ (la próxima no pedirá contraseña).');
}

main().catch((e) => {
  if (e instanceof SigerdError) console.error(`\n✗ SigerdError[${e.codigo}] ${e.message}`);
  else console.error('\n✗', e);
  process.exit(1);
});
