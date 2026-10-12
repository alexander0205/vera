import { NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas, nominaLineas, teams } from '@/lib/db/schema';
import { fmtFechaCorta } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const RD = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 });
const pesos = (cents: number) => RD.format(cents / 100);

/**
 * GET /api/nomina/corridas/[id]/constancia — hoja para imprimir con una línea de
 * firma por empleado, para los pagos en efectivo (la constancia de que cobró).
 * Solo entra quien todavía no cobró; `?lineas=1,2,3` la limita a esas líneas.
 * Es una página HTML sola (sin el menú de la app) lista para imprimir.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:pagar');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  if (!/^\d{1,9}$/.test(idRaw)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const id = Number(idRaw);

  const [corrida] = await db
    .select()
    .from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId)))
    .limit(1);
  if (!corrida) return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
  if (corrida.estado === 'borrador') {
    return NextResponse.json({ error: 'La corrida debe estar aprobada para pagarla' }, { status: 409 });
  }

  const lineasParam = new URL(req.url).searchParams.get('lineas');
  let soloLineas: number[] | null = null;
  if (lineasParam !== null) {
    if (!/^\d{1,9}(,\d{1,9}){0,999}$/.test(lineasParam)) {
      return NextResponse.json({ error: 'El parámetro lineas debe ser una lista de IDs' }, { status: 400 });
    }
    soloLineas = lineasParam.split(',').map(Number);
  }

  const lineas = await db
    .select({ nombre: nominaLineas.nombre, cedula: nominaLineas.cedula, cargo: nominaLineas.cargo, netoCents: nominaLineas.netoCents })
    .from(nominaLineas)
    .where(and(
      eq(nominaLineas.corridaId, id),
      eq(nominaLineas.teamId, auth.teamId),
      eq(nominaLineas.pagada, false),
      soloLineas ? inArray(nominaLineas.id, soloLineas) : undefined,
    ))
    .orderBy(asc(nominaLineas.nombre));
  if (lineas.length === 0) {
    return NextResponse.json({ error: 'No hay empleados pendientes de pago para la constancia' }, { status: 409 });
  }

  const [team] = await db.select({ nombre: teams.razonSocial, comercial: teams.nombreComercial, rnc: teams.rnc, name: teams.name }).from(teams).where(eq(teams.id, auth.teamId)).limit(1);
  const total = lineas.reduce((s, l) => s + l.netoCents, 0);

  const filas = lineas.map((l, i) => `
    <tr>
      <td class="n">${i + 1}</td>
      <td><strong>${esc(l.nombre)}</strong>${l.cargo ? `<div class="sub">${esc(l.cargo)}</div>` : ''}</td>
      <td>${esc(l.cedula || '—')}</td>
      <td class="m">${esc(pesos(l.netoCents))}</td>
      <td class="firma"></td>
    </tr>`).join('');

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Constancia de pago en efectivo · ${esc(corrida.descripcion)}</title>
<style>
  body { font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 2px; } .sub { color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #999; padding: 8px 10px; text-align: left; vertical-align: middle; }
  th { background: #f1f1f1; font-size: 12px; } td.n { width: 28px; text-align: center; } td.m { text-align: right; white-space: nowrap; }
  td.firma { width: 32%; height: 38px; } tfoot td { font-weight: 600; background: #fafafa; }
  .pie { margin-top: 18px; font-size: 12px; color: #444; } .acciones { margin-bottom: 16px; }
  button { font: inherit; padding: 8px 14px; cursor: pointer; }
  @media print { .acciones { display: none; } body { margin: 10mm; } tr { break-inside: avoid; } }
</style></head><body>
  <div class="acciones"><button onclick="window.print()">Imprimir</button></div>
  <h1>Constancia de pago de nómina en efectivo</h1>
  <div class="sub">${esc(team?.nombre || team?.comercial || team?.name || '')}${team?.rnc ? ` · RNC ${esc(team.rnc)}` : ''}</div>
  <div class="sub">${esc(corrida.descripcion)} · del ${esc(fmtFechaCorta(corrida.fechaInicio))} al ${esc(fmtFechaCorta(corrida.fechaFin))}</div>
  <table>
    <thead><tr><th>#</th><th>Empleado</th><th>Cédula</th><th>Neto recibido</th><th>Firma</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td colspan="3">Total · ${lineas.length} empleado${lineas.length === 1 ? '' : 's'}</td><td class="m">${esc(pesos(total))}</td><td></td></tr></tfoot>
  </table>
  <p class="pie">Firmo como recibido el monto neto indicado, correspondiente al período arriba descrito. Fecha de entrega: ____ / ____ / ________</p>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // La hoja no ejecuta nada: ni scripts remotos ni nada fuera de lo suyo.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    },
  });
}
