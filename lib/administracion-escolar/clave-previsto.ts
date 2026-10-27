/**
 * La clave de una línea de factura que cobra un mes que todavía no es cargo.
 *
 * Tiene la misma forma que la de un cargo —`estudiante:cargo:mes:año`, ver
 * `LineaPrefill.cuotaClave`— pero en el lugar del cargo va
 * `p<matrícula>.<cuota>`: el cargo no existe, y lo que lo identifica es la
 * cuota de su plan. `cargosDeLasLineas` la ignora (no es un número) y
 * `estudiantesDeLasLineas` sí la cuenta, así que la factura sigue sabiendo de
 * quién es. El cargo lo crea la emisión (`adelantarPrevistosDeFactura`).
 *
 * Sin dependencias: la arma el servidor y la compara el formulario.
 */

export interface PrevistoDeLinea { estudianteId: number; matriculaId: number; cuotaId: number }

export function claveDePrevisto(p: PrevistoDeLinea & { mes: number | null; anio: number }): string {
  return `${p.estudianteId}:p${p.matriculaId}.${p.cuotaId}:${p.mes ?? 0}:${p.anio}`;
}

export function leerPrevisto(clave: unknown): PrevistoDeLinea | null {
  if (typeof clave !== 'string') return null;
  const partes = clave.split(':');
  if (partes.length !== 4) return null;
  const m = /^p(\d+)\.(\d+)$/.exec(partes[1]);
  const estudianteId = Number(partes[0]);
  if (!m || !Number.isInteger(estudianteId) || estudianteId <= 0) return null;
  const matriculaId = Number(m[1]);
  const cuotaId = Number(m[2]);
  if (!(matriculaId > 0) || !(cuotaId > 0)) return null;
  return { estudianteId, matriculaId, cuotaId };
}
