import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { recalcularCorrida } from '@/lib/nomina/generar-corrida';

export const dynamic = 'force-dynamic';

const MENSAJES = {
  'no-existe': ['Corrida no encontrada', 404],
  'no-borrador': ['Solo se puede recalcular una corrida en borrador', 409],
  'tipo-no-recalculable': ['Las corridas de regalía y de liquidación se rehacen con su propio formulario: elimina el borrador y créala de nuevo', 409],
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

  const r = await recalcularCorrida(auth.teamId, Number(idRaw));
  if (!r.ok) {
    const [mensaje, status] = MENSAJES[r.motivo];
    return NextResponse.json({ error: mensaje }, { status });
  }
  return NextResponse.json(r);
}
