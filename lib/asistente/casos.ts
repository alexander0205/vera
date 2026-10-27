/**
 * De una respuesta con 👎 a una fila candidata para el set de evaluación.
 *
 * Es lo que cierra el ciclo de mejora: la gente marca lo que salió mal, un
 * script junta esos casos (sin datos personales), y quien mantiene el
 * asistente decide la intención esperada y la agrega a
 * tests/unit/asistente-evaluacion.test.ts. Nada de esto se agrega solo.
 */

import { depurarSalida } from './politicas';
import { normalizar } from './util';

export const MOTIVOS_VALORACION = {
  'dato-incorrecto': 'Dato incorrecto',
  'enlace-incorrecto': 'Enlace incorrecto',
  'no-entendio': 'No entendió la pregunta',
  incompleto: 'Incompleta',
  otro: 'Otro',
} as const;

export type MotivoValoracion = keyof typeof MOTIVOS_VALORACION;

export interface ValoracionNegativa {
  pregunta: string;
  respuesta: string;
  consultas: { nombre: string }[] | null;
  motivo: string | null;
  /** Quién respondió: contestador local o IA (si se sabe). */
  origen?: 'local' | 'ia' | null;
}

export interface CasoCandidato {
  pregunta: string;
  motivo: string;
  consultas: string[];
  /** Inicio de la respuesta, para entender qué se contestó. */
  respuesta: string;
  veces: number;
  /** Fila lista para pegar en CASOS (falta decidir la intención). */
  fila: string;
}

const RNC_CEDULA = /\b\d{9,11}\b/g;
const CORREO = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const TELEFONO = /\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g;

/** Quita lo que identifica a una persona o a un negocio antes de guardar el caso. */
export function anonimizar(texto: string): string {
  return depurarSalida(texto).texto
    .replace(CORREO, '[correo]')
    .replace(TELEFONO, '[teléfono]')
    // RNC, cédulas: 9 u 11 dígitos. Un e-NCF (E + 12 dígitos) no entra aquí.
    .replace(RNC_CEDULA, (m) => (m.length === 9 || m.length === 11 ? '[documento]' : m))
    .replace(/\s+/g, ' ')
    .trim();
}

const comillas = (t: string) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function juntarCasos(valoraciones: ValoracionNegativa[]): CasoCandidato[] {
  const por = new Map<string, CasoCandidato>();
  for (const v of valoraciones) {
    const pregunta = anonimizar(v.pregunta).slice(0, 200);
    if (!pregunta) continue;
    const clave = normalizar(pregunta);
    const previo = por.get(clave);
    if (previo) { previo.veces++; continue; }
    por.set(clave, {
      pregunta,
      motivo: v.motivo ?? 'sin motivo',
      consultas: [...new Set((v.consultas ?? []).map((c) => c.nombre))],
      respuesta: anonimizar(v.respuesta).slice(0, 240),
      veces: 1,
      fila: `  { p: '${comillas(pregunta)}', intencion: null /* TODO: ${v.motivo ?? 'sin motivo'} */ },`,
    });
  }
  return [...por.values()].sort((a, b) => b.veces - a.veces);
}

export function informeMarkdown(casos: CasoCandidato[], desde: string): string {
  if (!casos.length) return `# Casos pendientes del asistente\n\nSin valoraciones negativas desde ${desde}.\n`;
  return [
    '# Casos pendientes del asistente',
    '',
    `Valoraciones 👎 desde ${desde}, sin datos personales. Revisa cada una: decide la intención correcta y agrégala a ` +
      '`tests/unit/asistente-evaluacion.test.ts` (o corrige el contestador si hay un error).',
    '',
    ...casos.flatMap((c, i) => [
      `## ${i + 1}. ${c.pregunta}${c.veces > 1 ? ` (×${c.veces})` : ''}`,
      '',
      `- Motivo: ${MOTIVOS_VALORACION[c.motivo as MotivoValoracion] ?? c.motivo}`,
      `- Consultó: ${c.consultas.length ? c.consultas.join(', ') : '(nada)'}`,
      `- Respondió: ${c.respuesta}`,
      '',
      '```ts',
      c.fila,
      '```',
      '',
    ]),
  ].join('\n');
}
