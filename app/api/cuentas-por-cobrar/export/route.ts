/**
 * GET /api/cuentas-por-cobrar/export — exporta la cartera a Excel (.xlsx)
 *
 * Acepta los MISMOS filtros que el listado (search, tipoDoc, estado, cubeta,
 * orden), así que el archivo contiene exactamente lo que el usuario está
 * viendo en pantalla, con el mismo saldo.
 *
 * No reutiliza /api/reportes/export?report=cuentas-por-cobrar: ese se apoya en
 * getAgingCxC, que usa otra definición de cobrable y NO descuenta las notas de
 * crédito, así que da un total distinto al de esta pantalla.
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requirePermission } from '@/lib/auth/api-guard';
import {
  getCuentasPorCobrar, CUBETAS_ANTIGUEDAD,
  type OrdenCartera, type CubetaAntiguedad,
} from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

export const maxDuration = 60;

const DOP = '"RD$"#,##0.00';
const ORDENES: OrdenCartera[] = ['reciente', 'antiguo', 'monto', 'vencimiento'];

const CUBETA_LABEL: Record<CubetaAntiguedad, string> = {
  porVencer: 'Por vencer', d1a30: '1-30 días', d31a60: '31-60 días',
  d61a90: '61-90 días', d90mas: '+90 días',
};

/** Cubeta de una fila, con los mismos cortes que el CTE. */
function cubetaDe(vencida: boolean, dias: number): string {
  if (!vencida) return CUBETA_LABEL.porVencer;
  if (dias <= 30) return CUBETA_LABEL.d1a30;
  if (dias <= 60) return CUBETA_LABEL.d31a60;
  if (dias <= 90) return CUBETA_LABEL.d61a90;
  return CUBETA_LABEL.d90mas;
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission('facturas:exportar');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const sp = req.nextUrl.searchParams;
  const tipoDoc = sp.get('tipoDoc');
  const estado  = sp.get('estado');
  const orden   = sp.get('orden');
  const cubeta  = sp.get('cubeta');

  // Tope duro: exportar toda la cartera abierta, no una página.
  const { cuentas, totales } = await getCuentasPorCobrar(teamId, {
    limit:   2000,
    search:  sp.get('search') ?? undefined,
    tipoDoc: tipoDoc === 'factura' || tipoDoc === 'nota-debito' ? tipoDoc : undefined,
    estado:  estado === 'vencidas' || estado === 'al-dia' ? estado : undefined,
    orden:   ORDENES.includes(orden as OrdenCartera) ? (orden as OrdenCartera) : undefined,
    cubeta:  CUBETAS_ANTIGUEDAD.includes(cubeta as CubetaAntiguedad) ? (cubeta as CubetaAntiguedad) : undefined,
  });

  // Datos de gestión de las filas exportadas — es lo que hace útil el archivo
  // para trabajar la cartera fuera del sistema.
  const ids = cuentas.map(c => c.id);
  const gestion = new Map<number, { responsable: string | null; proxima: string | null; proximaFecha: string | null; ultimoContacto: string | null; promesa: string | null }>();
  if (ids.length > 0) {
    const filas = await db.execute(sql`
      SELECT d.id,
        r.name AS responsable,
        s.proxima_accion,
        to_char(s.proxima_accion_fecha, 'YYYY-MM-DD') AS proxima_accion_fecha,
        (SELECT to_char(MAX(e.fecha), 'YYYY-MM-DD') FROM cobranza_eventos e
          WHERE e.ecf_document_id = d.id AND e.tipo = 'contacto') AS ultimo_contacto,
        (SELECT to_char(e2.promesa_fecha, 'YYYY-MM-DD') FROM cobranza_eventos e2
          WHERE e2.ecf_document_id = d.id AND e2.tipo = 'promesa'
            AND e2.promesa_estado = 'pendiente'
          ORDER BY e2.promesa_fecha DESC LIMIT 1) AS promesa_pendiente
      FROM ecf_documents d
      LEFT JOIN cobranza_seguimiento s ON s.ecf_document_id = d.id
      LEFT JOIN users r ON r.id = s.responsable_user_id
      WHERE d.team_id = ${teamId}
        AND d.id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})
    `) as unknown as Array<Record<string, string | number | null>>;

    for (const f of filas) {
      gestion.set(Number(f.id), {
        responsable:    (f.responsable as string) ?? null,
        proxima:        (f.proxima_accion as string) ?? null,
        proximaFecha:   (f.proxima_accion_fecha as string) ?? null,
        ultimoContacto: (f.ultimo_contacto as string) ?? null,
        promesa:        (f.promesa_pendiente as string) ?? null,
      });
    }
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Zero';
  const ws = wb.addWorksheet('Cartera');

  ws.columns = [
    { header: 'Documento',       key: 'codigo',      width: 26 },
    { header: 'Cliente',         key: 'cliente',     width: 34 },
    { header: 'RNC',             key: 'rnc',         width: 14 },
    { header: 'Emisión',         key: 'emision',     width: 12 },
    { header: 'Vence',           key: 'vence',       width: 12 },
    { header: 'Días vencido',    key: 'dias',        width: 13 },
    { header: 'Antigüedad',      key: 'cubeta',      width: 13 },
    { header: 'Total',           key: 'total',       width: 15, style: { numFmt: DOP } },
    { header: 'Pagado',          key: 'pagado',      width: 15, style: { numFmt: DOP } },
    { header: 'Notas crédito',   key: 'nc',          width: 15, style: { numFmt: DOP } },
    { header: 'Saldo factura',   key: 'saldoFact',   width: 15, style: { numFmt: DOP } },
    { header: 'Mora',            key: 'mora',        width: 14, style: { numFmt: DOP } },
    { header: 'Saldo a cobrar',  key: 'saldo',       width: 17, style: { numFmt: DOP } },
    { header: 'Responsable',     key: 'responsable', width: 22 },
    { header: 'Último contacto', key: 'contacto',    width: 15 },
    { header: 'Promesa de pago', key: 'promesa',     width: 15 },
    { header: 'Próxima acción',  key: 'proxima',     width: 34 },
  ];

  for (const c of cuentas) {
    const g = gestion.get(c.id);
    ws.addRow({
      codigo:      c.codigo ?? c.encf,
      cliente:     c.razonSocialComprador ?? 'Consumidor Final',
      rnc:         c.rncComprador ?? '',
      emision:     c.fechaEmision,
      vence:       c.fechaLimitePago ?? '',
      dias:        c.vencida ? c.diasVencido : 0,
      cubeta:      cubetaDe(c.vencida, c.diasVencido),
      total:       c.montoTotal / 100,
      pagado:      c.pagado / 100,
      nc:          c.ncAplicado / 100,
      saldoFact:   c.saldoFactura / 100,
      mora:        c.moraSaldo / 100,
      saldo:       c.saldo / 100,
      responsable: g?.responsable ?? '',
      contacto:    g?.ultimoContacto ?? '',
      promesa:     g?.promesa ?? '',
      proxima:     [g?.proxima, g?.proximaFecha].filter(Boolean).join(' · '),
    });
  }

  // Fila de totales, para que el archivo cuadre con lo que muestra la pantalla.
  ws.addRow({});
  const fin = ws.addRow({
    cliente: `TOTAL (${totales.count} cuenta${totales.count !== 1 ? 's' : ''}, ${totales.countVencidas} vencida${totales.countVencidas !== 1 ? 's' : ''})`,
    saldo:   totales.pendiente / 100,
  });
  fin.font = { bold: true };

  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="cartera.xlsx"',
    },
  });
}
