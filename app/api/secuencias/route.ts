/**
 * GET  /api/secuencias  — Lista secuencias del equipo
 * POST /api/secuencias  — Registra un nuevo rango de secuencias (permite múltiples por tipo)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { sequences } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { TIPOS_ECF } from '@/lib/ecf/types';

// Tipos válidos de e-CF (incluye 'sin-ncf')
const TIPOS_VALIDOS = [...Object.keys(TIPOS_ECF), 'sin-ncf'] as [string, ...string[]];

const registrarSchema = z.object({
  tipoEcf:          z.string().min(2).max(10).refine(v => TIPOS_VALIDOS.includes(v), {
    message: 'Tipo e-CF no válido',
  }),
  nombre:           z.string().min(1).max(200),
  desde:            z.number().int().positive(),
  hasta:            z.number().int().positive().optional(),       // opcional para sin-ncf
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // opcional para e32/e34/sin-ncf
  preferida:        z.boolean().default(false),
  numeracionAutomatica: z.boolean().default(true),
  prefijo:          z.string().max(20).optional(),
  pieDeFactura:     z.string().max(2000).optional(),
  sucursal:         z.string().max(100).optional(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const seqs = await db
    .select()
    .from(sequences)
    .where(eq(sequences.teamId, teamId))
    .orderBy(sequences.tipoEcf);

  const now = new Date();

  const result = seqs.map((s) => {
    const esSinNcf = s.tipoEcf === 'sin-ncf';

    // Para sin-ncf: disponibles = -1 (ilimitado), secuenciaHasta puede ser irrelevante
    const disponibles = esSinNcf
      ? -1
      : Math.max(0, Number(s.secuenciaHasta - s.secuenciaActual) + 1);

    const vencida = s.fechaVencimiento ? now > s.fechaVencimiento : false;
    const agotada = !esSinNcf && disponibles <= 0;
    const estado: 'activa' | 'vencida' | 'agotada' =
      agotada ? 'agotada' : vencida ? 'vencida' : 'activa';

    return {
      id:                   s.id,
      tipoEcf:              s.tipoEcf,
      nombre:               s.nombre ?? TIPOS_ECF[s.tipoEcf as keyof typeof TIPOS_ECF] ?? `Tipo ${s.tipoEcf}`,
      secuenciaDesde:       s.secuenciaDesde.toString(),
      secuenciaActual:      s.secuenciaActual.toString(),
      secuenciaHasta:       s.secuenciaHasta.toString(),
      disponibles,
      fechaVencimiento:     s.fechaVencimiento ? s.fechaVencimiento.toISOString() : null,
      preferida:            s.preferida,
      numeracionAutomatica: s.numeracionAutomatica,
      prefijo:              s.prefijo ?? null,
      pieDeFactura:         s.pieDeFactura ?? null,
      sucursal:             s.sucursal ?? null,
      createdAt:            s.createdAt.toISOString(),
      updatedAt:            s.updatedAt.toISOString(),
      estado,
    };
  });

  return NextResponse.json({ sequences: result });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const body = await req.json();
  const parsed = registrarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', detalles: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    tipoEcf, nombre, desde, hasta, fechaVencimiento,
    preferida, numeracionAutomatica, prefijo, pieDeFactura, sucursal,
  } = parsed.data;

  const esSinNcf = tipoEcf === 'sin-ncf';

  // Validar rango (solo si no es sin-ncf)
  if (!esSinNcf) {
    if (hasta === undefined) {
      return NextResponse.json(
        { error: 'El número final (hasta) es obligatorio para este tipo de comprobante' },
        { status: 400 }
      );
    }
    if (desde > hasta) {
      return NextResponse.json(
        { error: 'El número inicial (desde) debe ser menor o igual al final (hasta)' },
        { status: 400 }
      );
    }
  }

  // Validar fecha de vencimiento (solo tipos que la requieren)
  const requiereFecha = !esSinNcf && tipoEcf !== '32' && tipoEcf !== '34';
  let fechaVenc: Date | undefined;
  if (requiereFecha) {
    if (!fechaVencimiento) {
      return NextResponse.json(
        { error: 'La fecha de vencimiento es obligatoria para este tipo de comprobante' },
        { status: 400 }
      );
    }
    fechaVenc = new Date(fechaVencimiento + 'T23:59:59');
    if (fechaVenc <= new Date()) {
      return NextResponse.json(
        { error: 'La fecha de vencimiento debe ser futura' },
        { status: 400 }
      );
    }
  } else if (fechaVencimiento) {
    // Si vino fecha aunque no se requiera, la guardamos igual
    fechaVenc = new Date(fechaVencimiento + 'T23:59:59');
  }

  const hastaFinal = esSinNcf ? BigInt(desde) : BigInt(hasta!);

  // Crear siempre una nueva secuencia (permitir múltiples por tipo)
  await db.insert(sequences).values({
    teamId,
    tipoEcf,
    nombre,
    secuenciaDesde:       BigInt(desde),
    secuenciaActual:      BigInt(desde),
    secuenciaHasta:       hastaFinal,
    fechaVencimiento:     fechaVenc ?? null,
    preferida:            preferida ?? false,
    numeracionAutomatica: numeracionAutomatica ?? true,
    prefijo:              prefijo ?? null,
    pieDeFactura:         pieDeFactura ?? null,
    sucursal:             sucursal ?? null,
  });

  return NextResponse.json({ ok: true, accion: 'creado', tipoEcf }, { status: 201 });
}
