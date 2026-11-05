import { NextResponse } from 'next/server';
import { getIp, logAudit } from '@/lib/audit';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { AVANZADO_DEFAULT, AVANZADO_RANGOS, validarAvanzado } from '@/lib/nomina/avanzado';
import { guardarAvanzado, leerAvanzado } from '@/lib/nomina/avanzado-db';
import { esMigracionPendiente } from '@/lib/nomina/migracion-pendiente';

export const dynamic = 'force-dynamic';

/** GET /api/nomina/avanzado — los valores vigentes, los de ley y los rangos permitidos. */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar');
  if (!auth.ok) return auth.response;
  return NextResponse.json({ valores: await leerAvanzado(auth.teamId), porDefecto: AVANZADO_DEFAULT, rangos: AVANZADO_RANGOS });
}

/** PUT /api/nomina/avanzado — guarda los valores (los que no vengan quedan en su valor de ley). */
export async function PUT(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar', { escritura: true });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const v = validarAvanzado(body);
  if (!v.ok) return NextResponse.json({ error: v.errores.join('. ') }, { status: 400 });
  const anterior = await leerAvanzado(auth.teamId);
  try {
    await guardarAvanzado(auth.teamId, auth.user.id, v.valores);
  } catch (err) {
    if (esMigracionPendiente(err)) return NextResponse.json({ error: 'Falta aplicar la migración 0234 para guardar estos valores' }, { status: 503 });
    throw err;
  }
  // Solo los campos que cambiaron, con su valor anterior y el nuevo.
  const cambios = Object.fromEntries(
    (Object.keys(v.valores) as (keyof typeof v.valores)[])
      .filter((k) => v.valores[k] !== anterior[k])
      .map((k) => [k, { antes: anterior[k], despues: v.valores[k] }]),
  );
  if (Object.keys(cambios).length > 0) {
    logAudit({ teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'NOMINA_AVANZADO_CAMBIADO', ip: getIp(req), meta: { cambios } });
  }
  return NextResponse.json({ valores: v.valores });
}
