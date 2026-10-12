/**
 * Partidas del asiento de una compra o gasto — funciones puras, sin BD.
 *
 *   DEBE  Inventario / gasto / activo   la base de cada línea + lo que no se
 *                                        adelanta (ITBIS al costo, ISC, otros
 *                                        impuestos, propina), repartido por base
 *   DEBE  ITBIS adelantado              ITBIS facturado − ITBIS al costo
 *   HABER ITBIS retenido por pagar      lo retenido de ITBIS (IT-1)
 *   HABER ISR retenido por pagar        lo retenido de ISR (IR-17)
 *   HABER Cuentas por pagar / caja      el neto: total − retenciones
 *
 * Cuadra porque debe = base + impuestos = total = neto + retenciones.
 */

import type { LineaAsiento } from '@/lib/contabilidad/asientos';

export interface BaseCuenta {
  cuentaId: number;
  baseCents: number;
  descripcion: string;
}

export interface ParametrosAsientoCompra {
  bases: BaseCuenta[];
  itbisFacturadoCents: number;
  itbisAlCostoCents: number;
  iscCents: number;
  otrosImpuestosCents: number;
  propinaCents: number;
  itbisRetenidoCents: number;
  isrRetenidoCents: number;
  esContado: boolean;
  cuentas: {
    itbisAdelantado: number | null;
    itbisRetenido: number | null;
    isrRetenido: number | null;
    /** Caja o banco si es de contado; cuentas por pagar si es a crédito. */
    contrapartida: number;
    /**
     * Pago mixto: cada parte a su caja o banco. Si viene, su suma tiene que ser
     * lo que se paga (total − retenciones) y reemplaza a `contrapartida`.
     */
    contrapartidas?: { cuentaId: number; cents: number; descripcion?: string }[];
  };
}

export type FaltaCuentaCompra = 'sin-cuenta-itbis-adelantado' | 'sin-cuenta-retenciones-por-pagar';

/** Reparte un monto en proporción a los pesos, con el residuo al de mayor peso. Suma exacta. */
export function repartir(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((s, p) => s + Math.max(0, p), 0);
  if (total === 0 || pesos.length === 0) return pesos.map(() => 0);
  if (suma <= 0) return pesos.map((_, i) => (i === 0 ? total : 0));
  const partes = pesos.map((p) => Math.floor((total * Math.max(0, p)) / suma));
  let resto = total - partes.reduce((s, p) => s + p, 0);
  const orden = pesos.map((p, i) => ({ i, frac: (total * Math.max(0, p)) / suma - partes[i] }))
    .sort((a, b) => b.frac - a.frac || pesos[b.i] - pesos[a.i]);
  for (let k = 0; resto > 0; k = (k + 1) % orden.length, resto--) partes[orden[k].i] += 1;
  return partes;
}

export function partidasAsientoCompra(p: ParametrosAsientoCompra): LineaAsiento[] | { motivo: FaltaCuentaCompra } {
  const itbisAdelantado = Math.max(0, p.itbisFacturadoCents - p.itbisAlCostoCents);
  if (itbisAdelantado > 0 && !p.cuentas.itbisAdelantado) return { motivo: 'sin-cuenta-itbis-adelantado' };
  if ((p.itbisRetenidoCents > 0 && !p.cuentas.itbisRetenido) || (p.isrRetenidoCents > 0 && !p.cuentas.isrRetenido)) {
    return { motivo: 'sin-cuenta-retenciones-por-pagar' };
  }

  // Lo que no se recupera se le suma al costo de cada línea, en proporción.
  const extra = p.itbisAlCostoCents + p.iscCents + p.otrosImpuestosCents + p.propinaCents;
  const reparto = repartir(extra, p.bases.map((b) => b.baseCents));

  // Una línea por cuenta: dos conceptos de la misma categoría no se ven dos veces.
  const porCuenta = new Map<number, { debe: number; descripciones: string[] }>();
  p.bases.forEach((b, i) => {
    const acc = porCuenta.get(b.cuentaId) ?? { debe: 0, descripciones: [] };
    acc.debe += b.baseCents + reparto[i];
    if (!acc.descripciones.includes(b.descripcion)) acc.descripciones.push(b.descripcion);
    porCuenta.set(b.cuentaId, acc);
  });

  const total = p.bases.reduce((s, b) => s + b.baseCents, 0) + p.itbisFacturadoCents + p.iscCents + p.otrosImpuestosCents + p.propinaCents;
  const retenciones = p.itbisRetenidoCents + p.isrRetenidoCents;

  const lineas: LineaAsiento[] = [...porCuenta.entries()].map(([cuentaId, v]) => ({
    cuentaId, debeCents: v.debe, haberCents: 0, descripcion: v.descripciones.join(', ').slice(0, 200),
  }));
  if (itbisAdelantado > 0) {
    lineas.push({ cuentaId: p.cuentas.itbisAdelantado!, debeCents: itbisAdelantado, haberCents: 0, descripcion: 'ITBIS adelantado (crédito fiscal)' });
  }
  if (p.itbisRetenidoCents > 0) {
    lineas.push({ cuentaId: p.cuentas.itbisRetenido!, debeCents: 0, haberCents: p.itbisRetenidoCents, descripcion: 'ITBIS retenido al proveedor (IT-1)' });
  }
  if (p.isrRetenidoCents > 0) {
    lineas.push({ cuentaId: p.cuentas.isrRetenido!, debeCents: 0, haberCents: p.isrRetenidoCents, descripcion: 'ISR retenido al proveedor (IR-17)' });
  }
  const partes = p.esContado ? p.cuentas.contrapartidas : undefined;
  if (partes && partes.length > 0 && partes.reduce((s, x) => s + x.cents, 0) === total - retenciones) {
    // Una línea por cuenta: dos partes que salen de la misma caja se ven como una.
    const porCuenta = new Map<number, { cents: number; descripcion: string }>();
    for (const x of partes) {
      const previo = porCuenta.get(x.cuentaId);
      porCuenta.set(x.cuentaId, { cents: (previo?.cents ?? 0) + x.cents, descripcion: previo ? 'Pago al proveedor (mixto)' : (x.descripcion ?? 'Pago al proveedor (mixto)') });
    }
    for (const [cuentaId, v] of porCuenta) lineas.push({ cuentaId, debeCents: 0, haberCents: v.cents, descripcion: v.descripcion });
  } else {
    lineas.push({
      cuentaId: p.cuentas.contrapartida, debeCents: 0, haberCents: total - retenciones,
      descripcion: p.esContado ? 'Pago al proveedor' : 'Deuda con el proveedor',
    });
  }
  return lineas.filter((l) => l.debeCents > 0 || l.haberCents > 0);
}
