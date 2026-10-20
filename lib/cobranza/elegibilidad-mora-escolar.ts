/**
 * lib/cobranza/elegibilidad-mora-escolar.ts — Reglas PURAS de mora para
 * facturas respaldadas por cargos escolares.
 *
 * El barrido del cron (lib/cobranza/recargo.ts) implementa `elegibleParaMora`
 * en SQL por rendimiento (un NOT EXISTS/EXISTS sobre admin_escolar_cargos), y la
 * generación de la ND (lib/cobranza/nota-debito-mora.ts) usa `graciaParaMora`
 * directamente. Acá viven las reglas en forma pura para poder probarlas sin DB.
 */

export interface ConceptoMora {
  /** El interruptor "Cobrar recargo por mora" del concepto. */
  cobraMora: boolean;
  /** Días de gracia del concepto (`mora_dias_gracia`, NOT NULL, 0 = sin gracia). */
  moraDiasGracia: number;
}

/**
 * ¿La factura entra al cobro de mora?
 * - Venta normal (sin cargos escolares) → SÍ (lista vacía).
 * - Factura escolar → solo si AL MENOS un concepto cobra mora. Si TODOS sus
 *   conceptos la tienen apagada (p. ej. solo Evaluación/Inscripción), no entra.
 */
export function elegibleParaMora(conceptos: ConceptoMora[]): boolean {
  if (conceptos.length === 0) return true;
  return conceptos.some((c) => c.cobraMora);
}

/**
 * Días de gracia que aplican a la factura.
 * - Si hay conceptos escolares que cobran mora, manda la gracia MÁS LARGA entre
 *   ellos (la ND es por factura, una sola gracia; favorece a la familia). Un 0
 *   es un 0 real, no "sin configurar".
 * - Si no hay ninguno (venta normal, o conceptos sin mora), se usa la del team.
 */
export function graciaParaMora(conceptos: ConceptoMora[], graciaTeam: number): number {
  const conMora = conceptos.filter((c) => c.cobraMora);
  if (conMora.length === 0) return graciaTeam;
  return Math.max(...conMora.map((c) => c.moraDiasGracia));
}
