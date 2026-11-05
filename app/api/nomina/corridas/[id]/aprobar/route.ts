import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas } from '@/lib/db/schema';
import { borrarAsientoDeOrigen, generarAsientoNomina, generarAsientoProvisionNomina } from '@/lib/contabilidad/asientos';
import { lineasDeLiquidadosEnRegalia } from '@/lib/nomina/regalia-db';
import { crearObligacionesCorrida } from '@/lib/nomina/obligaciones-db';
import { descontarPrestamosDeCorrida, PrestamoCambioError, reconciliarPrestamosDeCorrida, restaurarPrestamosDeCorrida } from '@/lib/nomina/conceptos-db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nomina/corridas/[id]/aprobar — aprueba una corrida en borrador.
 * Genera el asiento contable del devengo (si la contabilidad está activa) y
 * deja la corrida lista para pagar. Idempotente en lo contable: el índice
 * único de origen impide un doble asiento.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:correr');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [corrida] = await db
    .select({ id: nominaCorridas.id, estado: nominaCorridas.estado, tipo: nominaCorridas.tipo, fechaInicio: nominaCorridas.fechaInicio })
    .from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId)))
    .limit(1);

  if (!corrida) return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
  if (corrida.estado !== 'borrador') {
    return NextResponse.json({ error: 'La corrida ya fue aprobada' }, { status: 409 });
  }

  // Cierre de seguridad de la regalía: no se aprueba con líneas de quien ya cobró la suya en su liquidación
  // (por ejemplo, si se generó mientras otra persona registraba esa liquidación).
  if (corrida.tipo === 'regalia') {
    const indebidos = await lineasDeLiquidadosEnRegalia(auth.teamId, id, Number(corrida.fechaInicio.slice(0, 4)));
    if (indebidos.length > 0) {
      return NextResponse.json({
        error: `La regalía trae líneas de empleados que ya se liquidaron este año (${indebidos.slice(0, 5).join(', ')}${indebidos.length > 5 ? '…' : ''}): ya cobraron su regalía en la liquidación. Recalcula la corrida antes de aprobarla.`,
      }, { status: 409 });
    }
  }

  // Se reclama la aprobación ANTES de tocar nada: dos aprobaciones a la vez (doble clic, dos
  // pestañas) no pueden descontar dos veces el mismo préstamo. Solo a quien le toca sigue.
  const [reclamada] = await db
    .update(nominaCorridas)
    .set({ estado: 'aprobada', aprobadaEn: new Date() })
    .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId), eq(nominaCorridas.estado, 'borrador')))
    .returning({ id: nominaCorridas.id });
  if (!reclamada) return NextResponse.json({ error: 'La corrida ya fue aprobada' }, { status: 409 });

  let ajustesPrestamos: Awaited<ReturnType<typeof reconciliarPrestamosDeCorrida>>;
  let asiento: Awaited<ReturnType<typeof generarAsientoNomina>> = { creado: false, motivo: 'contabilidad-apagada' };
  let provision: Awaited<ReturnType<typeof generarAsientoProvisionNomina>> = { creado: false, motivo: 'contabilidad-apagada' };
  let prestamosDescontados = false;
  try {
    // Un préstamo cancelado, o ya cobrado por otro borrador, no se descuenta de más.
    ajustesPrestamos = await reconciliarPrestamosDeCorrida(auth.teamId, id);

    // Lo que no se puede repetir va PRIMERO y es atómico (con cada préstamo bloqueado): si otra corrida
    // se llevó saldo, falla aquí, antes de que exista ningún asiento, y el libro no se entera.
    await descontarPrestamosDeCorrida(auth.teamId, id);
    prestamosDescontados = true;

    // El asiento es opcional: si la contabilidad está apagada, la corrida se
    // aprueba igual y queda sin asientoId (motivo 'contabilidad-apagada').
    asiento = await generarAsientoNomina(auth.teamId, id, auth.user.id);

    // Provisión (regalía/vac/cesantía): solo si el team activó provisionar en el
    // libro. Best-effort: no rompe la aprobación.
    provision = await generarAsientoProvisionNomina(auth.teamId, id, auth.user.id);

    // Las obligaciones al Estado (TSS/DGII) nacen aquí, pendientes de pago.
    await crearObligacionesCorrida(auth.teamId, id);
  } catch (err) {
    // Se deshace TODO lo de este intento, para que el libro y los préstamos queden igual que la corrida. Los
    // asientos se borran SIEMPRE, aunque no los haya creado esta petición: un «Generar pendientes» del libro
    // diario pudo crearlos entretanto, y una corrida en borrador no puede tener asientos.
    for (const origen of ['nomina', 'provision_nomina'] as const) {
      try {
        await borrarAsientoDeOrigen(auth.teamId, origen, id);
      } catch (e2) {
        console.error(`[nomina] No se pudo borrar el asiento «${origen}» de la corrida ${id} al revertir su aprobación`, e2);
      }
    }
    if (prestamosDescontados) await restaurarPrestamosDeCorrida(auth.teamId, id);
    await db
      .update(nominaCorridas)
      .set({ estado: 'borrador', aprobadaEn: null })
      .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId), eq(nominaCorridas.estado, 'aprobada')));
    if (err instanceof PrestamoCambioError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }

  const [actualizada] = asiento.creado
    ? await db.update(nominaCorridas).set({ asientoId: asiento.asientoId }).where(eq(nominaCorridas.id, id)).returning()
    : await db.select().from(nominaCorridas).where(eq(nominaCorridas.id, id)).limit(1);

  return NextResponse.json({ corrida: actualizada, asiento, provision, ajustesPrestamos });
}
