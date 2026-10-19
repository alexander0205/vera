/**
 * Dar de baja a un alumno o volver a darlo de alta.
 *
 *   GET  ?accion=baja|reingreso&fecha=YYYY-MM-DD → qué va a pasar (no escribe)
 *   GET  ?accion=historial → sus bajas y reingresos, el último primero
 *   POST { accion: 'baja', estado, fecha, motivo?, anularPosteriores }
 *   POST { accion: 'reingreso', fecha, reabrirMatricula }
 *
 * Va aparte del PATCH del estudiante a propósito: cambiar el estado no es
 * editar un campo, arrastra su matrícula, su mensualidad automática y sus
 * cuotas. Ver lib/administracion-escolar/baja-reingreso.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { hoyRD } from '@/lib/utils/format';
import {
  ESTADOS_DE_BAJA, darDeBaja, movimientosDeEstudiante, previaBaja, previaReingreso, reingresar,
  type EstadoDeBaja,
} from '@/lib/administracion-escolar/baja-reingreso';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function delTeam(teamId: number, id: string) {
  const estudianteId = Number(id);
  if (!Number.isInteger(estudianteId) || estudianteId <= 0) return null;
  const [e] = await db.select({ id: adminEscolarEstudiantes.id, estado: adminEscolarEstudiantes.estado })
    .from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  return e ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const est = await delTeam(auth.teamId, (await params).id);
  if (!est) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const fecha = FECHA.test(sp.get('fecha') ?? '') ? sp.get('fecha')! : hoyRD();
  if (sp.get('accion') === 'historial') {
    return NextResponse.json({ movimientos: await movimientosDeEstudiante(auth.teamId, est.id) });
  }
  if (sp.get('accion') === 'reingreso') {
    return NextResponse.json(await previaReingreso(auth.teamId, est.id, fecha));
  }
  return NextResponse.json(await previaBaja(auth.teamId, est.id, fecha));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const est = await delTeam(auth.teamId, (await params).id);
  if (!est) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const fecha = typeof body.fecha === 'string' && FECHA.test(body.fecha) ? body.fecha : hoyRD();

  if (body.accion === 'baja') {
    if (!ESTADOS_DE_BAJA.includes(body.estado)) {
      return NextResponse.json({ error: 'Elige si se retira, queda inactivo o se gradúa.' }, { status: 400 });
    }
    // En una línea: va a las notas de la matrícula, una línea por baja.
    const motivo = typeof body.motivo === 'string'
      ? body.motivo.replace(/\s+/g, ' ').trim().slice(0, 200) || null
      : null;
    const r = await darDeBaja(auth.teamId, est.id, {
      estado: body.estado as EstadoDeBaja, fecha, motivo, anularPosteriores: body.anularPosteriores === true,
      userId: auth.user.id,
    });
    return NextResponse.json({ ok: true, ...r });
  }

  if (body.accion === 'reingreso') {
    if (est.estado === 'activo') {
      return NextResponse.json({ error: 'El alumno ya está activo.' }, { status: 409 });
    }
    const r = await reingresar(auth.teamId, est.id, { fecha, reabrirMatricula: body.reabrirMatricula === true, userId: auth.user.id });
    return NextResponse.json({ ok: true, ...r });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
