/**
 * Montos rápidos de efectivo para el cobro POS (patrón Alegra):
 * el total exacto + los redondeos de billete inmediatos (100/500/1000 DOP)
 * mayores al total. Máximo 3 opciones. Todo en centavos.
 */
export function montosRapidos(totalCentavos: number): number[] {
  const out = [totalCentavos];
  for (const paso of [100_00, 500_00, 1000_00]) {
    const redondeo = Math.ceil(totalCentavos / paso) * paso;
    if (redondeo > totalCentavos && !out.includes(redondeo)) out.push(redondeo);
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}
