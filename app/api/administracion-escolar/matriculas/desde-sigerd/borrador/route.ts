/**
 * El borrador de «Matricular desde SIGERD»: lo que se va decidiendo antes de
 * matricular, guardado solo para no perderlo al recargar ni al abrirlo en otra
 * computadora. Uno por colegio y año escolar, compartido. Migración 0211.
 *
 *   GET    ?periodoId=     → { datos, actualizado, por } (o datos null)
 *   PUT    { periodoId, datos }
 *   DELETE ?periodoId=     → se borra al terminar de matricular, o al descartarlo
 *
 * El servidor no interpreta `datos`: lo dueño de su forma es la pantalla, y al
 * matricular vuelve a validarlo todo como siempre.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarBorradores, adminEscolarPeriodos, users } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

const CLAVE = 'desde-sigerd';
/** Holgado para un colegio grande (cientos de alumnos con ajustes) y lejos de abusar de la columna. */
const MAX_BYTES = 512_000;

async function periodoDelColegio(teamId: number, crudo: unknown): Promise<number | null> {
  const id = Number(crudo);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [p] = await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, id), eq(adminEscolarPeriodos.teamId, teamId))).limit(1);
  return p?.id ?? null;
}

const delBorrador = (teamId: number, periodoId: number) => and(
  eq(adminEscolarBorradores.teamId, teamId),
  eq(adminEscolarBorradores.periodoId, periodoId),
  eq(adminEscolarBorradores.clave, CLAVE),
);

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const periodoId = await periodoDelColegio(auth.teamId, req.nextUrl.searchParams.get('periodoId'));
  if (!periodoId) return NextResponse.json({ error: 'Año escolar inválido' }, { status: 400 });

  const [b] = await db.select({
      datos: adminEscolarBorradores.datos,
      actualizado: adminEscolarBorradores.updatedAt,
      por: users.name,
      porEmail: users.email,
    })
    .from(adminEscolarBorradores)
    .leftJoin(users, eq(users.id, adminEscolarBorradores.updatedBy))
    .where(delBorrador(auth.teamId, periodoId))
    .limit(1);
  if (!b) return NextResponse.json({ datos: null });
  return NextResponse.json({ datos: b.datos, actualizado: b.actualizado, por: b.por || b.porEmail });
}

export async function PUT(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as { periodoId?: unknown; datos?: unknown } | null;
  const periodoId = await periodoDelColegio(auth.teamId, body?.periodoId);
  if (!periodoId) return NextResponse.json({ error: 'Año escolar inválido' }, { status: 400 });
  if (!body?.datos || typeof body.datos !== 'object' || Array.isArray(body.datos)) {
    return NextResponse.json({ error: 'Borrador inválido' }, { status: 400 });
  }
  if (JSON.stringify(body.datos).length > MAX_BYTES) {
    return NextResponse.json({ error: 'El borrador es demasiado grande' }, { status: 413 });
  }

  const ahora = new Date();
  await db.insert(adminEscolarBorradores)
    .values({ teamId: auth.teamId, periodoId, clave: CLAVE, datos: body.datos, updatedBy: auth.user.id, updatedAt: ahora })
    .onConflictDoUpdate({
      target: [adminEscolarBorradores.teamId, adminEscolarBorradores.periodoId, adminEscolarBorradores.clave],
      set: { datos: body.datos, updatedBy: auth.user.id, updatedAt: ahora },
    });
  return NextResponse.json({ actualizado: ahora });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const periodoId = await periodoDelColegio(auth.teamId, req.nextUrl.searchParams.get('periodoId'));
  if (!periodoId) return NextResponse.json({ error: 'Año escolar inválido' }, { status: 400 });
  await db.delete(adminEscolarBorradores).where(delBorrador(auth.teamId, periodoId));
  return NextResponse.json({ ok: true });
}
