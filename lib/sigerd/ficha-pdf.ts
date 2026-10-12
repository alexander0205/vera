/**
 * Los parientes de un alumno, sacados del PDF de la ficha.
 *
 * Por qué el PDF y no la pantalla: `GetViewDatosPariente` —la pestaña
 * Padre/Madre/Tutor del portal— devuelve el formulario EN BLANCO para todos los
 * alumnos que se probaron, incluido uno cuyo PDF sí trae padre y madre con
 * cédula. Es decir, existe el dato y esa ruta no lo sirve. El reporte, en
 * cambio, lo imprime.
 *
 * El endpoint es raro y conviene dejarlo escrito: es un POST con el id en la
 * URL y cuerpo vacío, y no devuelve `application/pdf` sino el `byte[]` de .NET
 * serializado como un array JSON de números. Hay que rearmarlo antes de
 * parsearlo.
 */

import { PDFParse } from 'pdf-parse';
import { SigerdError } from './types';
import type { SigerdClient } from './client';

const RUTA = '/ModuloReportes/Estudiantes/ReporteFichaEstudiantePDF';
const PAGINA_INSCRIPCION = '/modulo-registro/inscripcion';

export interface ParientePdf {
  /** padre | madre | tutor, tal como lo etiqueta el reporte. */
  tipo: string;
  nombre: string;
  cedula: string | null;
  celular: string | null;
  telefono: string | null;
}

/**
 * Descarga el PDF de la ficha. Devuelve los bytes ya rearmados.
 *
 * Reintenta una vez porque el reporte es inestable: dos llamadas seguidas y la
 * segunda contesta con la página del módulo (~27 KB de HTML) en vez del
 * `byte[]`. Reabrir el módulo antes de repetir lo endereza. Sin esto, pedir los
 * parientes de dos alumnos seguidos devolvía vacío el segundo y parecía que el
 * alumno no tenía padres.
 */
export async function traerFichaPdf(
  cli: SigerdClient,
  idEstudiante: number,
  opts: { precargar?: boolean } = {},
): Promise<Buffer> {
  let ultimo: unknown;
  for (let intento = 0; intento < 2; intento++) {
    if (opts.precargar !== false || intento > 0) await cli.abrirModulo(PAGINA_INSCRIPCION);
    try {
      return await pedirPdf(cli, idEstudiante);
    } catch (e) {
      // Solo se reintenta la respuesta rara. Un fallo de sesión o de red lo
      // resuelve quien llama; repetirlo aquí solo lo tardaría el doble.
      if (!(e instanceof SigerdError && e.codigo === 'respuesta-inesperada')) throw e;
      ultimo = e;
    }
  }
  throw ultimo;
}

async function pedirPdf(cli: SigerdClient, idEstudiante: number): Promise<Buffer> {
  const res = await cli.fetch(`${RUTA}?id=${idEstudiante}`, {
    method: 'POST',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      Referer: PAGINA_INSCRIPCION,
    },
  });

  const texto = await res.text();
  let bytes: unknown;
  try {
    bytes = JSON.parse(texto);
  } catch {
    throw new SigerdError(
      'respuesta-inesperada',
      `El reporte del estudiante ${idEstudiante} no vino en JSON (${texto.length} B).`,
    );
  }
  if (!Array.isArray(bytes) || bytes.length === 0) {
    throw new SigerdError(
      'respuesta-inesperada',
      `El reporte del estudiante ${idEstudiante} vino vacío.`,
    );
  }

  const buf = Buffer.from(bytes as number[]);
  if (buf.subarray(0, 4).toString() !== '%PDF') {
    throw new SigerdError(
      'respuesta-inesperada',
      `El reporte del estudiante ${idEstudiante} no era un PDF.`,
    );
  }
  return buf;
}

const CEDULA = /\b\d{3}-\d{7}-\d\b/;
const TIPOS = /^(padre|madre|tutor)\b/i;

/**
 * Saca la tabla «Información Parientes» del texto del reporte.
 *
 * Cada fila sale como una línea suelta: `Padre NOMBRE COMPLETO 001-0000000-0`,
 * y detrás celular y teléfono cuando los hay. El nombre es lo que queda entre
 * el parentesco y la cédula, así que se recorta por posición en vez de por
 * número de palabras — hay nombres de dos y de cinco.
 */
export function parsearParientesDeTexto(texto: string): ParientePdf[] {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const i = lineas.findIndex((l) => /Informaci[oó]n\s+Parientes/i.test(l));
  if (i === -1) return [];

  const out: ParientePdf[] = [];
  // Se empieza tras la cabecera («Parentezco Nombre Cedula …») y se corta en la
  // primera línea que ya no es una fila: el reporte sigue con el pie de página.
  for (const linea of lineas.slice(i + 2)) {
    const m = linea.match(TIPOS);
    if (!m) break;

    const tipo = m[1].toLowerCase();
    const resto = linea.slice(m[1].length).trim();

    const c = resto.match(CEDULA);
    const nombre = (c ? resto.slice(0, c.index).trim() : resto).replace(/\s+/g, ' ');
    if (!nombre) continue;

    // Lo que sigue a la cédula son celular y teléfono, en ese orden y ambos
    // opcionales. El reporte no los separa con nada más que espacios.
    const cola = c ? resto.slice((c.index ?? 0) + c[0].length).trim().split(/\s+/).filter(Boolean) : [];

    out.push({
      tipo,
      nombre,
      cedula: c ? c[0] : null,
      celular: cola[0] ?? null,
      telefono: cola[1] ?? null,
    });
  }
  return out;
}

/** Descarga el reporte y devuelve sus parientes. */
export async function traerParientesDesdePdf(
  cli: SigerdClient,
  idEstudiante: number,
  opts: { precargar?: boolean } = {},
): Promise<ParientePdf[]> {
  const buf = await traerFichaPdf(cli, idEstudiante, opts);
  const { text } = await new PDFParse({ data: buf }).getText();
  return parsearParientesDeTexto(text);
}
