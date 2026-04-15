import { NextRequest } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq, gte, lte, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return new Response('No autorizado', { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return new Response('Sin empresa', { status: 400 });

  const sp = req.nextUrl.searchParams;
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const estado = sp.get('estado');

  const conditions = [eq(ecfDocuments.teamId, teamId)];
  if (desde) conditions.push(gte(ecfDocuments.createdAt, new Date(desde)));
  if (hasta) conditions.push(lte(ecfDocuments.createdAt, new Date(hasta + 'T23:59:59')));
  if (estado && estado !== 'todos') conditions.push(eq(ecfDocuments.estado, estado));

  const docs = await db
    .select()
    .from(ecfDocuments)
    .where(and(...conditions))
    .orderBy(desc(ecfDocuments.createdAt))
    .limit(5000);

  const TIPO_LABELS: Record<string, string> = {
    '31': 'Factura de Crédito Fiscal', '32': 'Factura de Consumo', '33': 'Nota de Débito',
    '34': 'Nota de Crédito', '41': 'Compras', '43': 'Gastos Menores',
    '44': 'Reg. Único de Ingresos', '45': 'Gubernamental', '46': 'Exportaciones', '47': 'Otros',
  };

  const rows = [
    ['e-NCF', 'Tipo', 'Estado', 'Cliente', 'RNC Cliente', 'Monto Total', 'ITBIS', 'Fecha Emisión', 'Fecha Creación'].join(','),
    ...docs.map(d => [
      d.encf,
      TIPO_LABELS[d.tipoEcf] ?? d.tipoEcf,
      d.estado,
      `"${(d.razonSocialComprador ?? '').replace(/"/g, '""')}"`,
      d.rncComprador ?? '',
      (d.montoTotal / 100).toFixed(2),
      (d.totalItbis / 100).toFixed(2),
      d.fechaEmision.toISOString().slice(0, 10),
      d.createdAt.toISOString().slice(0, 10),
    ].join(',')),
  ].join('\n');

  return new Response(rows, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="facturas_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
