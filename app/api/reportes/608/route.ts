/**
 * Formato 608 — Comprobantes Anulados
 * Norma General 07-18 — DGII República Dominicana
 *
 * Incluye todos los e-CF con estado ANULADO del período
 * Archivo: DGII_F_608_{RNC}_{AAAAMM}.TXT
 *
 * Header  : 608|RNC|AAAAMM|NumRegistros
 * Detalle : 3 campos por pipe — sin fila de encabezado de columnas
 *   1  NCF anulado (e-NCF: 13 posiciones, ej: E310000000001)
 *   2  Fecha Comprobante (AAAAMMDD)
 *   3  Tipo de Anulación:
 *        01 = Deterioro de factura preimpresa
 *        02 = Errores de impresión (preimpresa)
 *        03 = Impresión defectuosa
 *        04 = Corrección de la información
 *        05 = Cambio de productos
 *        06 = Devolución de productos
 *        07 = Omisión de productos
 *        08 = Errores en secuencia de NCF
 *        09 = Por cese de operaciones
 *        10 = Pérdida o hurto de talonarios
 */
import { NextRequest } from 'next/server';
import { getTeamIdForUser, getTeamProfile } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { and, eq, gte, lt } from 'drizzle-orm';

function fmtFecha(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export async function GET(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return new Response('No autorizado', { status: 401 });

  const sp   = req.nextUrl.searchParams;
  const anio = sp.get('anio') ?? String(new Date().getFullYear());
  const mes  = (sp.get('mes') ?? String(new Date().getMonth() + 1)).padStart(2, '0');

  const desde = new Date(`${anio}-${mes}-01T00:00:00`);
  const hasta = new Date(desde);
  hasta.setMonth(hasta.getMonth() + 1);

  const [team, docs] = await Promise.all([
    getTeamProfile(teamId),
    db.select().from(ecfDocuments).where(
      and(
        eq(ecfDocuments.teamId, teamId),
        eq(ecfDocuments.estado, 'ANULADO'),
        gte(ecfDocuments.fechaEmision, desde),
        lt(ecfDocuments.fechaEmision, hasta),
      )
    ),
  ]);

  const teamRnc = (team?.rnc ?? '').replace(/\D/g, '');
  const periodo = `${anio}${mes}`;
  const filename = `DGII_F_608_${teamRnc}_${periodo}.TXT`;

  const lines: string[] = [];

  // ─── Header DGII ──────────────────────────────────────────────────────────
  lines.push(`608|${teamRnc}|${periodo}|${docs.length}`);

  // ─── Detalle ──────────────────────────────────────────────────────────────
  for (const d of docs) {
    const ncf          = d.encf ?? '';
    const fechaComp    = fmtFecha(d.fechaEmision);
    // tipoAnulacion almacenado al momento de anular (default: 04 = corrección de información)
    const tipoAnulacion = d.tipoAnulacion ?? '04';

    lines.push([
      ncf,           // 1  NCF anulado
      fechaComp,     // 2  Fecha comprobante AAAAMMDD
      tipoAnulacion, // 3  Tipo de anulación (01-10)
    ].join('|'));
  }

  // CRLF obligatorio según Norma 07-18
  const content = lines.join('\r\n');

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
