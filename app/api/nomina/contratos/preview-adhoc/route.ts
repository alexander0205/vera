/**
 * POST /api/nomina/contratos/preview-adhoc
 *
 * Ensambla la vista previa de un contrato con los datos TECLEADOS de un empleado
 * que TODAVÍA NO existe (flujo "nuevo empleado con contrato"). No guarda nada.
 * Body: { plantillaId, empleado }, donde `empleado` trae los campos del wizard.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaContratoPlantillas, teams } from '@/lib/db/schema';
import { hoyRD } from '@/lib/utils/format';
import { cuerpoDeContrato, type EmpleadoContratoExt } from '@/lib/nomina/contrato-estructura';

export const dynamic = 'force-dynamic';

function cedulaLimpia(v: unknown): string | null {
  const s = String(v ?? '').replace(/\D/g, '');
  return s === '' ? null : s;
}
function limpiar(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}
function pesosACents(v: unknown): number {
  const n = Math.round(Number(v) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function enteroOnull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const plantillaId = Number(body.plantillaId);
  if (!Number.isInteger(plantillaId)) return NextResponse.json({ error: 'Falta la plantilla' }, { status: 400 });

  const [plantilla] = await db
    .select()
    .from(nominaContratoPlantillas)
    .where(and(eq(nominaContratoPlantillas.id, plantillaId), eq(nominaContratoPlantillas.teamId, auth.teamId)))
    .limit(1);
  if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });

  const [team] = await db
    .select({ name: teams.name, razonSocial: teams.razonSocial, rnc: teams.rnc, direccion: teams.direccion, representanteNombre: teams.nombreRepresentante, representanteCedula: teams.cedulaRepresentante })
    .from(teams)
    .where(eq(teams.id, auth.teamId))
    .limit(1);

  const e = body.empleado ?? {};
  const empleado: EmpleadoContratoExt = {
    nombres: limpiar(e.nombres) ?? '',
    apellidos: limpiar(e.apellidos) ?? '',
    cedula: cedulaLimpia(e.cedula),
    cargo: limpiar(e.cargo),
    salarioBaseCents: pesosACents(e.salarioBase),
    tipoContrato: limpiar(e.tipoContrato) ?? 'indefinido',
    frecuenciaPago: limpiar(e.frecuenciaPago) ?? 'mensual',
    fechaIngreso: limpiar(e.fechaIngreso),
    jornada: limpiar(e.jornada),
    turno: limpiar(e.turno),
    diasLibres: limpiar(e.diasLibres),
    vacacionesDias: enteroOnull(e.vacacionesDias),
    sexo: limpiar(e.sexo),
    fechaNacimiento: limpiar(e.fechaNacimiento),
    nacionalidad: limpiar(e.nacionalidad),
    estadoCivil: limpiar(e.estadoCivil),
    direccion: limpiar(e.direccion),
    fechaFinContrato: limpiar(e.fechaFinContrato),
    objetoContrato: limpiar(e.objetoContrato),
  };

  const { cuerpo } = cuerpoDeContrato(
    plantilla,
    empleado,
    { nombre: team?.razonSocial ?? team?.name ?? 'La empresa', rnc: team?.rnc ?? null, direccion: team?.direccion ?? null, representanteNombre: team?.representanteNombre ?? null, representanteCedula: team?.representanteCedula ?? null },
    hoyRD(),
  );

  return NextResponse.json({ cuerpo });
}
