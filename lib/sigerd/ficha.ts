/**
 * Ficha completa del estudiante en SIGERD.
 *
 * El grid de búsqueda solo devuelve 8 columnas. El resto del expediente —sexo,
 * nacionalidad, acta de nacimiento, dirección— vive en la ficha, que el portal
 * sirve como HTML parcial para meterlo en un modal:
 *
 *   `POST /modulo-registro/inscripcion/GetFichaEstudiante` con `{ idEstudiante }`
 *   (también acepta GET con el mismo parámetro en query string).
 *
 * No hay versión JSON, así que hay que parsear. El marcado es regular y usa el
 * atributo `for` del `<label>` como clave estable, que es lo que se aprovecha
 * aquí en vez de depender del texto visible (que lleva tildes y erratas del
 * propio portal, como "Seccion" y "Oficialia").
 *
 * DATOS SENSIBLES: esto es el expediente completo de un menor —dirección, acta
 * de nacimiento, teléfonos, tarjeta de subsidio—. Traer la ficha solo cuando de
 * verdad haga falta; el listado por sección ya basta para casi todo.
 */

import type { SigerdClient } from './client';
import { SigerdError } from './types';
import { aFechaISO } from './fechas';

const PAGINA_INSCRIPCION = '/modulo-registro/inscripcion';
const RUTA_FICHA = '/modulo-registro/inscripcion/GetFichaEstudiante';

/** Sexo normalizado a los valores que acepta `admin_escolar_estudiantes.sexo`. */
export type SexoNormalizado = 'masculino' | 'femenino' | 'otro' | null;

export interface FichaEstudianteSigerd {
  idSigerd: number;

  primerNombre: string | null;
  segundoNombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
  /** ISO `yyyy-MM-dd`. */
  fechaNacimiento: string | null;
  /** Texto tal cual del portal: "Mujer", "Hombre"… */
  sexo: string | null;
  /** El anterior mapeado a nuestro catálogo. */
  sexoNormalizado: SexoNormalizado;
  nacionalidad: string | null;
  estadoCivil: string | null;
  codigoRNE: string | null;

  telefono: string | null;
  celular: string | null;
  whatsapp: string | null;

  /** "Declarado", "No declarado"… */
  estadoActa: string | null;
  numeroActa: string | null;
  municipioJCE: string | null;
  oficialiaJCE: string | null;
  libro: string | null;
  folio: string | null;
  anioActa: string | null;

  provincia: string | null;
  municipio: string | null;
  distrito: string | null;
  seccion: string | null;
  barrio: string | null;
  subBarrio: string | null;
  direccion: string | null;

  programa: string | null;
  tarjetaSolidaridad: string | null;
  tarjetaSolidaridadFamiliar: string | null;

  /** Todo lo que el portal traía y no está mapeado arriba, por clave `for`. */
  extra: Record<string, string>;
}

/** Clave `for` del label → propiedad de la ficha. */
const MAPA: Record<string, keyof FichaEstudianteSigerd> = {
  lb_primerNombre: 'primerNombre',
  lb_segundoNombre: 'segundoNombre',
  lb_primerApellido: 'primerApellido',
  lb_segundoApellido: 'segundoApellido',
  FechaNacimiento: 'fechaNacimiento',
  genero: 'sexo',
  nacionalidadesEstudiante: 'nacionalidad',
  estadoCivil: 'estadoCivil',
  CodigoRNE: 'codigoRNE',
  telefono: 'telefono',
  celular: 'celular',
  whatsapp: 'whatsapp',
  estadoActaNacimiento: 'estadoActa',
  nroActa: 'numeroActa',
  MunicipioJCE: 'municipioJCE',
  OficinaJCE: 'oficialiaJCE',
  libro: 'libro',
  folio: 'folio',
  anio: 'anioActa',
  provincia: 'provincia',
  municipio: 'municipio',
  distrito: 'distrito',
  seccion: 'seccion',
  barrio: 'barrio',
  subBarrio: 'subBarrio',
  direccion: 'direccion',
  tipoEstudiante: 'programa',
  tarjetaSolidaridad: 'tarjetaSolidaridad',
  tarjetaSolidaridadFamiliar: 'tarjetaSolidaridadFamiliar',
};

function decodificar(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** El portal escribe "N/A" para lo que no tiene: se normaliza a `null`. */
function limpiar(valor: string): string | null {
  const v = valor.trim();
  if (!v || /^(n\/a|no aplica|-{1,2}|null)$/i.test(v)) return null;
  return v;
}

/** "Mujer"/"Hombre" → catálogo interno. Cualquier otra cosa queda en `otro`. */
export function normalizarSexo(sexo: string | null): SexoNormalizado {
  if (!sexo) return null;
  const s = sexo.trim().toLowerCase();
  if (/^(f|femenino|mujer|hembra)$/.test(s)) return 'femenino';
  if (/^(m|masculino|hombre|var[oó]n)$/.test(s)) return 'masculino';
  return 'otro';
}

/**
 * Extrae los pares etiqueta/valor de la ficha.
 *
 * El patrón del portal es `<label for="clave">Texto</label>` seguido de
 * `<div class="form-group">valor</div>`.
 */
export function parsearFicha(html: string, idSigerd: number): FichaEstudianteSigerd {
  const crudos: Record<string, string> = {};

  const re = /<label[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>\s*<div class="form-group">([\s\S]*?)<\/div>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    crudos[m[1]] = decodificar(m[3]);
  }

  if (!Object.keys(crudos).length) {
    throw new SigerdError(
      'respuesta-inesperada',
      `La ficha del estudiante ${idSigerd} no traía campos reconocibles (${html.length} B).`,
    );
  }

  const ficha = {
    idSigerd,
    extra: {} as Record<string, string>,
  } as FichaEstudianteSigerd;

  for (const [clave, valor] of Object.entries(crudos)) {
    const prop = MAPA[clave];
    if (prop) {
      (ficha as unknown as Record<string, unknown>)[prop] = limpiar(valor);
    } else {
      const v = limpiar(valor);
      if (v) ficha.extra[clave] = v;
    }
  }

  // La fecha llega en dd/MM/yyyy como en el resto del portal.
  ficha.fechaNacimiento = aFechaISO(ficha.fechaNacimiento);
  ficha.sexoNormalizado = normalizarSexo(ficha.sexo);

  return ficha;
}

/** Descarga y parsea la ficha de un estudiante. */
export async function traerFichaEstudiante(
  cli: SigerdClient,
  idEstudiante: number,
  opts: { precargar?: boolean } = {},
): Promise<FichaEstudianteSigerd> {
  if (opts.precargar !== false) await cli.abrirModulo(PAGINA_INSCRIPCION);

  const html = await cli.html(RUTA_FICHA, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({ idEstudiante: String(idEstudiante) }).toString(),
  });

  return parsearFicha(html, idEstudiante);
}
