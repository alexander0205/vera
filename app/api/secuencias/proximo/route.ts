/**
 * GET /api/secuencias/proximo?tipo=31
 *
 * Devuelve el próximo e-NCF disponible para el equipo, SIN consumirlo.
 * Útil para mostrar una preview del número en el formulario de nueva factura.
 *
 * Prioridad cuando hay múltiples secuencias del mismo tipo:
 *   1. La marcada como `preferida = true` que esté activa
 *   2. La activa con más disponibles
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { sequences } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const tipo = req.nextUrl.searchParams.get('tipo') ?? '31';

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  // Sin NCF: respuesta especial — numeración ilimitada sin e-NCF
  if (tipo === 'sin-ncf') {
    return NextResponse.json({
      encf:        null,
      sinNcf:      true,
      disponibles: -1,
      agotada:     false,
    });
  }

  // Obtener todas las secuencias del tipo para el equipo
  const seqs = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.teamId, teamId), eq(sequences.tipoEcf, tipo)));

  if (seqs.length === 0) {
    return NextResponse.json({
      encf:         null,
      disponibles:  0,
      agotada:      false,
      sinSecuencia: true,
      mensaje:      `No hay secuencias para tipo ${tipo}`,
    });
  }

  const now = new Date();

  // Enriquecer con estado calculado
  const enriquecidas = seqs.map((s) => {
    const vencida   = s.fechaVencimiento ? now > s.fechaVencimiento : false;
    const agotada   = s.secuenciaActual > s.secuenciaHasta;
    const activa    = !vencida && !agotada;
    const disponibles = activa ? Number(s.secuenciaHasta - s.secuenciaActual) + 1 : 0;
    return { ...s, vencida, agotada, activa, disponibles };
  });

  // Seleccionar la mejor secuencia:
  // 1. Preferida + activa
  // 2. Activa con más disponibles
  const preferidaActiva = enriquecidas.find((s) => s.preferida && s.activa);
  const mejorActiva     = enriquecidas
    .filter((s) => s.activa)
    .sort((a, b) => b.disponibles - a.disponibles)[0];

  const seq = preferidaActiva ?? mejorActiva ?? enriquecidas[0];

  const numero = Number(seq.secuenciaActual);
  const hasta  = Number(seq.secuenciaHasta);
  const encf   = seq.activa
    ? `E${tipo}${numero.toString().padStart(10, '0')}`
    : null;

  return NextResponse.json({
    id:              seq.id,
    encf,
    numero,
    hasta,
    disponibles:     Math.max(0, seq.disponibles),
    agotada:         seq.agotada,
    vencida:         seq.vencida,
    preferida:       seq.preferida,
    fechaVencimiento: seq.fechaVencimiento ?? null,
    pieDeFactura:    seq.pieDeFactura ?? null,
  });
}
