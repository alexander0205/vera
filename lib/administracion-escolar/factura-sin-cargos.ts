/**
 * La factura que debe y no tiene un cargo vivo detrás.
 *
 * El enlace `?f=` arma lo que cobra desde `admin_escolar_cargos`, pero no toda
 * factura nace de un cargo: una velada o un uniforme se facturan directo y ahí
 * no hay cargo ninguno. También pasa que el cargo ya esté pagado y la factura
 * traiga más líneas que él. En los dos casos la página decía «no tiene saldo
 * pendiente» y RD$0.00 con la factura debiendo, y sin dónde subir el comprobante.
 *
 * Solo lo que no toca la base, para poder probarlo aparte. El saldo viene de
 * `saldoFacturaSql`: es lo que dice Cuentas por cobrar, no otra cuenta.
 */

import type { MoraDelComprobante } from '@/lib/db/schema';

export interface LineaDeFactura {
  /** Vacío si la línea no dice de qué alumno es. */
  estudiante: string;
  concepto: string;
}

export interface FacturaSinCargos {
  /** Contra esto se registra el cobro. */
  facturaId: number;
  codigo: string | null;
  lineas: LineaDeFactura[];
  fechaVencimiento: string | null;
  vencido: boolean;
  montoTotalCentavos: number;
  /** Lo que queda por pagar. */
  montoCentavos: number;
}

/** Un pago registrado contra la factura. */
export interface AbonoDeFactura {
  montoCentavos: number;
  metodo: string;
  fecha: string;
}

/** Monto completo, abonado y lo demás que explica el saldo de la factura del enlace. */
export interface ResumenFactura {
  montoTotalCentavos: number;
  abonadoCentavos: number;
  /** Cada abono con su fecha, del más viejo al más nuevo. */
  abonos: AbonoDeFactura[];
  /** Las notas de crédito que rebajan la factura. Una familia que no pagó no abonó. */
  notaCreditoCentavos: number;
  moraCentavos: number;
}

/** Una anulada no se cobra ni se da por pagada: hay que decirlo con su nombre. */
export function estaAnulada(d: { estado: string | null; estadoPago: string | null }): boolean {
  return d.estado === 'ANULADO' || d.estadoPago === 'ANULADA';
}

/**
 * `null` si estas cifras no llevan a lo que la página cobra: una familia que ve
 * una resta que no da llama al colegio en vez de transferir.
 */
export function resumenDeFactura(d: {
  esVenta: boolean;
  montoTotalCentavos: number;
  abonos: AbonoDeFactura[];
  saldoCentavos: number;
  moraCentavos: number;
  totalACobrarCentavos: number;
}): ResumenFactura | null {
  if (!d.esVenta || d.saldoCentavos <= 0) return null;
  if (d.saldoCentavos + d.moraCentavos !== d.totalACobrarCentavos) return null;
  const abonadoCentavos = d.abonos.reduce((a, x) => a + x.montoCentavos, 0);
  return {
    montoTotalCentavos: d.montoTotalCentavos,
    abonadoCentavos,
    abonos: d.abonos,
    notaCreditoCentavos: Math.max(0, d.montoTotalCentavos - abonadoCentavos - d.saldoCentavos),
    moraCentavos: d.moraCentavos,
  };
}

/**
 * Con cargos vivos se cobran los cargos, como siempre. `esVenta` deja fuera las
 * notas de crédito y las compras, que no se deben, y las notas de mora, que ya
 * tienen su propia lista.
 */
export function seCobraComoFactura(d: {
  cargosVivos: number; esVenta: boolean; saldoCentavos: number;
}): boolean {
  return d.cargosVivos === 0 && d.esVenta && d.saldoCentavos > 0;
}

/** Concepto y alumno de cada línea. Un JSON roto no tumba la página del padre. */
export function lineasDeFactura(lineasJson: string | null | undefined): LineaDeFactura[] {
  if (!lineasJson) return [];
  let arr: unknown;
  try { arr = JSON.parse(lineasJson); } catch { return []; }
  if (!Array.isArray(arr)) return [];

  return arr.flatMap((raw) => {
    const l = raw as Record<string, unknown>;
    const concepto = String(l.nombreItem ?? l.nombre ?? '').trim();
    if (!concepto) return [];
    return [{ concepto, estudiante: String(l.dependienteNombre ?? '').trim() }];
  });
}

/**
 * Lo que va en el comprobante para que la aprobación sepa dónde cobrar.
 *
 * La factura primero: una transferencia corta tapa el capital antes que su
 * recargo, igual que con los cargos (ver `repartir`).
 */
export function documentosDelComprobante(vista: {
  facturaSinCargos: FacturaSinCargos | null;
  moras: Pick<MoraDelComprobante, 'facturaId' | 'codigo' | 'origenCodigo' | 'montoCentavos'>[];
}): MoraDelComprobante[] {
  const f = vista.facturaSinCargos;
  const moras = vista.moras.map((m) => ({
    facturaId: m.facturaId,
    codigo: m.codigo,
    origenCodigo: m.origenCodigo,
    montoCentavos: m.montoCentavos,
  }));
  if (!f) return moras;
  return [{
    facturaId: f.facturaId,
    codigo: f.codigo,
    origenCodigo: null,
    montoCentavos: f.montoCentavos,
    detalle: f.lineas
      .map((l) => (l.estudiante ? `${l.concepto} · ${l.estudiante}` : l.concepto))
      .join(', ') || `Factura ${f.codigo ?? `#${f.facturaId}`}`,
  }, ...moras];
}

/** Cómo se llama en pantalla un documento de `moras`. */
export function nombreDelDocumento(m: Pick<MoraDelComprobante, 'origenCodigo' | 'detalle'>): string {
  if (m.detalle) return m.detalle;
  // La mora se nombra por la factura que la causó: «Mora» a secas no dice de
  // qué mes es, y una familia puede tener cuatro.
  return m.origenCodigo ? `Mora de ${m.origenCodigo}` : 'Recargo por mora';
}

/** En la página de una factura, solo el comprobante que tocó esa factura. */
export function comprobanteEsDeFactura(
  c: { cargos: { cargoId: number }[] | null; moras: { facturaId: number }[] | null },
  facturaId: number | null,
  cargoIds: ReadonlySet<number>,
): boolean {
  return (Array.isArray(c.cargos) && c.cargos.some((x) => cargoIds.has(x.cargoId)))
    || (Array.isArray(c.moras) && c.moras.some((m) => m.facturaId === facturaId));
}
