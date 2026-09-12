import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { facturarCuotasEmitidas } from '@/lib/administracion-escolar/facturar-emision';

/**
 * Factura a mano las cuotas ya emitidas que se quedaron sin factura.
 *
 * El camino normal es el cron, que hace esto solo cada día. Este endpoint
 * existe para los dos casos en que el cron no basta:
 *
 *   - Recuperar un día perdido: el cron falló, o el colegio encendió la
 *     facturación automática después de que la cuota ya se hubiera emitido.
 *   - Verlo antes de encenderlo: con un rango explícito, el colegio puede
 *     facturar un solo día y comprobar cómo salen los documentos.
 *
 * A diferencia del cron, NO mira `escolar_facturacion_automatica_desde`: aquí
 * hay una persona con permiso de gestión pidiéndolo, y el rango lo pone ella.
 * Lo que sí se mantiene es todo lo demás — una factura por responsable, en
 * borrador, solo cargos sin factura — porque es la misma función.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const cuerpo = await req.json().catch(() => ({}));
  const periodoPedido = Number(cuerpo?.periodoId) || null;

  const esFecha = (v: unknown): v is string =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  const hoy = new Date().toISOString().slice(0, 10);
  // Sin rango se factura lo emitido HOY, que es lo que hace el cron. Un rango
  // abierto hacia atrás facturaría de golpe meses de cargos pendientes, y eso
  // tiene que pedirse a propósito.
  const desde = cuerpo?.desde === undefined ? hoy : cuerpo.desde;
  const hasta = cuerpo?.hasta === undefined ? hoy : cuerpo.hasta;
  if (!esFecha(desde) || !esFecha(hasta)) {
    return NextResponse.json({ error: 'desde/hasta deben ser fechas YYYY-MM-DD' }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: 'El rango está al revés: «desde» es posterior a «hasta»' }, { status: 400 });
  }

  const [periodo] = await db
    .select({ id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre })
    .from(adminEscolarPeriodos)
    .where(periodoPedido
      ? and(eq(adminEscolarPeriodos.id, periodoPedido), eq(adminEscolarPeriodos.teamId, teamId))
      : and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
    .limit(1);

  if (!periodo) {
    return NextResponse.json({ error: 'No hay un año escolar activo' }, { status: 404 });
  }

  const resultado = await facturarCuotasEmitidas(teamId, periodo.id, { desde, hasta });

  return NextResponse.json({ periodo: periodo.nombre, desde, hasta, ...resultado });
}
