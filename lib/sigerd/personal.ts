/**
 * Personal (empleados) de SIGERD — solo lectura.
 *
 * El grid vive en `/modulo-registro/FichaPersonal/ListaPersonal` y se sirve por
 * `POST /FichaPersonal/grid-ficha` con los filtros en query string.
 *
 * ⚠️ EL FILTRO POR CENTRO SOLO FUNCIONA CON EL TRÍO COMPLETO.
 * Verificado: pasar `IdCentro=5807` con `IdRegional=-1`/`IdDistrito=-1` NO
 * filtra — el servidor devuelve el padrón NACIONAL (≈295 657 empleados, cada
 * uno con su cédula). Solo cuando van los tres ids reales (regional, distrito,
 * centro) el grid acota al centro (27 filas en la prueba). Además el grid
 * ignora `sort` y `searchPhrase`, y su paginación no es estable entre páginas
 * sin un centro fijado, así que NUNCA se debe paginar el grid "en abierto".
 *
 * Por eso este módulo EXIGE el trío del centro y no expone forma de consultar
 * sin él. El trío se obtiene de `contextoCentroSesion`, que lo lee del HTML de
 * sesión del propio Digitador —no se adivina—.
 */

import type { SigerdClient } from './client';
import { SigerdError } from './types';

const PAGINA_PERSONAL = '/modulo-registro/FichaPersonal/ListaPersonal';
const RUTA_GRID = '/FichaPersonal/grid-ficha';

/** Centro al que está atada la sesión, leído de los hidden inputs de la página. */
export interface ContextoCentro {
  idRegional: number;
  idDistrito: number;
  idCentro: number;
  /** Cédula del usuario de la sesión (del hidden `userName`). */
  usuario: string | null;
  /** Nivel del claim de sesión (hidden `Nivel`), por si hace falta. */
  nivel: string | null;
}

/** Un empleado tal como lo devuelve el grid. */
export interface EmpleadoSigerd {
  Id: number;
  NombreCompleto: string;
  Cedula: string;
  IdCargo: number;
  Cargo: string;
  Estado: string;
  Distrito: string;
  Centro: string;
  IdCentro: number;
  IdDistrito: number;
  IdRegional: number;
}

/** Un puesto del catálogo `obtenerPuestos`. */
export interface PuestoSigerd {
  Id: number;
  Nombre: string;
  Descripcion: string;
}

export interface FiltrosPersonal {
  /** Id de cargo (ver `catalogoPuestos`). Omitir = todos. */
  idCargo?: number;
  /** Filtro por nombre. El grid lo aplica del lado servidor. */
  nombre?: string;
  /** Filtro por cédula. */
  cedula?: string;
}

/**
 * Lee el trío regional/distrito/centro de la sesión desde el HTML de la página
 * de personal. El portal lo inyecta en hidden inputs (`#regional`, `#distritos`,
 * `#centros`) para su propio JavaScript.
 */
export async function contextoCentroSesion(cli: SigerdClient): Promise<ContextoCentro> {
  const html = await cli.html(PAGINA_PERSONAL);

  const hidden = (id: string): string | null => {
    // Los inputs pueden tener los atributos en cualquier orden.
    const re = new RegExp(`<input[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    return tag?.match(/\bvalue=["']([^"']*)["']/i)?.[1]?.trim() ?? null;
  };

  const idRegional = Number(hidden('regional'));
  const idDistrito = Number(hidden('distritos'));
  const idCentro = Number(hidden('centros'));

  if (!idRegional || !idDistrito || !idCentro) {
    throw new SigerdError(
      'respuesta-inesperada',
      'No se encontró el centro de la sesión en la página de personal ' +
        `(regional=${idRegional}, distrito=${idDistrito}, centro=${idCentro}). ` +
        'Sin el trío completo el grid devolvería el padrón nacional, así que se aborta.',
    );
  }

  return {
    idRegional,
    idDistrito,
    idCentro,
    usuario: hidden('userName'),
    nivel: hidden('Nivel'),
  };
}

/**
 * Personal de UN centro. El `ctx` debe venir de `contextoCentroSesion`.
 *
 * Se pide todo el centro de una vez (`rowCount` alto): un centro tiene decenas
 * de empleados, no miles, y la paginación de este grid no es de fiar.
 */
export async function personalDeCentro(
  cli: SigerdClient,
  ctx: ContextoCentro,
  filtros: FiltrosPersonal = {},
): Promise<EmpleadoSigerd[]> {
  await cli.abrirModulo(PAGINA_PERSONAL);

  const qs = new URLSearchParams({
    IdRegional: String(ctx.idRegional),
    IdDistrito: String(ctx.idDistrito),
    IdCentro: String(ctx.idCentro),
    bCargoPersona: filtros.idCargo ? String(filtros.idCargo) : '-1',
    bEstadoPersona: '-1',
    bNombrePersona: filtros.nombre?.trim() || '-1',
    bCedulaPersona: filtros.cedula?.trim() || '-1',
  });

  const res = await cli.fetch(`${RUTA_GRID}?${qs}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({
      current: '1',
      rowCount: '2000',
      searchPhrase: '',
      'sort[NombreCompleto]': 'asc',
    }).toString(),
  });

  const cuerpo = await res.text();
  let json: { rows?: EmpleadoSigerd[] };
  try {
    json = JSON.parse(cuerpo);
  } catch {
    throw new SigerdError('respuesta-inesperada', `grid-ficha no devolvió JSON (HTTP ${res.status}).`, res.status);
  }

  const filas = json.rows ?? [];

  // Cinturón de seguridad: si por lo que sea colara una fila de otro centro,
  // se descarta. Nunca debe salir de aquí personal ajeno al centro pedido.
  const delCentro = filas.filter((e) => Number(e.IdCentro) === ctx.idCentro);

  if (filas.length && !delCentro.length) {
    throw new SigerdError(
      'respuesta-inesperada',
      'El grid de personal devolvió filas pero ninguna del centro de la sesión: ' +
        'el filtro por trío no está aplicando. Se aborta para no exponer el padrón nacional.',
    );
  }

  return delCentro;
}

/**
 * Catálogo de puestos/cargos. `POST /modulo-registro/FichaPersonal/obtenerPuestos`
 * → 168 cargos `{ Id, Nombre, Descripcion }`. Sin datos personales.
 */
export async function catalogoPuestos(cli: SigerdClient): Promise<PuestoSigerd[]> {
  return cli.postForm<PuestoSigerd[]>(
    '/modulo-registro/FichaPersonal/obtenerPuestos',
    {},
    { referer: PAGINA_PERSONAL },
  );
}
