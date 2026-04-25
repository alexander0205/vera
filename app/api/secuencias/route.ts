/**
 * GET  /api/secuencias  — Lista rangos NCF desde ecf-api
 * POST /api/secuencias  — Registra un nuevo rango NCF en ecf-api
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { ncfRangos } from '@/lib/ecf-api/client';
import {
  ensureContribuyente,
  ContribuyenteCamposFaltantesError,
} from '@/lib/ecf-api/contribuyente';

const registrarSchema = z.object({
  tipoComprobante: z.string().min(2).max(2),
  desde:           z.number().int().positive(),
  hasta:           z.number().int().positive(),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  try {
    const codigoPublico = await ensureContribuyente(teamId);
    const rangos = await ncfRangos.list(codigoPublico);
    return NextResponse.json({ sequences: rangos });
  } catch (err) {
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json(
        { error: 'campos_faltantes', faltantes: err.faltantes, message: err.message },
        { status: 422 },
      );
    }
    console.error('[secuencias GET]', err);
    return NextResponse.json({ error: 'Error al obtener secuencias' }, { status: 500 });
  }
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
      { status: 400 },
    );
  }

  const { tipoComprobante, desde, hasta, fechaVencimiento } = parsed.data;

  if (desde > hasta) {
    return NextResponse.json(
      { error: 'El número inicial debe ser menor o igual al final' },
      { status: 400 },
    );
  }

  try {
    const codigoPublico = await ensureContribuyente(teamId);
    const rango = await ncfRangos.create(codigoPublico, {
      tipoComprobante,
      desde,
      hasta,
      fechaVencimiento: new Date(fechaVencimiento + 'T23:59:59.000Z').toISOString(),
    });
    return NextResponse.json({ ok: true, rango }, { status: 201 });
  } catch (err) {
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json(
        { error: 'campos_faltantes', faltantes: err.faltantes, message: err.message },
        { status: 422 },
      );
    }
    console.error('[secuencias POST]', err);
    return NextResponse.json({ error: 'Error al crear secuencia' }, { status: 500 });
  }
}
