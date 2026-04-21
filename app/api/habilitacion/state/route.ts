/**
 * GET  /api/habilitacion/state — devuelve el estado persistido del wizard
 * PUT  /api/habilitacion/state — actualiza (merge) el estado con el body
 * POST /api/habilitacion/state/completar — marca habilitación como completada
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';

// Shape canónico del estado — todo opcional para permitir merges parciales
export const HabilitacionStateSchema = z.object({
  fase:     z.number().int().min(0).max(5).optional(),
  subPaso:  z.number().int().min(0).max(10).optional(),

  // Datos específicos de cada fase
  postulacion: z.object({
    xmlFirmadoDataUrl: z.string().optional(),  // data:application/xml;base64,... (para re-descargar)
    xmlFirmadoName:    z.string().optional(),
    uploadConfirmed:   z.boolean().optional(),
    validado:          z.boolean().optional(),
  }).partial().optional(),

  pruebas: z.object({
    emitidas: z.record(z.string(), z.number()).optional(),  // {'31': 4, '32g': 2, ...}
    trackIds: z.array(z.object({
      tipo:    z.string(),
      encf:    z.string(),
      trackId: z.string(),
    })).optional(),
    fc250Done: z.boolean().optional(),
    confirmed: z.boolean().optional(),
  }).partial().optional(),

  representaciones: z.object({
    downloaded:      z.array(z.string()).optional(),  // ['31','32','33',...]
    uploadConfirmed: z.boolean().optional(),
    validado:        z.boolean().optional(),
  }).partial().optional(),

  urlsProduccion: z.object({
    confirmado: z.boolean().optional(),
  }).partial().optional(),

  declaracionJurada: z.object({
    xmlFirmadoDataUrl: z.string().optional(),
    xmlFirmadoName:    z.string().optional(),
    enviado:           z.boolean().optional(),
    verificado:        z.boolean().optional(),
  }).partial().optional(),

  finalizado: z.object({
    acknowledged: z.boolean().optional(),
  }).partial().optional(),
});

export type HabilitacionState = z.infer<typeof HabilitacionStateSchema>;

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [team] = await db
    .select({
      state: teams.habilitacionState,
      completadoAt: teams.habilitacionCompletadoAt,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  let state: HabilitacionState = {};
  if (team?.state) {
    try {
      state = JSON.parse(team.state) as HabilitacionState;
    } catch {
      state = {};
    }
  }

  return NextResponse.json({
    state,
    completado:   !!team?.completadoAt,
    completadoAt: team?.completadoAt ?? null,
  });
}

// ─── PUT — merge shallow ────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const body   = await request.json().catch(() => ({}));
  const parsed = HabilitacionStateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  // Leer estado actual
  const [current] = await db
    .select({ state: teams.habilitacionState })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  let currentState: HabilitacionState = {};
  if (current?.state) {
    try { currentState = JSON.parse(current.state); } catch { /* noop */ }
  }

  // Merge shallow de las secciones top-level + deep merge dentro de cada sección objeto
  const merged: HabilitacionState = { ...currentState };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const key = k as keyof HabilitacionState;
      const prev = (currentState[key] ?? {}) as Record<string, unknown>;
      (merged as Record<string, unknown>)[k] = { ...prev, ...(v as Record<string, unknown>) };
    } else {
      (merged as Record<string, unknown>)[k] = v;
    }
  }

  await db.update(teams)
    .set({ habilitacionState: JSON.stringify(merged), updatedAt: new Date() })
    .where(eq(teams.id, teamId));

  return NextResponse.json({ ok: true, state: merged });
}

// ─── DELETE — reinicia la habilitación (útil para testing) ───────────────────

export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  await db.update(teams)
    .set({
      habilitacionState: null,
      habilitacionCompletadoAt: null,
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId));

  return NextResponse.json({ ok: true });
}
