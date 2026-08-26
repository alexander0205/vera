/**
 * POST /api/nomina/empleados/[id]/contratos/preview
 *
 * Devuelve el contrato YA LLENO (título + cuerpo) para previsualizarlo ANTES de
 * emitirlo. No guarda nada: es el mismo autollenado que hace el POST de generar,
 * pero sin persistir. Body: { plantillaId }.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaContratoPlantillas, teams } from '@/lib/db/schema';
import { hoyRD } from '@/lib/utils/format';
import { variablesDeContrato, rellenarPlantilla } from '@/lib/nomina/contratos';

export const dynamic = 'force-dynamic';

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

  const vars = variablesDeContrato(
    {
      nombres: empleado.nombres, apellidos: empleado.apellidos, cedula: empleado.cedula,
      cargo: empleado.cargo, salarioBaseCents: empleado.salarioBaseCents,
      tipoContrato: empleado.tipoContrato, frecuenciaPago: empleado.frecuenciaPago,
      fechaIngreso: empleado.fechaIngreso,
    },
    { nombre: team?.razonSocial ?? team?.name ?? 'La empresa', rnc: team?.rnc ?? null, direccion: team?.direccion ?? null },
    hoyRD(),
  );

  const cuerpo = rellenarPlantilla(plantilla.cuerpo, vars);
  const titulo = (cuerpo.split('\n').find((l) => l.trim()) ?? plantilla.nombre).trim().slice(0, 200);

  return NextResponse.json({ titulo, cuerpo });
}
