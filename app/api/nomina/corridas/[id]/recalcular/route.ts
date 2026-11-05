import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { recalcularCorrida } from '@/lib/nomina/generar-corrida';
import { recalcularCorridaRegalia } from '@/lib/nomina/regalia-db';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { hoyRD } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const MENSAJES = {
  'no-existe': ['Corrida no encontrada', 404],
  'no-borrador': ['Solo se puede recalcular una corrida en borrador', 409],
  'tipo-no-recalculable': ['Las corridas de liquidación se rehacen con su propio formulario: elimina el borrador y créala de nuevo', 409],
  'sin-empleados': ['Con los datos de hoy ningún empleado tiene línea en este período', 422],
} as const;

/**
 * POST /api/nomina/corridas/[id]/recalcular — vuelve a calcular un borrador con
 * lo que hay hoy (conceptos, préstamos, ausencias, horas, salarios).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:correr', { escritura: true });
  if (!auth.ok) return auth.response;
  const idRaw = (await params).id;
  if (!/^\d{1,9}$/.test(idRaw)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const id = Number(idRaw);
  // La regalía se rehace con su propio cálculo (quita a quien se liquidó, toma nóminas nuevas).
  const [corrida] = await db.select({ tipo: nominaCorridas.tipo }).from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId))).limit(1);
  if (corrida?.tipo === 'regalia') {
    const rr = await recalcularCorridaRegalia(auth.teamId, id, hoyRD());
    if (!rr.ok) {
      const m = {
        'no-existe': ['Corrida no encontrada', 404],
        'no-borrador': ['Solo se puede recalcular una corrida en borrador', 409],
        'no-es-regalia': ['No es una corrida de regalía', 409],
        'sin-empleados': ['Con los datos de hoy nadie tiene regalía que pagar', 422],
      } as const;
      return NextResponse.json({ error: m[rr.motivo][0] }, { status: m[rr.motivo][1] });
    }
    return NextResponse.json(rr);
  }

  const r = await recalcularCorrida(auth.teamId, id);
  if (!r.ok) {
    const [mensaje, status] = MENSAJES[r.motivo];
    return NextResponse.json({ error: mensaje }, { status });
  }
  return NextResponse.json(r);
}
