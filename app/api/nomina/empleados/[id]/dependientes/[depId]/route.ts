import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleadoDependientes } from '@/lib/db/schema';
import { validarDependiente } from '@/lib/nomina/dependientes';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; depId: string }> };

/** Los ids de la ruta, o null si alguno no es un entero. */
async function ids(params: Params['params']) {
  const { id, depId } = await params;
  const empleadoId = Number(id);
  const dependienteId = Number(depId);
  return Number.isInteger(empleadoId) && Number.isInteger(dependienteId) ? { empleadoId, dependienteId } : null;
}

/**
 * PATCH /api/nomina/empleados/[id]/dependientes/[depId] — corrige el registro o
 * le pone fecha de baja. Las corridas ya calculadas no cambian: guardan cuántos
 * dependientes cobraron.
 */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const r = await ids(params);
  if (!r) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const v = validarDependiente(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const [fila] = await db
    .update(empleadoDependientes)
    .set({ ...v.datos, updatedAt: new Date() })
    .where(and(
      eq(empleadoDependientes.id, r.dependienteId),
      eq(empleadoDependientes.empleadoId, r.empleadoId),
      eq(empleadoDependientes.teamId, auth.teamId),
    ))
    .returning();

  if (!fila) return NextResponse.json({ error: 'Dependiente no encontrado' }, { status: 404 });
  return NextResponse.json({ dependiente: fila });
}

/**
 * DELETE /api/nomina/empleados/[id]/dependientes/[depId] — borra un registro
 * hecho por error. Para quien salió del seguro se usa la fecha de baja, que
 * conserva los meses en que sí se cobró.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const r = await ids(params);
  if (!r) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [fila] = await db
    .delete(empleadoDependientes)
    .where(and(
      eq(empleadoDependientes.id, r.dependienteId),
      eq(empleadoDependientes.empleadoId, r.empleadoId),
      eq(empleadoDependientes.teamId, auth.teamId),
    ))
    .returning({ id: empleadoDependientes.id });

  if (!fila) return NextResponse.json({ error: 'Dependiente no encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
