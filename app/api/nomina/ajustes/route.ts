import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import {
  capitaDependienteVigente,
  capitaTotalCents,
  esTamanoEmpresa,
  esTasaSrl,
  SRL_TASA_MAX,
  SRL_TASA_MIN,
  tablaSalarioMinimo,
  tasasDelAnio,
} from '@/lib/config/nomina-tasas';
import { ajustesNomina } from '@/lib/nomina/ajustes-db';
import { hoyRD } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nomina/ajustes — la seguridad social de la empresa (tamaño y tasa
 * SRL) con lo que se deriva hoy: el salario mínimo que hace de piso y la cápita
 * por dependiente adicional. Lo lee también el alta de empleados para su
 * resumen de pago, así que basta con `empleados:ver`.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const hoy = hoyRD();
  const ajustes = await ajustesNomina(auth.teamId, hoy);
  const capita = capitaDependienteVigente(hoy);
  const tabla = tablaSalarioMinimo(hoy);

  return NextResponse.json({
    ...ajustes,
    srlTasaAnio: tasasDelAnio(Number(hoy.slice(0, 4))).srlPatronal,
    srlMin: SRL_TASA_MIN,
    srlMax: SRL_TASA_MAX,
    capita: { ...capita, totalCents: capitaTotalCents(capita) },
    salariosMinimos: tabla,
  });
}

/**
 * PUT /api/nomina/ajustes — guarda tamaño de empresa y tasa SRL. Los dos se
 * pueden dejar vacíos: sin tamaño no hay piso, y sin tasa se usa la del año.
 */
export async function PUT(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const tamano = body.tamanoEmpresa === '' || body.tamanoEmpresa == null ? null : body.tamanoEmpresa;
  if (tamano !== null && !esTamanoEmpresa(tamano)) {
    return NextResponse.json({ error: 'Tamaño de empresa inválido' }, { status: 400 });
  }

  const srlCruda = body.srlTasa === '' || body.srlTasa == null ? null : Number(body.srlTasa);
  if (srlCruda !== null && !esTasaSrl(srlCruda)) {
    return NextResponse.json(
      { error: `La tasa SRL va de ${(SRL_TASA_MIN * 100).toFixed(2)} % a ${(SRL_TASA_MAX * 100).toFixed(2)} %` },
      { status: 400 },
    );
  }

  await db
    .update(teams)
    .set({
      nominaTamanoEmpresa: tamano,
      nominaSrlTasa: srlCruda === null ? null : srlCruda.toFixed(4),
    })
    .where(eq(teams.id, auth.teamId));

  return NextResponse.json({ ok: true, ...(await ajustesNomina(auth.teamId, hoyRD())) });
}
