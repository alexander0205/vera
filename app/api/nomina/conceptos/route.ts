import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { contabilidadCuentas, nominaConceptos } from '@/lib/db/schema';
import { catalogoConceptos } from '@/lib/nomina/conceptos-db';

export const dynamic = 'force-dynamic';

/** La cuenta, solo si es del team. */
async function cuentaDelTeam(teamId: number, cuentaId: number) {
  const [c] = await db
    .select({ id: contabilidadCuentas.id })
    .from(contabilidadCuentas)
    .where(and(eq(contabilidadCuentas.id, cuentaId), eq(contabilidadCuentas.teamId, teamId)))
    .limit(1);
  return c ?? null;
}

/** GET /api/nomina/conceptos — el catálogo de ingresos y descuentos de la empresa. */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;
  const conceptos = await catalogoConceptos(auth.teamId);
  conceptos.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.id - b.id);
  return NextResponse.json({ conceptos });
}

/** POST /api/nomina/conceptos — crea un concepto propio. */
export async function POST(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const nombre = String(body.nombre ?? '').trim().slice(0, 120);
  const tipo = body.tipo === 'ingreso' || body.tipo === 'descuento' ? body.tipo : null;
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  if (!tipo) return NextResponse.json({ error: 'El tipo debe ser ingreso o descuento' }, { status: 400 });

  const cuentaId = body.cuentaId == null ? null : Number(body.cuentaId);
  if (cuentaId !== null && (!Number.isInteger(cuentaId) || !(await cuentaDelTeam(auth.teamId, cuentaId)))) {
    return NextResponse.json({ error: 'Cuenta contable inválida' }, { status: 400 });
  }

  const codigo = `propio-${Date.now().toString(36)}`;
  const [fila] = await db
    .insert(nominaConceptos)
    .values({ teamId: auth.teamId, codigo, nombre, tipo, cotizaTss: tipo === 'ingreso' && body.cotizaTss === true, cuentaId })
    .returning();
  return NextResponse.json({ concepto: fila }, { status: 201 });
}

/** PATCH /api/nomina/conceptos — cambia nombre, cuenta, si cotiza o si está activo. */
export async function PATCH(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = Number(body?.id);
  if (!body || !Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [actual] = await db
    .select()
    .from(nominaConceptos)
    .where(and(eq(nominaConceptos.id, id), eq(nominaConceptos.teamId, auth.teamId)))
    .limit(1);
  if (!actual) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });

  const cambios: Partial<typeof nominaConceptos.$inferInsert> = {};
  if (typeof body.nombre === 'string' && body.nombre.trim()) cambios.nombre = body.nombre.trim().slice(0, 120);
  if (typeof body.activo === 'boolean') cambios.activo = body.activo;
  if (typeof body.cotizaTss === 'boolean' && actual.tipo === 'ingreso') cambios.cotizaTss = body.cotizaTss;
  if ('cuentaId' in body) {
    const cuentaId = body.cuentaId == null ? null : Number(body.cuentaId);
    if (cuentaId !== null && (!Number.isInteger(cuentaId) || !(await cuentaDelTeam(auth.teamId, cuentaId)))) {
      return NextResponse.json({ error: 'Cuenta contable inválida' }, { status: 400 });
    }
    cambios.cuentaId = cuentaId;
  }
  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 });

  const [fila] = await db.update(nominaConceptos).set(cambios).where(eq(nominaConceptos.id, id)).returning();
  return NextResponse.json({ concepto: fila });
}
