/**
 * GET /api/reportes/ventas-generales/export?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * CSV de documentos del rango. Permiso requerido: reportes:ver.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser, getVentasGenerales } from '@/lib/db/queries';
import { roleHasPermission } from '@/lib/config/roles';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const TIPO_NOMBRE: Record<string, string> = {
  '31': 'Factura', '32': 'Factura Consumo', '33': 'Nota Debito', '34': 'Nota Credito',
  '41': 'Compra',  '43': 'Gasto Menor',     '44': 'Regimen Especial', '45': 'Gubernamental',
  '46': 'Exportacion', '47': 'Pago Exterior',
};

function csvEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!roleHasPermission(member?.role, 'reportes:ver')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const url = new URL(req.url);
  const desdeStr = url.searchParams.get('desde');
  const hastaStr = url.searchParams.get('hasta');
  const now = new Date();
  const from = desdeStr ? new Date(desdeStr) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to   = hastaStr ? new Date(hastaStr + 'T23:59:59') : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const data = await getVentasGenerales(teamId, from, to);

  // Header + rows
  const lines: string[] = [];
  lines.push(['Documento', 'Tipo', 'Cliente', 'RNC', 'Estado', 'Fecha', 'Subtotal', 'ITBIS', 'Total'].map(csvEscape).join(','));

  for (const d of data.documentos) {
    const subtotal = (d.montoTotal - d.totalItbis) / 100;
    lines.push([
      d.encf,
      TIPO_NOMBRE[d.tipoEcf] ?? d.tipoEcf,
      d.razonSocialComprador ?? 'Consumidor Final',
      d.rncComprador ?? '',
      d.estado,
      new Date(d.fechaEmision).toISOString().slice(0, 10),
      subtotal.toFixed(2),
      (d.totalItbis / 100).toFixed(2),
      (d.montoTotal / 100).toFixed(2),
    ].map(csvEscape).join(','));
  }

  // Totales al final
  lines.push('');
  lines.push(['Ventas brutas',     (data.montos.ventasBrutas / 100).toFixed(2)].join(','));
  lines.push(['Notas credito',     (data.montos.notasCredito / 100).toFixed(2)].join(','));
  lines.push(['Antes impuestos',   (data.montos.antesImpuestos / 100).toFixed(2)].join(','));
  lines.push(['Impuestos',         (data.montos.impuestos / 100).toFixed(2)].join(','));
  lines.push(['Despues impuestos', (data.montos.despuesImpuestos / 100).toFixed(2)].join(','));

  const csv = '﻿' + lines.join('\n'); // BOM para Excel

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ventas-generales-${from.toISOString().slice(0,10)}-${to.toISOString().slice(0,10)}.csv"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}
