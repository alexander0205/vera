/**
 * Lo que ya se revisó en el formulario de «Matricular desde SIGERD»:
 *  - los alumnos completados (familia, cargos y pagos): el «X de N completados»;
 *  - los meses que se marcaron «Debe todo»: no tienen pago que anotar, pero ya
 *    están indicados (el «X de N meses indicados» de cada alumno).
 * Uno por colegio y año, compartido entre quienes migran. Vive en la tabla de
 * borradores (migración 0216) con su propia clave, así que matricular o
 * «Empezar de cero» no lo borra.
 *
 *   GET  ?periodoId=                          → { alumnos: { [id]: { en, por } }, debe: number[] }
 *   POST { periodoId, estudianteId, completado }
 *   POST { periodoId, cargoId, debe }
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarBorradores, adminEscolarCargos, adminEscolarEstudiantes, adminEscolarPeriodos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

const CLAVE = 'desde-sigerd-completados';

type Completados = Record<string, { en: string; por: string | null }>;
interface Datos { alumnos: Completados; debe: number[] }

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

const leer = (datos: unknown): Datos => {
  const d = (datos ?? {}) as { alumnos?: unknown; debe?: unknown };
  const alumnos = d.alumnos && typeof d.alumnos === 'object' && !Array.isArray(d.alumnos) ? d.alumnos as Completados : {};
  const debe = Array.isArray(d.debe) ? d.debe.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  return { alumnos, debe };
};

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const periodoId = await periodoDelColegio(auth.teamId, req.nextUrl.searchParams.get('periodoId'));
  if (!periodoId) return NextResponse.json({ error: 'Año escolar inválido' }, { status: 400 });

  const [b] = await db.select({ datos: adminEscolarBorradores.datos }).from(adminEscolarBorradores)
    .where(delColegio(auth.teamId, periodoId)).limit(1);
  return NextResponse.json(leer(b?.datos));
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as
    { periodoId?: unknown; estudianteId?: unknown; completado?: unknown; cargoId?: unknown; debe?: unknown } | null;
  const periodoId = await periodoDelColegio(auth.teamId, body?.periodoId);
  if (!periodoId) return NextResponse.json({ error: 'Año escolar inválido' }, { status: 400 });

  // Uno de los dos: un alumno completado, o un mes que «debe todo».
  let cambio: (d: Datos) => void;
  if (body?.cargoId !== undefined) {
    const cargoId = Number(body.cargoId);
    if (!Number.isInteger(cargoId) || cargoId <= 0 || typeof body.debe !== 'boolean') {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const [cargo] = await db.select({ id: adminEscolarCargos.id }).from(adminEscolarCargos)
      .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, auth.teamId))).limit(1);
    if (!cargo) return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 });
    const debe = body.debe;
    cambio = (d) => { d.debe = debe ? [...new Set([...d.debe, cargoId])] : d.debe.filter((id) => id !== cargoId); };
  } else {
    const estudianteId = Number(body?.estudianteId);
    if (!Number.isInteger(estudianteId) || estudianteId <= 0 || typeof body?.completado !== 'boolean') {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const [est] = await db.select({ id: adminEscolarEstudiantes.id }).from(adminEscolarEstudiantes)
      .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, auth.teamId))).limit(1);
    if (!est) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    const completado = body.completado;
    const por = auth.user.name || auth.user.email || null;
    cambio = (d) => {
      if (completado) d.alumnos[String(estudianteId)] = { en: new Date().toISOString(), por };
      else delete d.alumnos[String(estudianteId)];
    };
  }

  // Dos personas migrando a la vez: la fila se bloquea y cada una cambia solo
  // lo suyo, sin pisar lo que marcó la otra.
  const datos = await db.transaction(async (tx) => {
    await tx.insert(adminEscolarBorradores)
      .values({ teamId: auth.teamId, periodoId, clave: CLAVE, datos: { alumnos: {}, debe: [] }, updatedBy: auth.user.id })
      .onConflictDoNothing();
    const [fila] = await tx.select({ id: adminEscolarBorradores.id, datos: adminEscolarBorradores.datos })
      .from(adminEscolarBorradores).where(delColegio(auth.teamId, periodoId)).for('update');
    const actual = leer(fila.datos);
    cambio(actual);
    await tx.update(adminEscolarBorradores)
      .set({ datos: actual, updatedBy: auth.user.id, updatedAt: new Date() })
      .where(eq(adminEscolarBorradores.id, fila.id));
    return actual;
  });
  return NextResponse.json(datos);
}
