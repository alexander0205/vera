/**
 * lib/cobranza/detalle.ts — Detalle de una cuenta por cobrar para el panel
 * lateral: historial de pagos, notas de crédito aplicadas, notas de débito por
 * mora, y un timeline que los ordena cronológicamente.
 *
 * No duplica el cálculo de saldo: eso lo da `getCuentasPorCobrar({ docId })`,
 * que es la única fuente de la fórmula. Aquí solo se traen los movimientos que
 * la explican, para que el usuario vea POR QUÉ el saldo es el que es.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { labelMetodo } from '@/lib/pagos/metodos';

export type TipoEvento = 'emision' | 'pago' | 'mora' | 'nota-credito';

export interface EventoCartera {
  tipo:        TipoEvento;
  fecha:       string;          // YYYY-MM-DD
  /** Monto en centavos. Positivo = sube la deuda; negativo = la baja. */
  montoCents:  number;
  titulo:      string;
  detalle?:    string | null;
  /** Documento relacionado (ND de mora, NC), para enlazar. */
  docId?:      number | null;
}

export interface PagoDetalle {
  id:         number;
  fecha:      string;
  montoCents: number;
  metodo:     string;
  referencia: string | null;
  cuenta:     string | null;
  notas:      string | null;
  usuario:    string | null;
}

export interface NotaAplicada {
  id:         number;
  codigo:     string | null;
  encf:       string | null;
  fecha:      string;
  montoCents: number;
  /** Solo NC: razón declarada de la modificación. */
  razon:      string | null;
}

export interface DetalleCuenta {
  pagos:         PagoDetalle[];
  notasCredito:  NotaAplicada[];
  notasMora:     NotaAplicada[];
  timeline:      EventoCartera[];
}

/**
 * Trae los movimientos de una cuenta. Devuelve listas vacías si el documento
 * no existe o no es del team — la autorización la hace la ruta.
 */
export async function getDetalleCuenta(
  teamId: number,
  docId: number,
): Promise<DetalleCuenta> {
  const [cab] = await db.execute(sql`
    SELECT
      to_char(d.fecha_emision, 'YYYY-MM-DD') AS fecha_emision,
      d.monto_total, d.codigo, d.encf
    FROM ecf_documents d
    WHERE d.id = ${docId} AND d.team_id = ${teamId}
  `) as unknown as Array<{ fecha_emision: string; monto_total: number; codigo: string | null; encf: string }>;

  if (!cab) return { pagos: [], notasCredito: [], notasMora: [], timeline: [] };

  const [pagosRaw, ncRaw, moraRaw] = await Promise.all([
    db.execute(sql`
      SELECT p.id, to_char(p.fecha_pago, 'YYYY-MM-DD') AS fecha,
             p.monto_centavos, p.metodo, p.referencia, p.cuenta, p.notas,
             u.name AS usuario
      FROM pagos_recibidos p
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.team_id = ${teamId} AND p.ecf_document_id = ${docId}
      ORDER BY p.fecha_pago ASC, p.id ASC
    `),
    // Mismas condiciones que el CTE de getCuentasPorCobrar: solo las NC que
    // realmente reducen el saldo. Si aquí saliera alguna de más, el desglose
    // no cuadraría con el saldo mostrado arriba.
    db.execute(sql`
      SELECT nc.id, nc.codigo, nc.encf,
             to_char(nc.fecha_emision, 'YYYY-MM-DD') AS fecha,
             nc.monto_total, nc.razon_modificacion AS razon
      FROM ecf_documents nc
      WHERE nc.team_id = ${teamId}
        AND nc.tipo_ecf = '34'
        AND nc.credito_generado_cents IS NULL
        AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
        AND nc.codigo_modificacion IS DISTINCT FROM 2
        AND (
          nc.origen_documento_id = ${docId}
          OR (${cab.encf} LIKE 'E%' AND nc.ncf_modificado = ${cab.encf})
        )
      ORDER BY nc.fecha_emision ASC, nc.id ASC
    `),
    // ND de mora con saldo vivo (las anuladas y las ya cobradas no suman).
    db.execute(sql`
      SELECT nd.id, nd.codigo, nd.encf,
             to_char(nd.fecha_emision, 'YYYY-MM-DD') AS fecha,
             nd.monto_total - coalesce((
               SELECT SUM(p.monto_centavos) FROM pagos_recibidos p
               WHERE p.ecf_document_id = nd.id
             ), 0) AS saldo
      FROM ecf_documents nd
      WHERE nd.team_id = ${teamId}
        AND nd.mora_origen_id = ${docId}
        AND nd.estado != 'ANULADO'
      ORDER BY nd.fecha_emision ASC, nd.id ASC
    `),
  ]);

  const pagos: PagoDetalle[] = (pagosRaw as unknown as Array<Record<string, string | number | null>>)
    .map(p => ({
      id:         Number(p.id),
      fecha:      String(p.fecha),
      montoCents: Number(p.monto_centavos),
      metodo:     String(p.metodo),
      referencia: (p.referencia as string) ?? null,
      cuenta:     (p.cuenta as string) ?? null,
      notas:      (p.notas as string) ?? null,
      usuario:    (p.usuario as string) ?? null,
    }));

  const notasCredito: NotaAplicada[] = (ncRaw as unknown as Array<Record<string, string | number | null>>)
    .map(n => ({
      id:         Number(n.id),
      codigo:     (n.codigo as string) ?? null,
      encf:       (n.encf as string) ?? null,
      fecha:      String(n.fecha),
      montoCents: Number(n.monto_total),
      razon:      (n.razon as string) ?? null,
    }));

  const notasMora: NotaAplicada[] = (moraRaw as unknown as Array<Record<string, string | number | null>>)
    .map(n => ({
      id:         Number(n.id),
      codigo:     (n.codigo as string) ?? null,
      encf:       (n.encf as string) ?? null,
      fecha:      String(n.fecha),
      montoCents: Number(n.saldo),
      razon:      null,
    }))
    .filter(n => n.montoCents > 0);

  // ── Timeline ──────────────────────────────────────────────────────────────
  // Signo: positivo sube la deuda (emisión, mora), negativo la baja (pago, NC).
  const timeline: EventoCartera[] = [
    {
      tipo:       'emision' as const,
      fecha:      cab.fecha_emision,
      montoCents: Number(cab.monto_total),
      titulo:     'Factura emitida',
      detalle:    cab.codigo ?? cab.encf,
    },
    ...notasMora.map<EventoCartera>(n => ({
      tipo:       'mora',
      fecha:      n.fecha,
      montoCents: n.montoCents,
      titulo:     'Mora generada',
      detalle:    n.codigo ?? n.encf,
      docId:      n.id,
    })),
    ...notasCredito.map<EventoCartera>(n => ({
      tipo:       'nota-credito',
      fecha:      n.fecha,
      montoCents: -n.montoCents,
      titulo:     'Nota de crédito aplicada',
      detalle:    [n.codigo ?? n.encf, n.razon].filter(Boolean).join(' · ') || null,
      docId:      n.id,
    })),
    ...pagos.map<EventoCartera>(p => ({
      tipo:       'pago',
      fecha:      p.fecha,
      montoCents: -p.montoCents,
      titulo:     `Pago recibido · ${labelMetodo(p.metodo)}`,
      detalle:    [p.referencia, p.usuario].filter(Boolean).join(' · ') || null,
    })),
  ].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    // Mismo día: la emisión siempre va primero, para que el saldo acumulado
    // del timeline no arranque en negativo cuando se cobra el día de emisión.
    if (a.tipo === 'emision') return -1;
    if (b.tipo === 'emision') return 1;
    return 0;
  });

  return { pagos, notasCredito, notasMora, timeline };
}
