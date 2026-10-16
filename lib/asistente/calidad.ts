/**
 * Cómo le va al asistente con gente real: cuánto se resuelve sin IA, qué cae a
 * la IA (candidatas a plantilla), qué dejó con 👎 y por qué. Es la parte pura
 * (de filas a resumen); `scripts/calidad-asistente.ts` la alimenta con la base.
 *
 * Las preguntas se anonimizan antes de contarlas: este informe es interno, pero
 * no debe cargar datos personales de nadie.
 */

import { anonimizar } from './casos';
import { normalizar } from './util';

export interface FilaCalidad {
  pregunta: string;
  origen: 'local' | 'ia' | null;
  valoracion: 1 | -1 | null;
  motivo: string | null;
}

export interface ConteoPregunta { pregunta: string; veces: number }

export interface ResumenCalidad {
  total: number;
  local: number;
  ia: number;
  /** Respuestas de antes de registrar el origen (migración 0196). */
  sinOrigen: number;
  /** % resuelto sin IA, sobre las que tienen origen conocido. */
  pctLocal: number | null;
  valoradas: number;
  utiles: number;
  malas: number;
  /** % de las valoradas que fueron 👎. */
  pctMalas: number | null;
  porMotivo: Record<string, number>;
  /** Lo que más cae a la IA: candidatas a una respuesta automática. */
  masAIa: ConteoPregunta[];
  /** Lo que más recibe 👎. */
  masMalas: ConteoPregunta[];
}

function contar(preguntas: string[], max: number): ConteoPregunta[] {
  const m = new Map<string, ConteoPregunta>();
  for (const p of preguntas) {
    const limpia = anonimizar(p).slice(0, 140);
    const clave = normalizar(limpia);
    if (!clave) continue;
    const x = m.get(clave);
    if (x) x.veces++;
    else m.set(clave, { pregunta: limpia, veces: 1 });
  }
  return [...m.values()].sort((a, b) => b.veces - a.veces).slice(0, max);
}

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);

export function resumirCalidad(filas: FilaCalidad[], opciones: { max?: number } = {}): ResumenCalidad {
  const max = opciones.max ?? 10;
  const local = filas.filter((f) => f.origen === 'local').length;
  const ia = filas.filter((f) => f.origen === 'ia').length;
  const utiles = filas.filter((f) => f.valoracion === 1).length;
  const malas = filas.filter((f) => f.valoracion === -1);
  const porMotivo: Record<string, number> = {};
  for (const f of malas) porMotivo[f.motivo ?? 'sin motivo'] = (porMotivo[f.motivo ?? 'sin motivo'] ?? 0) + 1;

  return {
    total: filas.length,
    local,
    ia,
    sinOrigen: filas.length - local - ia,
    pctLocal: pct(local, local + ia),
    valoradas: utiles + malas.length,
    utiles,
    malas: malas.length,
    pctMalas: pct(malas.length, utiles + malas.length),
    porMotivo,
    masAIa: contar(filas.filter((f) => f.origen === 'ia').map((f) => f.pregunta), max),
    masMalas: contar(malas.map((f) => f.pregunta), max),
  };
}

export function informeCalidad(r: ResumenCalidad, dias: number): string {
  const l = (x: number | null) => (x == null ? 'sin datos' : `${x}%`);
  const lista = (c: ConteoPregunta[]) => (c.length ? c.map((x) => `- ${x.pregunta}${x.veces > 1 ? ` (×${x.veces})` : ''}`).join('\n') : '- (nada)');
  return [
    `# Calidad del asistente — últimos ${dias} días`,
    '',
    `- Respuestas: **${r.total}** (${r.local} automáticas, ${r.ia} con IA${r.sinOrigen ? `, ${r.sinOrigen} anteriores al registro de origen` : ''})`,
    `- Resueltas sin IA: **${l(r.pctLocal)}**`,
    `- Valoradas: ${r.valoradas} · 👍 ${r.utiles} · 👎 ${r.malas} (**${l(r.pctMalas)}** de las valoradas)`,
    '',
    '## Por qué no sirvieron',
    Object.keys(r.porMotivo).length ? Object.entries(r.porMotivo).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n') : '- (ninguna)',
    '',
    '## Lo que más cae a la IA (candidatas a respuesta automática)',
    lista(r.masAIa),
    '',
    '## Lo que más recibe 👎',
    lista(r.masMalas),
    '',
  ].join('\n');
}
