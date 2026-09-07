import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/**
 * El interruptor de la facturación automática escolar.
 *
 * Guarda una FECHA, no un sí/no: es la línea a partir de la cual el calendario
 * de cada concepto emite su factura solo. Encenderlo hoy no factura la
 * mensualidad que se emitió la semana pasada, que es justo lo que haría un
 * booleano — y en el colegio que estrenó esto habrían salido 57 facturas por
 * RD$587,000 sin que nadie lo pidiera.
 *
 * Apagarlo borra la fecha. Lo ya facturado se queda: son documentos, no un
 * ajuste que se pueda deshacer desde aquí.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const [fila] = await db
    .select({ desde: teams.escolarFacturacionAutomaticaDesde })
    .from(teams)
    .where(eq(teams.id, auth.teamId))
    .limit(1);

  return NextResponse.json({ activa: !!fila?.desde, desde: fila?.desde ?? null });
}

export async function PUT(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const cuerpo = await req.json().catch(() => ({}));
  if (typeof cuerpo?.activa !== 'boolean') {
    return NextResponse.json({ error: 'Falta «activa» (true/false)' }, { status: 400 });
  }

  // La fecha la pone el servidor, siempre hoy. Dejar elegirla desde el cliente
  // sería dejar facturar hacia atrás por la puerta de servicio.
  const desde = cuerpo.activa ? new Date().toISOString().slice(0, 10) : null;

  // Encender dos veces no mueve la línea: si ya estaba encendida se respeta la
  // fecha original, que es desde cuándo el colegio lleva facturando solo.
  const [fila] = await db
    .select({ desde: teams.escolarFacturacionAutomaticaDesde })
    .from(teams)
    .where(eq(teams.id, auth.teamId))
    .limit(1);

  if (cuerpo.activa && fila?.desde) {
    return NextResponse.json({ activa: true, desde: fila.desde });
  }

  await db.update(teams)
    .set({ escolarFacturacionAutomaticaDesde: desde, updatedAt: new Date() })
    .where(eq(teams.id, auth.teamId));

  return NextResponse.json({ activa: !!desde, desde });
}
