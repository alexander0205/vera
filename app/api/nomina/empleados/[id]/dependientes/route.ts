import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleadoDependientes, empleados } from '@/lib/db/schema';
import { capitaDependienteVigente, capitaTotalCents } from '@/lib/config/nomina-tasas';
import {
  avisosDependientes,
  contarAdicionalesVigentes,
  validarDependiente,
  type DependienteBase,
} from '@/lib/nomina/dependientes';
import { hoyRD } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** El empleado, solo si es del team. */
async function empleadoDelTeam(teamId: number, idRaw: string) {
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return null;
  const [fila] = await db
    .select({ id: empleados.id })
    .from(empleados)
    .where(and(eq(empleados.id, id), eq(empleados.teamId, teamId)))
    .limit(1);
  return fila ?? null;
}

/**
 * GET /api/nomina/empleados/[id]/dependientes — los dependientes del empleado,
 * con lo que cuestan hoy y los avisos donde el registro no cuadra con la regla
 * de la TSS.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const empleado = await empleadoDelTeam(auth.teamId, id);
  if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  const dependientes = await db
    .select()
    .from(empleadoDependientes)
    .where(and(eq(empleadoDependientes.empleadoId, empleado.id), eq(empleadoDependientes.teamId, auth.teamId)))
    .orderBy(asc(empleadoDependientes.desde), asc(empleadoDependientes.id));

  const hoy = hoyRD();
  const capita = capitaDependienteVigente(hoy);
  const adicionalesHoy = contarAdicionalesVigentes(dependientes as DependienteBase[], hoy, hoy);

  return NextResponse.json({
    dependientes,
    resumen: {
      adicionalesVigentes: adicionalesHoy,
      capitaCents: capitaTotalCents(capita),
      costoMensualCents: adicionalesHoy * capitaTotalCents(capita),
      resolucion: capita.resolucion,
      vigenteDesde: capita.vigenteDesde,
    },
    avisos: avisosDependientes(dependientes as DependienteBase[], hoy),
  });
}

/** POST /api/nomina/empleados/[id]/dependientes — registra un dependiente. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const empleado = await empleadoDelTeam(auth.teamId, id);
  if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const v = validarDependiente(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const [fila] = await db
    .insert(empleadoDependientes)
    .values({ ...v.datos, teamId: auth.teamId, empleadoId: empleado.id, createdBy: auth.user.id })
    .returning();

  return NextResponse.json({ dependiente: fila }, { status: 201 });
}
