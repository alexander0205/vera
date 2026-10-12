/**
 * Ejecuta una consulta real contra SIGERD y muestra la forma de la respuesta.
 *
 * Sirve para validar los contratos de `lib/sigerd/consultas.ts` sin pasar por
 * la app.
 *
 * SESIÓN: la primera corrida pide la contraseña; las siguientes reutilizan la
 * sesión guardada en `~/.sigerd/` y no piden nada. La contraseña NUNCA se
 * guarda — solo las cookies del portal, cifradas y con permisos 0600. Cuando
 * la sesión caduca, se vuelve a pedir.
 *
 *   npx tsx scripts/sigerd-consulta.ts --usuario=00000000000 --apellido=perez
 *   npx tsx scripts/sigerd-consulta.ts --cerrar          # invalida la guardada
 *   npx tsx scripts/sigerd-consulta.ts --forzar-login    # ignora la guardada
 *
 * Consultas:
 *   --apellido=X                 busca estudiantes por primer apellido
 *   --nombres=X                  busca estudiantes por nombres
 *   --rne=X                      busca por RNE
 *   --catalogo=servicios --idCentro=N
 *   --catalogo=grados    --idServicioCentro=N
 *   --catalogo=secciones --idServicioCentro=N --idTipoPeriodo=N
 *   --catalogo=anios     --idServicioCentro=N
 *
 * PRIVACIDAD: por defecto enmascara los valores y solo muestra los nombres y
 * tipos de columna, que es lo que hace falta para tipar. Con `--crudo` imprime
 * los datos tal cual — son expedientes de estudiantes, casi siempre menores.
 */

import { writeFileSync } from 'fs';
import { SigerdClient } from '../lib/sigerd/client';
import { abrirSesion } from '../lib/sigerd/cli-sesion';
import { borrarSesionArchivo, guardarSesionArchivo, leerSesionArchivo } from '../lib/sigerd/sesion-archivo';
import { SigerdError } from '../lib/sigerd/types';
import {
  aniosAcademicos,
  buscarEstudiantes,
  estudiantesPorSeccion,
  seccionesPorServicio,
  serviciosPorCentro,
  tiposPeriodosPorServicio,
} from '../lib/sigerd/consultas';

function arg(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=');
}
const tiene = (nombre: string) => process.argv.includes(`--${nombre}`);

/** Sustituye el valor por su tipo y longitud: suficiente para tipar, sin exponer a nadie. */
function enmascarar(valor: unknown): string {
  if (valor === null) return 'null';
  if (valor === undefined) return 'undefined';
  if (typeof valor === 'number') return `number(${String(valor).length} díg)`;
  if (typeof valor === 'boolean') return `boolean(${valor})`;
  if (typeof valor === 'string') {
    if (valor === '') return 'string(vacío)';
    if (/^\/Date\(/.test(valor)) return `string(fecha .NET: ${valor})`;
    return `string(${valor.length} chars)`;
  }
  return `${typeof valor}`;
}

function mostrarFilas(filas: Record<string, unknown>[], crudo: boolean): void {
  if (!filas.length) {
    console.log('  (sin resultados)');
    return;
  }

  const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))];
  console.log(`\n  Columnas (${columnas.length}):`);
  for (const c of columnas) {
    const muestra = filas.find((f) => f[c] !== null && f[c] !== undefined)?.[c];
    console.log(`    ${c.padEnd(28)} ${crudo ? JSON.stringify(muestra) : enmascarar(muestra)}`);
  }

  if (crudo) {
    console.log('\n  Filas:');
    console.log(JSON.stringify(filas, null, 2));
  }
}

const RUTA_GRID = '/modulo-registro/inscripcion/lista-estudiantes-json';
const PAGINA_INSCRIPCION = '/modulo-registro/inscripcion';

/**
 * Prueba varias formas de cuerpo contra el endpoint del grid hasta dar con la
 * que acepta. El portal devuelve 500 con su página de error genérica, que no
 * dice nada útil: la única salida es comparar variantes.
 *
 * Todas son de LECTURA — el mismo endpoint que llena la tabla en pantalla.
 */
async function diagnosticar(cli: SigerdClient, apellido: string, idCentro: number): Promise<void> {
  const log: string[] = [];
  const linea = (s = '') => {
    console.log(s);
    log.push(s);
  };

  /** Dispara una petición y resume el resultado en una línea comparable. */
  const probar = async (
    etiqueta: string,
    ruta: string,
    opts: { metodo?: 'GET' | 'POST'; body?: Record<string, string>; ajax?: boolean; referer?: string } = {},
  ) => {
    const metodo = opts.metodo ?? 'POST';
    const params = opts.body ? new URLSearchParams(opts.body).toString() : '';
    const url = metodo === 'GET' && params ? `${ruta}?${params}` : ruta;

    try {
      const res = await cli.fetch(url, {
        method: metodo,
        headers: {
          ...(metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
          ...(opts.ajax === false ? {} : { 'X-Requested-With': 'XMLHttpRequest' }),
          ...(opts.referer ? { Referer: `https://sigerd.minerd.gob.do${opts.referer}` } : {}),
        },
        body: metodo === 'POST' ? params : undefined,
      });

      const cuerpo = await res.text();
      let veredicto: string;
      try {
        const json = JSON.parse(cuerpo);
        if (Array.isArray(json)) {
          veredicto = `✓ JSON array (${json.length}) · claves: ${Object.keys(json[0] ?? {}).join(',') || '—'}`;
        } else if (Array.isArray(json?.rows)) {
          veredicto = `✓ JSON grid total=${json.total} filas=${json.rows.length} · claves: ${Object.keys(json.rows[0] ?? {}).join(',') || '—'}`;
        } else {
          veredicto = `✓ JSON ${JSON.stringify(json).slice(0, 90)}`;
        }
      } catch {
        veredicto = /Error en sistema/i.test(cuerpo)
          ? '✗ página de error del portal'
          : `✗ no-JSON (${cuerpo.length} B) ${cuerpo.slice(0, 60).replace(/\s+/g, ' ')}`;
      }

      linea(`  ${etiqueta.padEnd(46)} HTTP ${res.status}  ${veredicto}`);
    } catch (e) {
      linea(`  ${etiqueta.padEnd(46)} ERROR  ${e instanceof SigerdError ? e.codigo : e}`);
    }

    await new Promise((r) => setTimeout(r, 300));
  };

  linea(`\n→ Abriendo ${PAGINA_INSCRIPCION} para que el portal arme su estado…`);
  await cli.abrirModulo(PAGINA_INSCRIPCION);

  // ── Catálogos sin parámetros: si estos fallan, el problema no son los filtros ──
  linea('\n── Catálogos sin parámetros ──');
  for (const c of ['niveles', 'modalidades', 'sectores', 'grados', 'centros', 'estados-inscripcion']) {
    await probar(c, `/ModuloReportes/Estudiantes/${c}`);
  }

  // ── Catálogos con parámetros: cuerpo vs. ruta ──
  linea(`\n── Servicios del centro ${idCentro}: cuerpo vs. ruta ──`);
  await probar('POST cuerpo {id, idAnoAcademico}', '/commons/servicios/servicios-por-idcentro', {
    body: { id: String(idCentro), idAnoAcademico: '0' },
  });
  await probar('POST ruta /{centro}/0', `/commons/servicios/servicios-por-idcentro/${idCentro}/0`);
  await probar('GET  ruta /{centro}/0', `/commons/servicios/servicios-por-idcentro/${idCentro}/0`, {
    metodo: 'GET',
  });
  await probar('GET  query ?id=&idAnoAcademico=', '/commons/servicios/servicios-por-idcentro', {
    metodo: 'GET',
    body: { id: String(idCentro), idAnoAcademico: '0' },
  });

  linea('\n── Grid de estudiantes ──');

  const filtros = {
    nombres: '',
    primerApellido: apellido,
    segundoApellido: '',
    rne: '',
    nui: '',
    fechaNacimiento: '',
    idEstudiante: '',
  };
  const paginacion = { current: '1', rowCount: '10', searchPhrase: '' };
  const ref = { referer: PAGINA_INSCRIPCION };

  await probar('A · como lo mandamos hoy', RUTA_GRID, { body: { ...filtros, ...paginacion }, ...ref });
  await probar('B · + sort[Nombres]=asc', RUTA_GRID, {
    body: { ...filtros, ...paginacion, 'sort[Nombres]': 'asc' },
    ...ref,
  });
  await probar('C · + sort[PrimerApellido]=asc', RUTA_GRID, {
    body: { ...filtros, ...paginacion, 'sort[PrimerApellido]': 'asc' },
    ...ref,
  });
  await probar('D · solo filtros, sin paginacion', RUTA_GRID, { body: { ...filtros }, ...ref });
  await probar('E · solo paginacion, sin filtros', RUTA_GRID, { body: { ...paginacion }, ...ref });
  await probar('F · rowCount=-1 (todo)', RUTA_GRID, {
    body: { ...filtros, ...paginacion, rowCount: '-1' },
    ...ref,
  });
  await probar('G · sin X-Requested-With', RUTA_GRID, {
    body: { ...filtros, ...paginacion },
    ajax: false,
    ...ref,
  });
  await probar('H · GET con query string', RUTA_GRID, {
    metodo: 'GET',
    body: { ...filtros, ...paginacion },
    ...ref,
  });
  await probar('I · sin Referer', RUTA_GRID, { body: { ...filtros, ...paginacion } });

  writeFileSync('sigerd-diagnostico.txt', log.join('\n'));
  linea('\n✓ Diagnostico guardado en sigerd-diagnostico.txt');
}

async function main() {
  console.log('SIGERD — consulta real\n');

  const crudo = tiene('crudo');

  // Cierra la sesión guardada y sale: única forma de invalidarla al instante.
  if (tiene('cerrar')) {
    const guardada = leerSesionArchivo();
    if (guardada) await SigerdClient.desdeSesion(guardada).cerrarSesion();
    borrarSesionArchivo();
    console.log('✓ Sesión cerrada y borrada de ~/.sigerd/');
    return;
  }

  const { cli, reutilizada } = await abrirSesion({
    usuario: arg('usuario'),
    perfil: Number(arg('perfil') ?? 0),
    forzar: tiene('forzar-login'),
    onEvento: (m) => console.log(`   ${m}`),
  });
  console.log(`✓ Home: ${cli.inicio}${reutilizada ? '  (sin pedir contraseña)' : ''}`);

  /** Guarda las cookies rotadas. NO cierra: la sesión debe sobrevivir al script. */
  const conservar = () => {
    guardarSesionArchivo(cli.exportarSesion());
    console.log('\n✓ Sesión conservada. Próxima corrida no pedirá contraseña.');
  };

  if (tiene('diagnostico')) {
    await diagnosticar(cli, arg('apellido') ?? 'perez', Number(arg('idCentro') ?? 5807));
    conservar();
    return;
  }

  const seccion = Number(arg('seccion') ?? 0);
  const catalogo = arg('catalogo');

  try {
    if (seccion) {
      const idCentro = Number(arg('idCentro') ?? 5807);
      console.log(`\n→ Estudiantes de la sección ${seccion} (centro ${idCentro})…`);
      const filas = await estudiantesPorSeccion(cli, { idCentro, idSeccion: seccion });
      console.log(`✓ ${filas.length} estudiante(s)`);
      mostrarFilas(filas as unknown as Record<string, unknown>[], crudo);
      conservar();
      return;
    }

    if (catalogo) {
      const idCentro = Number(arg('idCentro') ?? 0);
      const idServicioCentro = Number(arg('idServicioCentro') ?? 0);
      const idTipoPeriodo = Number(arg('idTipoPeriodo') ?? 0);

      console.log(`\n→ Catálogo: ${catalogo}`);
      let datos: unknown;
      switch (catalogo) {
        case 'servicios':
          datos = await serviciosPorCentro(cli, { idCentro });
          break;
        case 'grados':
          datos = await tiposPeriodosPorServicio(cli, { idServicioCentro });
          break;
        case 'secciones':
          datos = await seccionesPorServicio(cli, { idServicioCentro, idTipoPeriodo });
          break;
        case 'anios':
          datos = await aniosAcademicos(cli, idServicioCentro);
          break;
        default:
          console.error(`✗ Catálogo desconocido: ${catalogo}`);
          process.exit(1);
      }

      const filas = Array.isArray(datos) ? (datos as Record<string, unknown>[]) : [datos as Record<string, unknown>];
      console.log(`✓ ${filas.length} registro(s)`);
      mostrarFilas(filas, crudo);
    } else {
      const filtros = {
        primerApellido: arg('apellido'),
        nombres: arg('nombres'),
        rne: arg('rne'),
        porPagina: Number(arg('porPagina') ?? 10),
      };

      if (!filtros.primerApellido && !filtros.nombres && !filtros.rne) {
        console.error('\n✗ SIGERD exige al menos un criterio: usa --apellido=, --nombres= o --rne=');
        process.exit(1);
      }

      console.log(`\n→ Buscando estudiantes…`);
      const r = await buscarEstudiantes(cli, filtros);
      console.log(`✓ total=${r.total}  filas=${r.rows?.length ?? 0}  pagina=${r.current}`);
      mostrarFilas(r.rows ?? [], crudo);

      // Control: un apellido imposible. Si devuelve el mismo total, el portal
      // está ignorando los filtros y lo que vemos es el padrón entero.
      const control = await buscarEstudiantes(cli, {
        primerApellido: 'zzqxwv',
        porPagina: 1,
        precargar: false,
      });
      console.log(`\n  control (apellido imposible): total=${control.total}`);
      console.log(
        control.total === r.total
          ? '  ⚠ MISMO TOTAL → el portal ignora los filtros que enviamos.'
          : '  ✓ totales distintos → los filtros sí se aplican.',
      );

      const informe = [
        `busqueda: ${JSON.stringify(filtros)}`,
        `total=${r.total} filas=${r.rows?.length ?? 0}`,
        `columnas: ${[...new Set((r.rows ?? []).flatMap((f) => Object.keys(f)))].join(', ')}`,
        `control apellido imposible: total=${control.total}`,
        control.total === r.total ? 'VEREDICTO: filtros IGNORADOS' : 'VEREDICTO: filtros aplicados',
        '',
        'muestra enmascarada de la primera fila:',
        ...Object.entries(r.rows?.[0] ?? {}).map(([k, v]) => `  ${k}: ${enmascarar(v)}`),
      ].join('\n');

      writeFileSync('sigerd-consulta.txt', informe);
      console.log('\n✓ Informe en sigerd-consulta.txt');
    }
  } catch (e) {
    // Sin ver lo que devolvió el portal no se distingue "cookie caducada" de
    // "esta acción responde otra cosa". Se vuelca antes de cerrar la sesión.
    console.error(`\n✗ Falló la consulta: ${e instanceof SigerdError ? `${e.codigo} — ${e.message}` : e}`);

    if (e instanceof SigerdError && (e.codigo === 'sesion-expirada' || e.codigo === 'respuesta-inesperada')) {
      try {
        const res = await cli.fetch('/modulo-registro/inscripcion/lista-estudiantes-json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: 'current=1&rowCount=10',
        });
        const cuerpo = await res.text();
        writeFileSync('sigerd-respuesta-cruda.html', cuerpo);
        console.error(
          `   ↳ HTTP ${res.status}, ${cuerpo.length} B guardados en sigerd-respuesta-cruda.html`,
        );
        console.error(`   ↳ primeros 300 caracteres:\n${cuerpo.slice(0, 300)}`);
      } catch (e2) {
        console.error(`   ↳ no se pudo volcar la respuesta: ${e2}`);
      }
    }

    process.exitCode = 1;
  } finally {
    conservar();
  }
}

main().catch((e) => {
  if (e instanceof SigerdError) console.error(`\n✗ SigerdError[${e.codigo}] ${e.message}`);
  else console.error('\n✗', e);
  process.exit(1);
});
