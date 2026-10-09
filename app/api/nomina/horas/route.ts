import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaHoras } from '@/lib/db/schema';
import { validarRegistroHoras } from '@/lib/nomina/horas';
import { corridasCerradas, enCorridaCerrada } from '@/lib/nomina/horas-db';
import { esFechaYMD } from '@/lib/nomina/periodos';
import { hoyRD } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const ESTADOS = ['pendiente', 'aprobada', 'rechazada'] as const;

/** GET /api/nomina/horas?estado=pendiente&desde=&hasta= — horas registradas del team. */
export async function GET(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const estado = url.searchParams.get('estado');
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');

  const filas = await db
    .select({
      id: nominaHoras.id, empleadoId: nominaHoras.empleadoId, fecha: nominaHoras.fecha,
      horas: nominaHoras.horas, horasNocturnas: nominaHoras.horasNocturnas, feriado: nominaHoras.feriado,
      nota: nominaHoras.nota, estado: nominaHoras.estado, origen: nominaHoras.origen,
      motivoRechazo: nominaHoras.motivoRechazo, revisadoEn: nominaHoras.revisadoEn,
      nombres: empleados.nombres, apellidos: empleados.apellidos, frecuenciaPago: empleados.frecuenciaPago,
    })
    .from(nominaHoras)
    .innerJoin(empleados, eq(empleados.id, nominaHoras.empleadoId))
    .where(and(
      eq(nominaHoras.teamId, auth.teamId),
      (ESTADOS as readonly string[]).includes(estado ?? '') ? eq(nominaHoras.estado, estado!) : undefined,
      esFechaYMD(desde) ? gte(nominaHoras.fecha, desde) : undefined,
      esFechaYMD(hasta) ? lte(nominaHoras.fecha, hasta) : undefined,
    ))
    .orderBy(desc(nominaHoras.fecha), asc(empleados.nombres))
    .limit(500);

  // Lo pendiente que cae en una corrida ya aprobada no lo paga ninguna: se avisa.
  const fechas = filas.map((f) => f.fecha).sort();
  const cerradas = fechas.length ? await corridasCerradas(auth.teamId, fechas[0], fechas[fechas.length - 1]) : [];

  return NextResponse.json({
    horas: filas.map((f) => ({
      ...f,
      horas: Number(f.horas),
      horasNocturnas: Number(f.horasNocturnas),
      empleado: [f.nombres, f.apellidos].filter(Boolean).join(' ').trim(),
      corridaCerrada: f.estado !== 'aprobada' && enCorridaCerrada(cerradas, f.frecuenciaPago, f.fecha),
    })),
  });
}

/** POST /api/nomina/horas — la empresa registra horas de un empleado: nacen aprobadas. */
export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:correr');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  const empleadoId = Number(body.empleadoId);
  if (!Number.isInteger(empleadoId)) return NextResponse.json({ error: 'Elige el empleado' }, { status: 400 });
  const [e] = await db
    .select({ id: empleados.id, frecuenciaPago: empleados.frecuenciaPago })
    .from(empleados)
    .where(and(eq(empleados.id, empleadoId), eq(empleados.teamId, auth.teamId)))
    .limit(1);
  if (!e) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  const v = validarRegistroHoras(body, hoyRD(), 'empresa');
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const valores = {
    horas: String(v.datos.horas), horasNocturnas: String(v.datos.horasNocturnas), feriado: v.datos.feriado,
    nota: v.datos.nota, estado: 'aprobada', origen: 'empresa', motivoRechazo: null,
    revisadoPor: auth.user.id, revisadoEn: new Date(), updatedAt: new Date(),
  };
  const [fila] = await db
    .insert(nominaHoras)
    .values({ ...valores, teamId: auth.teamId, empleadoId, fecha: v.datos.fecha })
    .onConflictDoUpdate({ target: [nominaHoras.empleadoId, nominaHoras.fecha], set: valores })
    .returning({ id: nominaHoras.id });
  const cerradas = await corridasCerradas(auth.teamId, v.datos.fecha, v.datos.fecha);
  return NextResponse.json({ id: fila.id, corridaCerrada: enCorridaCerrada(cerradas, e.frecuenciaPago, v.datos.fecha) }, { status: 201 });
}
