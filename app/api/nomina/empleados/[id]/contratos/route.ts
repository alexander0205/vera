import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaContratoPlantillas, nominaContratos, teams } from '@/lib/db/schema';
import { hoyRD } from '@/lib/utils/format';
import { cuerpoDeContrato } from '@/lib/nomina/contrato-estructura';
import { borrarContratosDeEmpleado } from '@/lib/nomina/contratos-subidos';

export const dynamic = 'force-dynamic';

/** GET — contratos emitidos de un empleado, recientes primero. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const empleadoId = Number((await params).id);
  if (!Number.isInteger(empleadoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const filas = await db
    .select({
      id: nominaContratos.id,
      titulo: nominaContratos.titulo,
      estado: nominaContratos.estado,
      origen: nominaContratos.origen,
      createdAt: nominaContratos.createdAt,
    })
    .from(nominaContratos)
    .where(and(eq(nominaContratos.empleadoId, empleadoId), eq(nominaContratos.teamId, auth.teamId)))
    .orderBy(desc(nominaContratos.id));

  return NextResponse.json({ contratos: filas });
}

/**
 * POST — genera el contrato de un empleado desde una plantilla. Autollena los
 * marcadores con los datos del empleado + la empresa y archiva el texto ya
 * resuelto (snapshot). Body: { plantillaId }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const empleadoId = Number((await params).id);
  if (!Number.isInteger(empleadoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const plantillaId = Number(body.plantillaId);
  if (!Number.isInteger(plantillaId)) return NextResponse.json({ error: 'Falta la plantilla' }, { status: 400 });

  const [empleado] = await db
    .select()
    .from(empleados)
    .where(and(eq(empleados.id, empleadoId), eq(empleados.teamId, auth.teamId)))
    .limit(1);
  if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  const [plantilla] = await db
    .select()
    .from(nominaContratoPlantillas)
    .where(and(eq(nominaContratoPlantillas.id, plantillaId), eq(nominaContratoPlantillas.teamId, auth.teamId)))
    .limit(1);
  if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });

  const [team] = await db
    .select({ name: teams.name, razonSocial: teams.razonSocial, rnc: teams.rnc, direccion: teams.direccion })
    .from(teams)
    .where(eq(teams.id, auth.teamId))
    .limit(1);

  const { cuerpo, titulo } = cuerpoDeContrato(
    plantilla,
    {
      nombres: empleado.nombres, apellidos: empleado.apellidos, cedula: empleado.cedula,
      cargo: empleado.cargo, salarioBaseCents: empleado.salarioBaseCents,
      tipoContrato: empleado.tipoContrato, frecuenciaPago: empleado.frecuenciaPago,
      fechaIngreso: empleado.fechaIngreso,
      jornada: empleado.jornada, turno: empleado.turno,
      diasLibres: empleado.diasLibres, vacacionesDias: empleado.vacacionesDias,
    },
    { nombre: team?.razonSocial ?? team?.name ?? 'La empresa', rnc: team?.rnc ?? null, direccion: team?.direccion ?? null },
    hoyRD(),
  );

  // Un empleado tiene un solo contrato: el generado reemplaza cualquier anterior.
  await borrarContratosDeEmpleado(auth.teamId, empleadoId);

  const [fila] = await db
    .insert(nominaContratos)
    .values({
      teamId: auth.teamId, empleadoId, plantillaId, titulo, cuerpo,
      estado: 'generado', createdBy: auth.user.id,
    })
    .returning({ id: nominaContratos.id });

  return NextResponse.json({ contrato: { id: fila.id, titulo } }, { status: 201 });
}
