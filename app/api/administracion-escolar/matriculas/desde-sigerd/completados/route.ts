/**
 * Los alumnos que ya se revisaron en el formulario de «Matricular desde
 * SIGERD» (familia, cargos y pagos): el «X de N completados» de la migración.
 * Uno por colegio y año, compartido entre quienes migran. Vive en la tabla de
 * borradores (migración 0216) con su propia clave, así que matricular o
 * «Empezar de cero» no lo borra.
 *
 *   GET  ?periodoId=                          → { alumnos: { [id]: { en, por } } }
 *   POST { periodoId, estudianteId, completado }
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarBorradores, adminEscolarEstudiantes, adminEscolarPeriodos } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

const CLAVE = 'desde-sigerd-completados';

type Completados = Record<string, { en: string; por: string | null }>;

async function periodoDelColegio(teamId: number, crudo: unknown): Promise<number | null> {
  const id = Number(crudo);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [p] = await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, id), eq(adminEscolarPeriodos.teamId, teamId))).limit(1);
  return p?.id ?? null;
}

const delColegio = (teamId: number, periodoId: number) => and(
  eq(adminEscolarBorradores.teamId, teamId),
  eq(adminEscolarBorradores.periodoId, periodoId),
  eq(adminEscolarBorradores.clave, CLAVE),
);

const leer = (datos: unknown): Completados => {
  const a = (datos as { alumnos?: unknown } | null)?.alumnos;
  return a && typeof a === 'object' && !Array.isArray(a) ? a as Completados : {};
};

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const periodoId = await periodoDelColegio(auth.teamId, req.nextUrl.searchParams.get('periodoId'));
  if (!periodoId) return NextResponse.json({ error: 'Año escolar inválido' }, { status: 400 });

  const [b] = await db.select({ datos: adminEscolarBorradores.datos }).from(adminEscolarBorradores)
    .where(delColegio(auth.teamId, periodoId)).limit(1);
  return NextResponse.json({ alumnos: leer(b?.datos) });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as
    { periodoId?: unknown; estudianteId?: unknown; completado?: unknown } | null;
  const periodoId = await periodoDelColegio(auth.teamId, body?.periodoId);
  if (!periodoId) return NextResponse.json({ error: 'Año escolar inválido' }, { status: 400 });
  const estudianteId = Number(body?.estudianteId);
  if (!Number.isInteger(estudianteId) || estudianteId <= 0 || typeof body?.completado !== 'boolean') {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const [est] = await db.select({ id: adminEscolarEstudiantes.id }).from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, auth.teamId))).limit(1);
  if (!est) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });

  // Dos personas migrando a la vez: la fila se bloquea y cada una suma o quita
  // solo a su alumno, sin pisar lo que marcó la otra.
  const alumnos = await db.transaction(async (tx) => {
    await tx.insert(adminEscolarBorradores)
      .values({ teamId: auth.teamId, periodoId, clave: CLAVE, datos: { alumnos: {} }, updatedBy: auth.user.id })
      .onConflictDoNothing();
    const [fila] = await tx.select({ id: adminEscolarBorradores.id, datos: adminEscolarBorradores.datos })
      .from(adminEscolarBorradores).where(delColegio(auth.teamId, periodoId)).for('update');
    const actual = leer(fila.datos);
    if (body.completado) {
      actual[String(estudianteId)] = { en: new Date().toISOString(), por: auth.user.name || auth.user.email || null };
    } else {
      delete actual[String(estudianteId)];
    }
    await tx.update(adminEscolarBorradores)
      .set({ datos: { alumnos: actual }, updatedBy: auth.user.id, updatedAt: new Date() })
      .where(eq(adminEscolarBorradores.id, fila.id));
    return actual;
  });
  return NextResponse.json({ alumnos });
}
