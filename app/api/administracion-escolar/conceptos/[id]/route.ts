import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarConceptosPago, adminEscolarCargos,
  adminEscolarConceptoCuotas, products,
} from '@/lib/db/schema';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { camposCiclo } from '@/lib/administracion-escolar/ciclo-cobro';
import {
  calcularImpactoConcepto, eliminarConceptoCompleto, eliminarSoloConfig,
} from '@/lib/administracion-escolar/tarifa-lifecycle';
import { eq, and, isNotNull, notInArray } from 'drizzle-orm';

const TIPOS = ['inscripcion', 'mensualidad', 'uniforme', 'actividad', 'otro'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const body = await req.json();
  const { nombre, tipo, activo, productId, admiteBeca } = body;

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
      /**
       * Si la beca del alumno descuenta en este concepto.
       *
       * Se leía en el listado pero no se podía escribir por ninguna parte, así
       * que todos los conceptos nacían con `false` y ahí se quedaban: aprobar
       * una beca no rebajaba un peso. La cadena entera estaba puesta —el motor
       * de tarifas la aplica, la matrícula la guarda— y se cortaba en el único
       * campo que nadie podía tocar.
       *
       * Casi siempre va en la colegiatura y no en inscripción, materiales ni
       * uniformes: una beca cubre la mensualidad, no la ropa.
       */
      ...(admiteBeca !== undefined ? { admiteBeca: admiteBeca === true } : {}),
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
 * Elimina un concepto siguiendo el ciclo de vida compartido con sus tarifas,
 * cargos, facturas y servicio de facturación (ver `tarifa-lifecycle.ts`).
 *
 * - `?preview=1`: no borra; devuelve el impacto para que la UI confirme.
 * - `?modo=completo`: sin factura, se lleva tarifas, cargos sin facturar y el
 *   servicio si quedó huérfano (regla #1).
 * - `?modo=solo-config`: con factura, saca el concepto de la configuración
 *   (quita tarifas + lo desactiva) y conserva el historial y el servicio
 *   (regla #2).
 * - sin parámetros: borra completo si se puede; si hay historial, responde 409
 *   con el impacto y la alternativa disponible.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const conceptoId = parseInt(id, 10);
  if (!Number.isInteger(conceptoId) || conceptoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const url = new URL(req.url);
  const preview = url.searchParams.get('preview') === '1';
  const modo = url.searchParams.get('modo'); // 'completo' | 'solo-config' | null

  const impacto = await calcularImpactoConcepto(db, teamId, conceptoId);
  if (!impacto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  if (preview) return NextResponse.json({ impacto });

  if (impacto.bloqueadoPorMensualidad) {
    return NextResponse.json(
      { error: 'Hay matrículas que generan su mensualidad con este concepto.', impacto },
      { status: 409 },
    );
  }

  // Alternativa explícita: sacar solo la configuración escolar, conservando el
  // servicio y las facturas. Válida haya o no historial.
  if (modo === 'solo-config') {
    await db.transaction((tx) => eliminarSoloConfig(tx, teamId, conceptoId));
    invalidarEstructura(teamId);
    return NextResponse.json({ ok: true, modo: 'solo-config' });
  }

  // Con historial no se puede borrar del todo: se ofrece la alternativa.
  if (impacto.tieneHistorial) {
    return NextResponse.json(
      {
        error: 'No se puede eliminar por completo: ya existen facturas o pagos con este concepto.',
        requiereConfirmacion: true,
        alternativa: 'solo-config',
        impacto,
      },
      { status: 409 },
    );
  }

  // Sin historial: borrado completo transaccional (revalida dentro de la tx).
  await db.transaction((tx) => eliminarConceptoCompleto(tx, teamId, conceptoId));
  invalidarEstructura(teamId);
  return NextResponse.json({ ok: true, modo: 'completo', impacto });
}
