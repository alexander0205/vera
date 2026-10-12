import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { contabilidadCuentas, nominaConceptos } from '@/lib/db/schema';
import { catalogoConceptos } from '@/lib/nomina/conceptos-db';
import { limpiarTexto } from '@/lib/nomina/conceptos';

export const dynamic = 'force-dynamic';

/**
 * ¿Sirve esta cuenta para el concepto? Es del team, está activa, recibe apuntes y
 * es del tipo que el concepto necesita: un ingreso (incentivo, comisión) se
 * DEBITA a un gasto; un descuento (avance, seguro) se ACREDITA a un activo (por
 * cobrar al empleado) o a un pasivo. Devuelve el motivo si no sirve.
 */
async function validarCuenta(teamId: number, cuentaId: unknown, tipo: 'ingreso' | 'descuento'): Promise<string | null> {
  if (typeof cuentaId !== 'number' || !Number.isSafeInteger(cuentaId)) return 'Cuenta contable inválida';
  const [c] = await db
    .select({ tipo: contabilidadCuentas.tipo, imputable: contabilidadCuentas.imputable, activa: contabilidadCuentas.activa })
    .from(contabilidadCuentas)
    .where(and(eq(contabilidadCuentas.id, cuentaId), eq(contabilidadCuentas.teamId, teamId)))
    .limit(1);
  if (!c) return 'Cuenta contable inválida';
  if (!c.activa) return 'Esa cuenta está desactivada';
  if (!c.imputable) return 'Esa cuenta es un grupo: elige una cuenta de detalle que reciba apuntes';
  // Un ingreso se debita a un gasto, o a un pasivo cuando consume una reserva (vacaciones por pagar).
  const buenos = tipo === 'ingreso' ? ['gasto', 'costo', 'pasivo'] : ['activo', 'pasivo'];
  if (!buenos.includes(c.tipo)) {
    return tipo === 'ingreso'
      ? 'Un ingreso del empleado va a una cuenta de gasto (incentivos, comisiones) o a una reserva por pagar (vacaciones por pagar)'
      : 'Un descuento va a una cuenta de activo (por cobrar al empleado) o de pasivo';
  }
  return null;
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

  const nombre = limpiarTexto(body.nombre, 120);
  const tipo = body.tipo === 'ingreso' || body.tipo === 'descuento' ? body.tipo : null;
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  if (!tipo) return NextResponse.json({ error: 'El tipo debe ser ingreso o descuento' }, { status: 400 });

  const cuentaId = body.cuentaId == null ? null : body.cuentaId;
  if (cuentaId !== null) {
    const motivo = await validarCuenta(auth.teamId, cuentaId, tipo);
    if (motivo) return NextResponse.json({ error: motivo }, { status: 400 });
  }

  const codigo = `propio-${Date.now().toString(36)}`;
  const [fila] = await db
    .insert(nominaConceptos)
    .values({ teamId: auth.teamId, codigo, nombre, tipo, cotizaTss: tipo === 'ingreso' && body.cotizaTss === true, cuentaId: cuentaId as number | null })
    .returning();
  return NextResponse.json({ concepto: fila }, { status: 201 });
}

/** PATCH /api/nomina/conceptos — cambia nombre, cuenta, si cotiza o si está activo. */
export async function PATCH(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === 'number' ? body.id : NaN;
  if (!body || !Number.isSafeInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [actual] = await db
    .select()
    .from(nominaConceptos)
    .where(and(eq(nominaConceptos.id, id), eq(nominaConceptos.teamId, auth.teamId)))
    .limit(1);
  if (!actual) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });

  const cambios: Partial<typeof nominaConceptos.$inferInsert> = {};
  const nombreNuevo = limpiarTexto(body.nombre, 120);
  if (nombreNuevo) cambios.nombre = nombreNuevo;
  if (typeof body.activo === 'boolean') cambios.activo = body.activo;
  if (typeof body.cotizaTss === 'boolean' && actual.tipo === 'ingreso') cambios.cotizaTss = body.cotizaTss;
  if ('cuentaId' in body) {
    const cuentaId = body.cuentaId == null ? null : body.cuentaId;
    if (cuentaId !== null) {
      const motivo = await validarCuenta(auth.teamId, cuentaId, actual.tipo as 'ingreso' | 'descuento');
      if (motivo) return NextResponse.json({ error: motivo }, { status: 400 });
    }
    cambios.cuentaId = cuentaId as number | null;
  }
  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 });

  const [fila] = await db.update(nominaConceptos).set(cambios).where(eq(nominaConceptos.id, id)).returning();
  return NextResponse.json({ concepto: fila });
}
