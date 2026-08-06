import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarConceptosPago, adminEscolarConceptoPrecios, adminEscolarCargos,
  adminEscolarMatriculas, products,
} from '@/lib/db/schema';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { camposCiclo } from '@/lib/administracion-escolar/ciclo-cobro';
import { eq, and } from 'drizzle-orm';

const TIPOS = ['inscripcion', 'mensualidad', 'uniforme', 'actividad', 'otro'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const body = await req.json();
  const { nombre, tipo, recurrente, activo, productId } = body;

  if (productId !== undefined && productId !== null) {
    const [p] = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.teamId, teamId)))
      .limit(1);
    if (!p) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  const [row] = await db.update(adminEscolarConceptosPago)
    .set({
      ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
      ...(tipo !== undefined ? { tipo: TIPOS.includes(tipo) ? tipo : 'otro' } : {}),
      ...(recurrente !== undefined ? { recurrente } : {}),
      ...(activo !== undefined ? { activo } : {}),
      ...(productId !== undefined ? { productId } : {}),
      ...camposCiclo(body),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarConceptosPago.id, parseInt(id)), eq(adminEscolarConceptosPago.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  invalidarEstructura(teamId);
  return NextResponse.json({ concepto: row });
}

/**
 * Elimina un concepto. Bloquea si ya se cobró con él: un cargo emitido tiene
 * que poder decir de qué era, y el asistente de importación crea conceptos de
 * más, así que borrar tiene que ser fácil pero no destructivo.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const conceptoId = parseInt(id, 10);
  if (!Number.isInteger(conceptoId) || conceptoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const [cargo] = await db.select({ id: adminEscolarCargos.id }).from(adminEscolarCargos)
    .where(and(eq(adminEscolarCargos.conceptoId, conceptoId), eq(adminEscolarCargos.teamId, teamId)))
    .limit(1);
  if (cargo) {
    return NextResponse.json(
      { error: 'Ya hay cargos cobrados con este concepto. No se puede eliminar.' },
      { status: 409 },
    );
  }

  const [matricula] = await db.select({ id: adminEscolarMatriculas.id }).from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.conceptoMensualidadId, conceptoId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (matricula) {
    return NextResponse.json(
      { error: 'Hay matrículas que generan su mensualidad con este concepto.' },
      { status: 409 },
    );
  }

  // Las tarifas sí se van con él: sin concepto no significan nada.
  await db.delete(adminEscolarConceptoPrecios)
    .where(and(eq(adminEscolarConceptoPrecios.conceptoId, conceptoId), eq(adminEscolarConceptoPrecios.teamId, teamId)));

  const [row] = await db.delete(adminEscolarConceptosPago)
    .where(and(eq(adminEscolarConceptosPago.id, conceptoId), eq(adminEscolarConceptosPago.teamId, teamId)))
    .returning({ id: adminEscolarConceptosPago.id });
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  invalidarEstructura(teamId);
  return NextResponse.json({ ok: true });
}
