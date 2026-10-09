/**
 * lib/administracion-escolar/cuotas-al-matricular.ts — qué cuotas se cargan en
 * el momento de matricular y cuáles esperan su fecha.
 *
 * Una sola regla para todo lo que la enseña o la aplica: el «Se le carga ahora»
 * del formulario, la revisión del lote y la creación de la matrícula (individual
 * y en lote). Cada uno elegía su propio corte: las pantallas cortaban en fin de
 * mes y la creación en la fecha de inscripción. Matriculando el día 2 con la
 * mensualidad emitiéndose el 11, la pantalla anunciaba la de septiembre como
 * cargo de hoy y la creación no la hacía —la hace el devengo el día 11—, así que
 * se confirmaba una cifra que no era la que quedaba.
 *
 * El corte es la fecha de inscripción, igual que el devengo diario corta en hoy.
 *
 * No importa nada de la base a propósito: también la usa el cliente.
 */

export interface CuotaAlMatricular {
  /** Emitida antes de que el alumno entrara: no se le cobra nunca. */
  omitida: boolean;
  /** El día que sale la factura. Es el que decide si ya toca. */
  fechaEmision: string;
  montoCentavos: number;
}

/**
 * Reparte las cuotas de los conceptos marcados en las que nacen como cargo al
 * matricular (`ahora`) y las que creará el devengo cuando llegue su fecha
 * (`despues`). Las omitidas no van a ninguna de las dos.
 */
export function cuotasAlMatricular<L extends { conceptoId: number; cuotas: CuotaAlMatricular[] }>(
  plan: L[],
  conceptos: Iterable<number>,
  inscripcion: string,
) {
  const marcados = new Set(conceptos);
  const ahora: { linea: L; cuota: L['cuotas'][number] }[] = [];
  const despues: { linea: L; cuota: L['cuotas'][number] }[] = [];

  for (const linea of plan) {
    if (!marcados.has(linea.conceptoId)) continue;
    for (const cuota of linea.cuotas) {
      if (cuota.omitida) continue;
      (cuota.fechaEmision <= inscripcion ? ahora : despues).push({ linea, cuota });
    }
  }
  return { ahora, despues };
}

export function sumaCentavos(cuotas: { cuota: { montoCentavos: number } }[]): number {
  return cuotas.reduce((s, { cuota }) => s + cuota.montoCentavos, 0);
}
