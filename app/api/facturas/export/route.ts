import { NextRequest } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams } from '@/lib/db/schema';
import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';

const TIPO_LABELS: Record<string, string> = {
  '31': 'Factura de Crédito Fiscal', '32': 'Factura de Consumo', '33': 'Nota de Débito',
  '34': 'Nota de Crédito', '41': 'Compras', '43': 'Gastos Menores',
  '44': 'Reg. Único de Ingresos', '45': 'Gubernamental', '46': 'Exportaciones', '47': 'Otros',
  '00': 'Histórica',
};

const TIPO_PAGO_LABELS: Record<number, string> = {
  1: 'Contado', 2: 'Crédito', 3: 'Gratuito', 4: 'Uso o consumo',
};

// Estado del ciclo de vida e-CF (solo relevante con conexión a DGII).
const ESTADO_DGII_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador', EN_PROCESO: 'En proceso', ACEPTADO: 'Aceptado',
  ACEPTADO_CONDICIONAL: 'Aceptado condicional', RECHAZADO: 'Rechazado',
  ANULADO: 'Anulado', HISTORICA: 'Histórica',
};

const cts = (n: number) => (n / 100).toFixed(2);
const csv = (v: string | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return new Response('No autorizado', { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return new Response('Sin empresa', { status: 400 });

  const sp = req.nextUrl.searchParams;
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const estado = sp.get('estado');

  // Conexión e-CF: ecfCodigoPublico null = empresa aún no registrada en ecf-api.
  // Sin conexión, el estado DGII no aplica → se omite del export.
  const [team] = await db
    .select({ ecfCodigoPublico: teams.ecfCodigoPublico })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const hasEcf = !!team?.ecfCodigoPublico;

  const conditions = [eq(ecfDocuments.teamId, teamId)];
  if (desde) conditions.push(gte(ecfDocuments.createdAt, new Date(desde)));
  if (hasta) conditions.push(lte(ecfDocuments.createdAt, new Date(hasta + 'T23:59:59')));
  if (estado && estado !== 'todos') conditions.push(eq(ecfDocuments.estado, estado));

  const docs = await db
    .select({
      encf:                 ecfDocuments.encf,
      tipoEcf:              ecfDocuments.tipoEcf,
      estado:               ecfDocuments.estado,
      tipoPago:             ecfDocuments.tipoPago,
      rncComprador:         ecfDocuments.rncComprador,
      razonSocialComprador: ecfDocuments.razonSocialComprador,
      montoTotal:           ecfDocuments.montoTotal,
      totalItbis:           ecfDocuments.totalItbis,
      fechaEmision:         ecfDocuments.fechaEmision,
      createdAt:            ecfDocuments.createdAt,
      // Pagos en cuentas por cobrar (mismo cálculo que el listado de facturas).
      pagado: sql<number>`coalesce((
        SELECT SUM(monto_centavos) FROM pagos_recibidos
        WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
      ), 0)`,
    })
    .from(ecfDocuments)
    .where(and(...conditions))
    .orderBy(desc(ecfDocuments.createdAt))
    .limit(5000);

  // Estado de pago según condición de pago (espeja el listado):
  //   - Crédito (tipoPago=2): saldo = total − pagado → Pagada / Parcial / Pendiente.
  //   - Contado (1) / null: cobrada al momento de emitir → Pagada.
  //   - Gratuito (3) / Uso (4): sin cobro asociado.
  function estadoPago(d: typeof docs[number]): string {
    if (d.tipoPago === 3) return 'Gratuita';
    if (d.tipoPago === 4) return 'Uso o consumo';
    if (d.tipoPago === 2) {
      const saldo = d.montoTotal - (d.pagado ?? 0);
      if (saldo <= 0) return 'Pagada';
      return (d.pagado ?? 0) > 0 ? 'Parcial' : 'Pendiente';
    }
    return 'Pagada'; // contado
  }

  const header = [
    'e-NCF', 'Tipo', 'Estado de pago',
    ...(hasEcf ? ['Estado DGII'] : []),
    'Cliente', 'RNC Cliente', 'Condición de pago',
    'Monto Total', 'Pagado', 'Saldo', 'ITBIS',
    'Fecha Emisión', 'Fecha Creación',
  ].join(',');

  const lines = docs.map(d => {
    const esCredito = d.tipoPago === 2;
    const pagado = esCredito ? (d.pagado ?? 0) : d.montoTotal; // contado: pagado al emitir
    const saldo  = esCredito ? d.montoTotal - (d.pagado ?? 0) : 0;
    return [
      d.encf,
      TIPO_LABELS[d.tipoEcf] ?? d.tipoEcf,
      estadoPago(d),
      ...(hasEcf ? [ESTADO_DGII_LABELS[d.estado] ?? d.estado] : []),
      csv(d.razonSocialComprador),
      d.rncComprador ?? '',
      TIPO_PAGO_LABELS[d.tipoPago ?? 1] ?? '',
      cts(d.montoTotal),
      cts(pagado),
      cts(saldo),
      cts(d.totalItbis),
      d.fechaEmision.toISOString().slice(0, 10),
      d.createdAt.toISOString().slice(0, 10),
    ].join(',');
  });

  // BOM para que Excel muestre acentos (ñ, é…) correctamente.
  const body = '﻿' + [header, ...lines].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="facturas_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
