import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaHoras, teams } from '@/lib/db/schema';
import { formatoTokenValido, hashTokenFirma } from '@/lib/nomina/firma';
import { DIAS_ATRAS_EMPLEADO, validarRegistroHoras } from '@/lib/nomina/horas';
import { corridasCerradas, enCorridaCerrada } from '@/lib/nomina/horas-db';
import { sumarDiasYMD } from '@/lib/nomina/periodos';
import { hoyRD } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/**
 * Endpoint PÚBLICO para que un empleado suba sus horas. Sin sesión: el token de
 * la URL es toda la autorización y ubica al empleado por su SHA-256. Un token
 * inválido responde 404 sin pistas. No devuelve salario ni tarifa.
 */

async function empleadoPorToken(token: string) {
  const [row] = await db
    .select({
      id: empleados.id, teamId: empleados.teamId, nombres: empleados.nombres, apellidos: empleados.apellidos,
      estado: empleados.estado, frecuenciaPago: empleados.frecuenciaPago, empresa: teams.razonSocial, empresaName: teams.name,
    })
    .from(empleados)
    .innerJoin(teams, eq(teams.id, empleados.teamId))
    .where(eq(empleados.horasTokenHash, hashTokenFirma(token)))
    .limit(1);
  return row ?? null;
}

/** GET — el empleado y sus horas de los últimos días, con su estado. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!formatoTokenValido(token)) return NextResponse.json({ error: 'Enlace inválido' }, { status: 404 });
  const e = await empleadoPorToken(token);
  if (!e) return NextResponse.json({ error: 'Enlace inválido o vencido' }, { status: 404 });

  const hoy = hoyRD();
  const desde = sumarDiasYMD(hoy, -DIAS_ATRAS_EMPLEADO);
  const registros = await db
    .select({
      fecha: nominaHoras.fecha, horas: nominaHoras.horas, horasNocturnas: nominaHoras.horasNocturnas,
      feriado: nominaHoras.feriado, nota: nominaHoras.nota, estado: nominaHoras.estado, motivoRechazo: nominaHoras.motivoRechazo,
    })
    .from(nominaHoras)
    .where(and(eq(nominaHoras.empleadoId, e.id), gte(nominaHoras.fecha, desde)))
    .orderBy(desc(nominaHoras.fecha));

  return NextResponse.json({
    empleado: [e.nombres, e.apellidos].filter(Boolean).join(' ').trim(),
    empresa: e.empresa ?? e.empresaName,
    activo: e.estado === 'activo',
    hoy,
    desde,
    registros: registros.map((r) => ({ ...r, horas: Number(r.horas), horasNocturnas: Number(r.horasNocturnas) })),
  });
}

/** POST — registra (o corrige, si no está aprobado) las horas de un día. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!formatoTokenValido(token)) return NextResponse.json({ error: 'Enlace inválido' }, { status: 404 });
  const e = await empleadoPorToken(token);
  if (!e) return NextResponse.json({ error: 'Enlace inválido o vencido' }, { status: 404 });
  if (e.estado !== 'activo') return NextResponse.json({ error: 'Este enlace ya no está habilitado' }, { status: 409 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  const v = validarRegistroHoras(body, hoyRD(), 'empleado');
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const [existente] = await db
    .select({ id: nominaHoras.id, estado: nominaHoras.estado })
    .from(nominaHoras)
    .where(and(eq(nominaHoras.empleadoId, e.id), eq(nominaHoras.fecha, v.datos.fecha)))
    .limit(1);
  // La nómina de esa fecha ya se aprobó: lo que se suba ahora no lo pagaría ninguna corrida.
  const cerradas = await corridasCerradas(e.teamId, v.datos.fecha, v.datos.fecha);
  if (enCorridaCerrada(cerradas, e.frecuenciaPago, v.datos.fecha)) {
    return NextResponse.json({ error: 'La nómina de esa fecha ya se cerró: pide a la empresa que registre esas horas' }, { status: 409 });
  }
  if (existente?.estado === 'aprobada') {
    return NextResponse.json({ error: 'Las horas de ese día ya están aprobadas: pide a la empresa que las corrija' }, { status: 409 });
  }

  const valores = {
    horas: String(v.datos.horas), horasNocturnas: String(v.datos.horasNocturnas), feriado: v.datos.feriado,
    nota: v.datos.nota, estado: 'pendiente', origen: 'empleado', motivoRechazo: null, revisadoPor: null, revisadoEn: null,
    updatedAt: new Date(),
  };
  if (existente) {
    await db.update(nominaHoras).set(valores).where(eq(nominaHoras.id, existente.id));
  } else {
    await db.insert(nominaHoras).values({ ...valores, teamId: e.teamId, empleadoId: e.id, fecha: v.datos.fecha });
  }
  return NextResponse.json({ ok: true }, { status: existente ? 200 : 201 });
}
