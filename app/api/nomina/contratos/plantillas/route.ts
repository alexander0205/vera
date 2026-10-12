import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { nominaContratoPlantillas } from '@/lib/db/schema';
import { normalizarConfig } from '@/lib/nomina/contrato-estructura';

export const dynamic = 'force-dynamic';

function limpiar(v: unknown): string {
  return String(v ?? '').trim();
}

/** GET — plantillas de contrato del team. */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const filas = await db
    .select()
    .from(nominaContratoPlantillas)
    .where(eq(nominaContratoPlantillas.teamId, auth.teamId))
    .orderBy(desc(nominaContratoPlantillas.id));

  return NextResponse.json({ plantillas: filas });
}

/** POST — crea una plantilla. */
export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const nombre = limpiar(body.nombre);
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });

  // Estructurada (nueva): trae `config`. Prosa (compat): trae `cuerpo`.
  const tieneConfig = body.config != null && typeof body.config === 'object';
  const cuerpo = limpiar(body.cuerpo);
  if (!tieneConfig && !cuerpo) {
    return NextResponse.json({ error: 'Falta la configuración del contrato' }, { status: 400 });
  }

  const [fila] = await db
    .insert(nominaContratoPlantillas)
    .values({
      teamId: auth.teamId,
      nombre,
      config: tieneConfig ? normalizarConfig(body.config) : null,
      cuerpo: tieneConfig ? null : cuerpo,
      createdBy: auth.user.id,
    })
    .returning();

  return NextResponse.json({ plantilla: fila }, { status: 201 });
}

/** PATCH — edita una plantilla (nombre, cuerpo, activa). */
export async function PATCH(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ('nombre' in body) set.nombre = limpiar(body.nombre);
  if ('activa' in body) set.activa = Boolean(body.activa);
  // Editar la config vuelve la plantilla estructurada (cuerpo se limpia); editar
  // solo el cuerpo mantiene la vieja de prosa.
  if (body.config != null && typeof body.config === 'object') {
    set.config = normalizarConfig(body.config);
    set.cuerpo = null;
  } else if ('cuerpo' in body) {
    set.cuerpo = limpiar(body.cuerpo);
    set.config = null;
  }

  const [fila] = await db
    .update(nominaContratoPlantillas)
    .set(set)
    .where(and(eq(nominaContratoPlantillas.id, id), eq(nominaContratoPlantillas.teamId, auth.teamId)))
    .returning();

  if (!fila) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ plantilla: fila });
}

/** DELETE — borra una plantilla (?id=). Los contratos ya emitidos quedan intactos. */
export async function DELETE(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar');
  if (!auth.ok) return auth.response;

  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  const res = await db
    .delete(nominaContratoPlantillas)
    .where(and(eq(nominaContratoPlantillas.id, id), eq(nominaContratoPlantillas.teamId, auth.teamId)))
    .returning({ id: nominaContratoPlantillas.id });

  if (!res.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
