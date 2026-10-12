/**
 * Ficha de un empleado (personal) en SIGERD.
 *
 *   `GET /modulo-registro/FichaPersonal/EditarFicha?IdPersona=<id>`  → HTML.
 *
 * QUÉ TRAE Y QUÉ NO (verificado sobre empleados reales):
 * El formulario de edición sirve como readonly INPUTS los datos de identidad —
 * cédula, nombres, sexo, fecha de nacimiento, nacionalidad, contacto—. Pero los
 * DESPLEGABLES (cargo, condición laboral, provincia/municipio/dirección,
 * títulos académicos) llegan SIN seleccionar (`Seleccione…`): esos datos NO
 * están en el HTML estático, los cargaría una llamada aparte de la página real.
 *
 * Por eso esta ficha se queda con lo fiable (identidad + contacto) y el cargo /
 * estado se toman del GRID (`personalDeCentro`), que sí los trae. La dirección y
 * los títulos quedan fuera hasta reversar el endpoint de datos que los llena.
 *
 * SOLO LECTURA — no se hace ningún guardado. DATOS SENSIBLES: cédula, contacto.
 */

import type { SigerdClient } from './client';
import { SigerdError } from './types';

const PAGINA_PERSONAL = '/modulo-registro/FichaPersonal/ListaPersonal';

export interface FichaPersonalSigerd {
  idPersona: number;
  cedula: string | null;
  primerNombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
  sexo: string | null;
  /** ISO yyyy-MM-dd (mejor esfuerzo — ver `fechaNacimientoRaw`). */
  fechaNacimiento: string | null;
  /** Valor crudo del portal, formato .NET `M/d/yyyy h:mm:ss a.m.`. */
  fechaNacimientoRaw: string | null;
  nacionalidad: string | null;
  numeroPasaporte: string | null;
  telefono: string | null;
  movil: string | null;
  email: string | null;
}

/** input id → propiedad. Todo el detalle fiable llega como readonly input. */
const INPUTS: Record<string, keyof FichaPersonalSigerd> = {
  Cedula: 'cedula',
  PrimerNombre: 'primerNombre',
  PrimerApellido: 'primerApellido',
  SegundoApellido: 'segundoApellido',
  Sexo: 'sexo',
  Nacionalidad: 'nacionalidad',
  NumeroPasaporte: 'numeroPasaporte',
  Telefono: 'telefono',
  Movil: 'movil',
  Email: 'email',
};

function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function limpiar(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s || /^(n\/a|no aplica|no definido|-{1,2}|null|seleccione.*)$/i.test(s)) return null;
  return s;
}

/** value de `<input id="X" … value="Y">`, con los atributos en cualquier orden. */
function valorInput(html: string, id: string): string | null {
  const tag = html.match(new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`, 'i'))?.[0];
  if (!tag) return null;
  const v = tag.match(/\bvalue="([^"]*)"/i)?.[1];
  return v != null ? decodificar(v) : null;
}

/**
 * Fecha de la ficha de personal: `d/M/yyyy h:mm:ss a.m.` (.NET ToString crudo).
 * Se descarta la hora y se arma ISO. El orden es DÍA/mes — verificado: aparecen
 * primeros grupos >12 (ej. `17/09/`), imposibles como mes, así que el primer
 * grupo es el día, igual que el `dd/MM/yyyy` del resto del portal. Se guarda
 * también el crudo (`fechaNacimientoRaw`) para no perder nada.
 */
export function fechaPersonalISO(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, dia, mes, anio] = m;
  const mm = mes.padStart(2, '0');
  const dd = dia.padStart(2, '0');
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${anio}-${mm}-${dd}`;
}

export function parsearFichaPersonal(html: string, idPersona: number): FichaPersonalSigerd {
  const ficha = { idPersona } as FichaPersonalSigerd;

  let mapeado = 0;
  for (const [id, prop] of Object.entries(INPUTS)) {
    const v = limpiar(valorInput(html, id));
    (ficha as unknown as Record<string, unknown>)[prop] = v;
    if (v) mapeado++;
  }

  const fRaw = valorInput(html, 'FechaNacimiento');
  ficha.fechaNacimientoRaw = fRaw && fRaw.trim() ? fRaw.trim() : null;
  ficha.fechaNacimiento = fechaPersonalISO(ficha.fechaNacimientoRaw);

  if (!mapeado && !ficha.fechaNacimiento) {
    throw new SigerdError(
      'respuesta-inesperada',
      `La ficha del empleado ${idPersona} no traía campos reconocibles (${html.length} B).`,
    );
  }

  return ficha;
}

/** Descarga y parsea la ficha de un empleado. */
export async function traerFichaPersonal(
  cli: SigerdClient,
  idPersona: number,
  opts: { precargar?: boolean } = {},
): Promise<FichaPersonalSigerd> {
  if (opts.precargar !== false) await cli.abrirModulo(PAGINA_PERSONAL);

  const html = await cli.html(`/modulo-registro/FichaPersonal/EditarFicha?IdPersona=${idPersona}`, {
    method: 'GET',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  return parsearFichaPersonal(html, idPersona);
}
