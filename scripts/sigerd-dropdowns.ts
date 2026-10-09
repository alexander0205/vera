/**
 * Extrae los datos de todos los desplegables de una página de SIGERD.
 *
 * Dos fuentes, porque el portal usa las dos:
 *  1. Los `<select>` que vienen ya rellenos en el HTML (regional, año académico…).
 *  2. La cascada AJAX que se dispara al elegir: centro → servicios → grados →
 *     secciones, más las condiciones académicas por servicio y grado.
 *
 * Usa la sesión guardada en `~/.sigerd/`; si caducó, pide la contraseña.
 *
 *   npx tsx scripts/sigerd-dropdowns.ts --idCentro=5807
 *
 * Opciones:
 *   --pagina=/ruta   página a analizar (por defecto condición académica)
 *   --idCentro=N     centro para recorrer la cascada
 *   --salida=nombre  prefijo de los archivos generados
 */

import { writeFileSync } from 'fs';
import { abrirSesion } from '../lib/sigerd/cli-sesion';
import { guardarSesionArchivo } from '../lib/sigerd/sesion-archivo';
import { SigerdError } from '../lib/sigerd/types';
import type { SigerdClient } from '../lib/sigerd/client';

const PAGINA_POR_DEFECTO = '/modulo-registro/inscripcion/condicion-academica';

function arg(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=');
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Opcion {
  value: string;
  texto: string;
  seleccionada: boolean;
}

/** Decodifica las entidades HTML que el portal escupe (`&#243;` → `ó`). */
function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .trim();
}

/** Saca cada `<select>` de la página con sus `<option>`. */
function selectsDe(html: string): Record<string, Opcion[]> {
  const out: Record<string, Opcion[]> = {};

  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const attrs = m[1];
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1] ?? attrs.match(/\bname=["']([^"']+)["']/i)?.[1];
    if (!id) continue;

    const opciones: Opcion[] = [];
    for (const o of m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      opciones.push({
        value: o[1].match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? '',
        texto: decodificar(o[2].replace(/<[^>]+>/g, ' ')),
        seleccionada: /\bselected\b/i.test(o[1]),
      });
    }
    out[id] = opciones;
  }

  return out;
}

async function main() {
  console.log('SIGERD — datos de desplegables\n');

  const pagina = arg('pagina') ?? PAGINA_POR_DEFECTO;
  const prefijo = arg('salida') ?? 'sigerd-dropdowns';

  const { cli, reutilizada } = await abrirSesion({ onEvento: (m) => console.log(`   ${m}`) });
  if (reutilizada) console.log('✓ Sesión reutilizada, sin pedir contraseña.');

  // ── 1. Desplegables ya rellenos en el HTML ──
  console.log(`\n→ Abriendo ${pagina}`);
  const html = await cli.html(pagina);
  const estaticos = selectsDe(html);

  console.log(`\n── Desplegables en el HTML (${Object.keys(estaticos).length}) ──`);
  for (const [id, opciones] of Object.entries(estaticos)) {
    const marcada = opciones.find((o) => o.seleccionada);
    console.log(`  #${id.padEnd(24)} ${opciones.length} opción(es)${marcada ? `  · sel: ${marcada.texto}` : ''}`);
  }

  // ── 2. Cascada AJAX ──
  // El año académico también sale de la página: se toma el último salvo que se indique.
  const anios = (estaticos['anoAcademico'] ?? []).filter((o) => /^\d+$/.test(o.value));
  const idAnoAcademico = Number(arg('anio') ?? anios[anios.length - 1]?.value ?? 0);
  console.log(`\n→ Año académico: ${idAnoAcademico} (${anios.find((a) => a.value === String(idAnoAcademico))?.texto ?? '?'})`);

  const cascada: Record<string, unknown> = { idAnoAcademico };

  // Para un Digitador el portal ya deja `#servicios` relleno: no hace falta
  // pedir el centro. Solo se consulta por centro si la página no los trae.
  const serviciosPagina = (estaticos['servicios'] ?? [])
    .filter((o) => /^\d+$/.test(o.value) && o.value !== '-99')
    .map((o) => ({ Id: Number(o.value), Nombre: o.texto }));

  const idCentro = Number(arg('idCentro') ?? 0) || inferirCentro(estaticos);

  if (serviciosPagina.length) {
    console.log(`\n── Cascada AJAX desde los ${serviciosPagina.length} servicios de la página ──`);
    cascada.servicios = await recorrer(cli, serviciosPagina, idAnoAcademico, pagina);
  } else if (idCentro) {
    console.log(`\n── Cascada AJAX para el centro ${idCentro} ──`);
    cascada.centro = idCentro;
    const servicios = await cli.postForm<Array<{ Id: number; Nombre: string }>>(
      '/commons/servicios/servicios-por-idcentro',
      { id: idCentro, idAnoAcademico },
      { referer: pagina },
    );
    cascada.servicios = await recorrer(cli, servicios, idAnoAcademico, pagina);
  } else {
    console.log('\n⚠ Ni servicios en la página ni centro: pasa --idCentro=N.');
  }

  const reporte = { pagina, generadoEn: new Date().toISOString(), estaticos, cascada };
  writeFileSync(`${prefijo}.json`, JSON.stringify(reporte, null, 2));
  console.log(`\n✓ Todo en ${prefijo}.json`);

  guardarSesionArchivo(cli.exportarSesion());
}

/** Si el portal ya dejó un centro seleccionado, lo usamos. */
function inferirCentro(estaticos: Record<string, Opcion[]>): number {
  const centros = estaticos['centros'] ?? [];
  const sel = centros.find((o) => o.seleccionada && /^\d+$/.test(o.value));
  if (sel) return Number(sel.value);

  const primero = centros.find((o) => /^\d+$/.test(o.value) && o.value !== '-99');
  return primero ? Number(primero.value) : 0;
}

/** servicios → grados → (secciones, condiciones académicas). */
async function recorrer(
  cli: SigerdClient,
  servicios: Array<{ Id: number; Nombre: string }>,
  idAnoAcademico: number,
  referer: string,
) {
  const post = <T>(ruta: string, campos: Record<string, string | number>) =>
    cli.postForm<T>(ruta, campos, { referer });

  const salida = [];
  for (const s of servicios) {
    console.log(`\n  ▸ servicio ${s.Id} — ${s.Nombre}`);
    const nodo: Record<string, unknown> = { ...s };

    try {
      const grados = await post<Array<{ Id: number; Nombre: string }>>(
        '/commons/tiposperiodos/tipos-periodos-por-servicioscentro-condicion-academica',
        { idServicioCentro: s.Id },
      );
      console.log(`      grados: ${grados.length}`);
      await dormir(250);

      const detalle = [];
      for (const g of grados) {
        const item: Record<string, unknown> = { ...g };

        try {
          item.secciones = await post('/commons/secciones/secciones-por-idserviciocentro-idtipoperiodo', {
            idServicioCentro: s.Id,
            idTipoPeriodo: g.Id,
            idAnoAcademico,
          });
        } catch (e) {
          item.secciones = `error: ${e instanceof SigerdError ? e.codigo : e}`;
        }
        await dormir(250);

        try {
          item.condicionesAcademicas = await post(
            `/modulo-registro/inscripcion/GetCondicionesAcademicasXNivel?idServicioCentro=${s.Id}&idGrado=${g.Id}`,
            {},
          );
        } catch (e) {
          item.condicionesAcademicas = `error: ${e instanceof SigerdError ? e.codigo : e}`;
        }
        await dormir(250);

        const nSec = Array.isArray(item.secciones) ? item.secciones.length : '?';
        const nCond = Array.isArray(item.condicionesAcademicas) ? item.condicionesAcademicas.length : '?';
        console.log(`        · ${String(g.Nombre).padEnd(28)} secciones=${nSec}  condiciones=${nCond}`);

        detalle.push(item);
      }
      nodo.grados = detalle;
    } catch (e) {
      nodo.grados = `error: ${e instanceof SigerdError ? e.codigo : e}`;
      console.log(`      ✗ ${e instanceof SigerdError ? e.codigo : e}`);
    }

    salida.push(nodo);
  }

  return salida;
}

main().catch((e) => {
  if (e instanceof SigerdError) console.error(`\n✗ SigerdError[${e.codigo}] ${e.message}`);
  else console.error('\n✗', e);
  process.exit(1);
});
