/**
 * Fecha límite de pago para documentos a crédito (tipoPago = 2).
 *
 * La DGII exige `fechaLimitePago` cuando el pago es a crédito. Hay dos casos en
 * que un documento llega a crédito sin ella: la nota de débito por mora (nace
 * como borrador interno) y borradores viejos. Esta regla única los cubre:
 *
 *     fecha límite = fecha base (hoy en RD) + días de crédito de la empresa
 *
 * Los días de crédito son `teams.plazo_pago_default_dias`; si la empresa no
 * tiene uno configurado se usan `DIAS_CREDITO_POR_DEFECTO`. Puro: sin DB ni reloj.
 */

/** Plazo cuando la empresa no configuró «plazo de pago por defecto». */
export const DIAS_CREDITO_POR_DEFECTO = 30;

/** Suma días a un 'YYYY-MM-DD' sin pasar por zonas horarias. */
export function sumarDiasISO(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Días de crédito efectivos de una empresa. */
export function diasCreditoEmpresa(plazoPagoDefaultDias: number | null | undefined): number {
  return plazoPagoDefaultDias != null && plazoPagoDefaultDias > 0
    ? plazoPagoDefaultDias
    : DIAS_CREDITO_POR_DEFECTO;
}

/** Fecha límite = `hoy` (YYYY-MM-DD, RD) + días de crédito de la empresa. */
export function fechaLimiteCredito(
  hoy: string,
  plazoPagoDefaultDias: number | null | undefined,
): string {
  return sumarDiasISO(hoy, diasCreditoEmpresa(plazoPagoDefaultDias));
}

/**
 * Fecha límite que debe llevar un documento al emitirse.
 * - No es crédito → `null` (no aplica).
 * - Crédito con fecha → la misma, salvo que sea una nota de mora cuya fecha ya
 *   pasó (nació con su plazo y tardó en emitirse): se renueva desde hoy.
 * - Crédito sin fecha → la regla por defecto.
 */
export function fechaLimiteParaEmitir(opts: {
  tipoPago: number | null | undefined;
  fechaLimitePago: string | null | undefined;
  esNotaMora?: boolean;
  hoy: string;
  plazoPagoDefaultDias: number | null | undefined;
}): string | null {
  if (opts.tipoPago !== 2) return null;
  const actual = opts.fechaLimitePago ? opts.fechaLimitePago.slice(0, 10) : null;
  if (actual && !(opts.esNotaMora && actual < opts.hoy)) return actual;
  return fechaLimiteCredito(opts.hoy, opts.plazoPagoDefaultDias);
}

/** Texto de la condición de pago: no se infiere de si hay fecha límite. */
export function condicionPagoTexto(tipoPago: number | null | undefined): string {
  switch (tipoPago) {
    case 2: return 'Crédito';
    case 3: return 'Gratuito';
    case 4: return 'Uso o consumo';
    default: return 'De contado';
  }
}
