import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarConceptosPago, adminEscolarConceptoPrecios, adminEscolarCargos,
  adminEscolarConceptoCuotas, adminEscolarMatriculas, products,
} from '@/lib/db/schema';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { camposCiclo } from '@/lib/administracion-escolar/ciclo-cobro';
import { eq, and, isNotNull, notInArray } from 'drizzle-orm';

const TIPOS = ['inscripcion', 'mensualidad', 'uniforme', 'actividad', 'otro'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const body = await req.json();
  const { nombre, tipo, activo, productId } = body;

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
      ...(activo !== undefined ? { activo } : {}),
      ...(productId !== undefined ? { productId } : {}),
      ...camposCiclo(body),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarConceptosPago.id, parseInt(id)), eq(adminEscolarConceptosPago.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  // La cuota del pago único se llama como el concepto, y esa etiqueta se copió
  // el día que se generó el calendario. Sin esto, renombrar "Inscripción" a
  // "Inscripción 2027" dejaba la cuota —y el recibo que ve el padre— con el
  // nombre viejo, sin ninguna señal de que algo quedó atrás.
  //
  // Solo las que todavía no se facturaron: la etiqueta de una cuota ya cobrada
  // es lo que el padre tiene en su recibo, y reescribirla cambiaría por detrás
  // el concepto de una deuda que ya existe.
  if (row.frecuencia === 'unico' && nombre !== undefined) {
    // `isNotNull` no es decorativo: `NOT IN (…, NULL)` en SQL no devuelve
    // NADA, así que un solo cargo viejo sin `cuota_id` haría que no se
    // renombrara ninguna cuota y el fallo pasaría por "no hizo falta".
    const yaFacturadas = db.select({ id: adminEscolarCargos.cuotaId })
      .from(adminEscolarCargos)
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.conceptoId, row.id),
        isNotNull(adminEscolarCargos.cuotaId),
      ));
    await db.update(adminEscolarConceptoCuotas)
      .set({ etiqueta: row.nombre, updatedAt: new Date() })
      .where(and(
        eq(adminEscolarConceptoCuotas.conceptoId, row.id),
        eq(adminEscolarConceptoCuotas.teamId, teamId),
        notInArray(adminEscolarConceptoCuotas.id, yaFacturadas),
      ));
  }

  /**
   * Apagar «se cobra varias veces al año» tiene que llevarse el calendario.
   *
   * Antes solo cambiaba la columna `frecuencia` y las cuotas se quedaban ahí.
   * El motor de cobro las sigue leyendo —para él, tener cuotas ES tener
   * calendario—, así que un concepto marcado "una sola vez" seguía cobrándose
   * en la fecha del calendario viejo en vez del día de la matrícula. Un colegio
   * que apagaba la recurrencia de "Inscripción" veía el cargo aparecer en
   * septiembre, sin ninguna pista de por qué.
   *
   * Las ya facturadas NO se tocan: esa cuota es la deuda que un padre ya tiene,
   * y borrar la fila dejaría su cargo apuntando a algo que no existe. Se
   * conservan aunque desentonen; lo que estorba es el calendario futuro.
   */
  if (row.frecuencia === 'unico' && body.frecuencia !== undefined) {
    const facturadas = db.select({ id: adminEscolarCargos.cuotaId })
      .from(adminEscolarCargos)
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.conceptoId, row.id),
        // Sin esto, `NOT IN (…, NULL)` no devuelve NADA y no se borraría ninguna.
        isNotNull(adminEscolarCargos.cuotaId),
      ));
    await db.delete(adminEscolarConceptoCuotas)
      .where(and(
        eq(adminEscolarConceptoCuotas.conceptoId, row.id),
        eq(adminEscolarConceptoCuotas.teamId, teamId),
        notInArray(adminEscolarConceptoCuotas.id, facturadas),
      ));
  }

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
