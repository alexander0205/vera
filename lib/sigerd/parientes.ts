/**
 * Responsables/parientes del estudiante en SIGERD (padre, madre, tutor).
 *
 * NO viven en la ficha del estudiante; se cargan en el formulario de edición con
 * botones "Padre/Madre/Tutor" que llaman:
 *
 *   POST /modulo-registro/inscripcion/GetViewDatosPariente
 *        { opcion: 'editar', idEstudiante, idTipoPariente }
 *
 *   idTipoPariente: 1=Padre, 2=Madre, 3=Tutor  (3 slots fijos por estudiante)
 *
 * Devuelve el HTML de un formulario (`form_datosPariente`). Si el estudiante no
 * tiene ese pariente, el form viene vacío (IdPersona/Cedula sin valor).
 *
 * DATOS SENSIBLES: cédula, teléfono y dirección de familiares de menores. No
 * loguear su contenido. El guardado del portal (`PostDatosPariente`) NO se toca.
 */

import type { SigerdClient } from './client';
import { SigerdError } from './types';

const RUTA = '/modulo-registro/inscripcion/GetViewDatosPariente';
const PAGINA_INSCRIPCION = '/modulo-registro/inscripcion';

export type TipoPariente = 'padre' | 'madre' | 'tutor';

const TIPOS: { id: number; tipo: TipoPariente }[] = [
  { id: 1, tipo: 'padre' },
  { id: 2, tipo: 'madre' },
  { id: 3, tipo: 'tutor' },
];

export interface ParienteSigerd {
  /** padre | madre | tutor (según el botón/slot de SIGERD). */
  tipo: TipoPariente;
  /** Id de la persona en SIGERD (clave estable). null si el slot está vacío. */
  idPersona: number | null;
  cedula: string | null;
  primerNombre: string | null;
  segundoNombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  /** Texto: Casado(a)/Soltero(a)/… */
  estadoCivil: string | null;
  /** Texto: Técnico/Básica/Media/Universitario/Ninguno. */
  nivelAcademico: string | null;
  nacionalidad: string | null;
  direccion: string | null;
}

function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function limpiar(v: string | null): string | null {
  if (v == null) return null;
  const s = decodificar(v);
  if (!s || /^(n\/a|no aplica|null|0)$/i.test(s)) return null;
  return s;
}

/** value="..." de un <input name="NAME" ...> (en cualquier orden de atributos). */
function valorInput(html: string, name: string): string | null {
  const re = new RegExp(`<input\\b[^>]*\\bname="${name}"[^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  return limpiar(tag.match(/\bvalue="([^"]*)"/i)?.[1] ?? '');
}

/** Texto de la <option selected> de un <select name="NAME">. */
function opcionSeleccionada(html: string, name: string): string | null {
  const re = new RegExp(`<select\\b[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)</select>`, 'i');
  const bloque = html.match(re)?.[1];
  if (!bloque) return null;
  const opt = bloque.match(/<option[^>]*\bselected[^>]*>([^<]*)<\/option>/i)?.[1];
  return limpiar(opt ?? '');
}

/** Parsea un HTML de `GetViewDatosPariente`. Devuelve null si el slot está vacío. */
export function parsearPariente(html: string, tipo: TipoPariente): ParienteSigerd | null {
  const idPersonaRaw = valorInput(html, 'IdPersona');
  const cedula = valorInput(html, 'Cedula');
  const primerNombre = valorInput(html, 'Nombre');
  // Sin persona, sin cédula y sin nombre => el estudiante no tiene ese pariente.
  if (!idPersonaRaw && !cedula && !primerNombre) return null;

  return {
    tipo,
    idPersona: idPersonaRaw ? Number(idPersonaRaw) || null : null,
    cedula,
    primerNombre,
    segundoNombre: valorInput(html, 'Nombre2'),
    primerApellido: valorInput(html, 'Apellido1'),
    segundoApellido: valorInput(html, 'Apellido2'),
    telefono: valorInput(html, 'Telefono'),
    celular: valorInput(html, 'Celular'),
    email: valorInput(html, 'Email'),
    estadoCivil: opcionSeleccionada(html, 'estadoCivil'),
    nivelAcademico: opcionSeleccionada(html, 'nivelAcademico'),
    nacionalidad: opcionSeleccionada(html, 'nacionalidades'),
    direccion: valorInput(html, 'Direccion'),
  };
}

/** Descarga el HTML del pariente de un tipo para un estudiante. */
async function traerTipo(
  cli: SigerdClient,
  idEstudiante: number,
  idTipoPariente: number,
): Promise<string> {
  return cli.html(RUTA, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: new URLSearchParams({
      opcion: 'editar',
      idEstudiante: String(idEstudiante),
      idTipoPariente: String(idTipoPariente),
    }).toString(),
  });
}

/**
 * Trae los responsables (padre/madre/tutor) de un estudiante. Devuelve solo los
 * slots con datos. `precargar` abre el módulo antes del primer POST (el portal
 * arma estado al renderizar la vista).
 */
export async function traerParientesEstudiante(
  cli: SigerdClient,
  idEstudiante: number,
  opts: { precargar?: boolean } = {},
): Promise<ParienteSigerd[]> {
  if (opts.precargar !== false) await cli.abrirModulo(PAGINA_INSCRIPCION);

  const out: ParienteSigerd[] = [];
  for (const t of TIPOS) {
    let html: string;
    try {
      html = await traerTipo(cli, idEstudiante, t.id);
    } catch (e) {
      if (e instanceof SigerdError) continue; // un slot que falla no tumba el resto
      throw e;
    }
    const p = parsearPariente(html, t.tipo);
    if (p) out.push(p);
  }
  return out;
}
