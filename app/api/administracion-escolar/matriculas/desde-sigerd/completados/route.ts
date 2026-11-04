/**
 * Lo que ya se revisó en el formulario de «Matricular desde SIGERD»:
 *  - los alumnos completados (familia, cargos y pagos): el «X de N completados»;
 *  - los meses que se marcaron «Debe todo»: no tienen pago que anotar, pero ya
 *    están indicados (el «X de N meses indicados» de cada alumno).
 * Uno por colegio y año, compartido entre quienes migran. Vive en la tabla de
 * borradores (migración 0216) con su propia clave, así que matricular o
 * «Empezar de cero» no lo borra.
 *
 *   GET  ?periodoId=  → { alumnos: { [id]: { en, por } }, debe: number[], moraPrevia: { [cargoId]: centavos } }
 *   POST { periodoId, estudianteId, completado }
 *   POST { periodoId, cargoId, debe }
 *   POST { periodoId, cargoId, moraPrevia }   (centavos; null o 0 la quita)
 *   POST { periodoId, cargoId, debe: true, moraPrevia }   («Guardar» de «Debe todo»: las dos a la vez)
 *
 * Al completar un alumno se facturan sus meses «Debe todo» (borrador, con el
 * vencimiento del mes) y se pone al día su mora: la que calcula el sistema o la
 * que ya traía de otro sistema (ver `facturar-debe-migracion`). Lo facturado
 * —y lo que mientras tanto se pagó— sale de la lista; lo que no se pudo, se
 * queda y se explica en `facturacion.sinFacturar`. Completar no espera a que
 * todo se facture: el alumno queda completado igual y se corrige después.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarBorradores, adminEscolarCargos, adminEscolarEstudiantes, adminEscolarPeriodos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { facturarDebeDelAlumno, type ResultadoFacturarDebe } from '@/lib/administracion-escolar/facturar-debe-migracion';

const CLAVE = 'desde-sigerd-completados';

type Completados = Record<string, { en: string; por: string | null }>;
interface Datos { alumnos: Completados; debe: number[]; moraPrevia: Record<string, number> }

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
  const d = (datos ?? {}) as { alumnos?: unknown; debe?: unknown; moraPrevia?: unknown };
  const alumnos = d.alumnos && typeof d.alumnos === 'object' && !Array.isArray(d.alumnos) ? d.alumnos as Completados : {};
  const debe = Array.isArray(d.debe) ? d.debe.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  const moraPrevia = d.moraPrevia && typeof d.moraPrevia === 'object' && !Array.isArray(d.moraPrevia)
    ? Object.fromEntries(Object.entries(d.moraPrevia as Record<string, unknown>)
      .map(([k, v]) => [k, Math.round(Number(v))] as const).filter(([, v]) => Number.isFinite(v) && v > 0))
    : {};
  return { alumnos, debe, moraPrevia };
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
    { periodoId?: unknown; estudianteId?: unknown; completado?: unknown; cargoId?: unknown; debe?: unknown; moraPrevia?: unknown } | null;
  const periodoId = await periodoDelColegio(auth.teamId, body?.periodoId);
  if (!periodoId) return NextResponse.json({ error: 'Año escolar inválido' }, { status: 400 });

  // Un alumno completado, un mes que «debe todo» o la mora que ese mes ya traía.
  let cambio: (d: Datos) => void;
  let facturacion: ResultadoFacturarDebe | null = null;
  if (body?.cargoId !== undefined) {
    const cargoId = Number(body.cargoId);
    const mora = body.moraPrevia === undefined ? undefined
      : body.moraPrevia === null ? 0 : Math.round(Number(body.moraPrevia));
    const debeMal = body.debe !== undefined && typeof body.debe !== 'boolean';
    if (!Number.isInteger(cargoId) || cargoId <= 0 || debeMal
      || (mora === undefined ? body.debe === undefined : !Number.isFinite(mora) || mora < 0)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const [cargo] = await db.select({ id: adminEscolarCargos.id }).from(adminEscolarCargos)
      .where(and(eq(adminEscolarCargos.id, cargoId), eq(adminEscolarCargos.teamId, auth.teamId))).limit(1);
    if (!cargo) return NextResponse.json({ error: 'Cargo no encontrado' }, { status: 404 });
    const debe = body.debe as boolean | undefined;
    // «Guardar» de «Debe todo» manda las dos cosas juntas: la marca y su mora.
    cambio = (d) => {
      if (debe !== undefined) {
        d.debe = debe ? [...new Set([...d.debe, cargoId])] : d.debe.filter((id) => id !== cargoId);
      }
      // Sin «Debe todo» no hay mora que traer.
      if (debe === false || mora === 0) delete d.moraPrevia[String(cargoId)];
      else if (mora !== undefined) d.moraPrevia[String(cargoId)] = mora;
    };
  } else {
    const estudianteId = Number(body?.estudianteId);
    if (!Number.isInteger(estudianteId) || estudianteId <= 0 || typeof body?.completado !== 'boolean') {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const [est] = await db.select({ id: adminEscolarEstudiantes.id }).from(adminEscolarEstudiantes)
      .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, auth.teamId))).limit(1);
    if (!est) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
    const completado = body.completado;
    if (completado) {
      const [b] = await db.select({ datos: adminEscolarBorradores.datos }).from(adminEscolarBorradores)
        .where(delColegio(auth.teamId, periodoId)).limit(1);
      const actual = leer(b?.datos);
      facturacion = await facturarDebeDelAlumno(auth.teamId, auth.user.id, estudianteId, actual.debe, actual.moraPrevia);
    }
    const quitar = new Set(facturacion?.quitar ?? []);
    const por = auth.user.name || auth.user.email || null;
    cambio = (d) => {
      if (completado) d.alumnos[String(estudianteId)] = { en: new Date().toISOString(), por };
      else delete d.alumnos[String(estudianteId)];
      // Ya tienen factura (o se pagaron): dejan de ser «Debe todo».
      d.debe = d.debe.filter((id) => !quitar.has(id));
      for (const id of quitar) delete d.moraPrevia[String(id)];
    };
  }

  // Dos personas migrando a la vez: la fila se bloquea y cada una cambia solo
  // lo suyo, sin pisar lo que marcó la otra.
  const datos = await db.transaction(async (tx) => {
    await tx.insert(adminEscolarBorradores)
      .values({ teamId: auth.teamId, periodoId, clave: CLAVE, datos: { alumnos: {}, debe: [], moraPrevia: {} }, updatedBy: auth.user.id })
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
  return NextResponse.json(facturacion ? { ...datos, facturacion } : datos);
}
