/**
 * GET /api/admin/ia/consumo?mes=2026-10            → por empresa (gasto y uso) y por modelo, ese mes.
 * GET /api/admin/ia/consumo?mes=2026-10&teamId=22  → de esa empresa, por conversación.
 *
 * Solo el administrador de la plataforma. Ver lib/ia/consumo-reporte.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/admin-guard';
import { consumoPorConversacion, consumoPorEmpresa, consumoPorModelo, rangoDelMes } from '@/lib/ia/consumo-reporte';

const mesActualRd = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' }).slice(0, 7);

export async function GET(req: NextRequest) {
  const a = await requirePlatformAdmin();
  if (!a.ok) return a.response;
  const mes = req.nextUrl.searchParams.get('mes') || mesActualRd();
  const rango = rangoDelMes(mes);
  if (!rango) return NextResponse.json({ error: 'Mes inválido (AAAA-MM).' }, { status: 400 });
  const teamParam = req.nextUrl.searchParams.get('teamId');
  try {
    if (teamParam != null) {
      const teamId = Number(teamParam);
      if (!Number.isInteger(teamId) || teamId <= 0) return NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 });
      return NextResponse.json({ mes, teamId, conversaciones: await consumoPorConversacion(teamId, rango.desde, rango.hasta) });
    }
    const [empresas, modelos] = await Promise.all([
      consumoPorEmpresa(rango.desde, rango.hasta),
      consumoPorModelo(rango.desde, rango.hasta),
    ]);
    return NextResponse.json({ mes, empresas, modelos });
  } catch (e) {
    console.error('[admin ia] no se pudo leer el consumo', e);
    return NextResponse.json({ error: 'No se pudo leer el consumo. ¿Se corrió la migración 0208?' }, { status: 500 });
  }
}
