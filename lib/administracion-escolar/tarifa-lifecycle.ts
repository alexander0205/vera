import { and, eq, inArray, isNotNull, ne, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarConceptosPago, adminEscolarConceptoPrecios, adminEscolarConceptoCuotas,
  adminEscolarCargos, adminEscolarPagos, adminEscolarMatriculas, adminEscolarCursos,
  adminEscolarGrados, products, productVariants, inventoryMovements, comprasLocalesItems,
  listasPrecios_items, comandaItems, contabilidadConfigIngresos,
} from '@/lib/db/schema';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

/**
 * ¿El objetivo de una tarifa (servicio/grado/sección) cubre a una matrícula de
 * esta cadena? Pura, para poder probar la herencia sin base de datos: quitar el
 * precio de una sección no deja huérfana a la matrícula si un precio de su
 * grado o servicio todavía la alcanza.
 */
export function objetivoCubreCadena(
  objetivoTipo: string,
  objetivoId: number,
  cadena: { seccionId: number; gradoId: number; servicioId: number },
): boolean {
  return (objetivoTipo === 'seccion' && objetivoId === cadena.seccionId)
    || (objetivoTipo === 'grado' && objetivoId === cadena.gradoId)
    || (objetivoTipo === 'servicio' && objetivoId === cadena.servicioId);
}

/**
 * El ciclo de vida COMPARTIDO entre un concepto escolar, sus tarifas
 * (`concepto_precios`), el servicio de facturación del catálogo (`products`),
 * los cargos generados al estudiante y las facturas (e-CF) que los cubren.
 *
 * La regla es histórica: una factura ya emitida protege al producto y a todo
 * el historial. Sin factura, la configuración es borrable de arriba a abajo —
 * incluidos los cargos que todavía no se facturaron. Este módulo es el ÚNICO
 * sitio donde vive esa decisión, para que Tarifas y Productos/servicios la
 * apliquen igual (regla #3 del plan): dos validaciones distintas es cómo se
 * termina borrando de un lado lo que el otro cree intacto.
 *
 * «Protegido» no es solo tener e-CF: un cargo pagado sin comprobante también es
 * dinero que ya entró, y su fila en `admin_escolar_pagos` bloquea el DELETE por
 * FK (NO ACTION). Tratarlo como historial evita reventar la transacción y, de
 * paso, no borra un cobro real sin avisar.
 */
export interface ImpactoConcepto {
  conceptoId: number;
  nombre: string;
  /** Tarifas (precios por servicio/grado/sección) del concepto. */
  precioIds: number[];
  /** Cuántas cuotas del calendario cuelgan del concepto (se van por CASCADE). */
  cuotaCount: number;
  /** Cargos SIN historial: se eliminan en el borrado completo. */
  cargosSinHistorial: number[];
  /** Cargos con factura o pago: obligan a conservar el historial. */
  cargosProtegidos: number[];
  /** Servicios de facturación vinculados (del concepto y de sus tarifas). */
  productIds: number[];
  /** Subconjunto de `productIds` que puede borrarse: sin factura y sin ninguna
   *  otra referencia en el sistema (POS, inventario, compras, contabilidad…). */
  productosBorrables: number[];
  /** Productos que se conservan aunque se borre el concepto. */
  productosConservados: number[];
  /** Hay al menos un cargo con factura/pago: no se puede borrar del todo. */
  tieneHistorial: boolean;
  /** Alguna matrícula genera su mensualidad con este concepto: no se puede
   *  desligar sin romper la matrícula. Bloquea incluso la alternativa. */
  bloqueadoPorMensualidad: boolean;
}

/** Cargos protegidos de un concepto: con e-CF, o con un pago registrado. */
async function idsCargosProtegidos(exec: DbOrTx, teamId: number, conceptoId: number): Promise<Set<number>> {
  const conFactura = await exec.select({ id: adminEscolarCargos.id })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.conceptoId, conceptoId),
      isNotNull(adminEscolarCargos.ecfDocumentId),
    ));
  const conPago = await exec.select({ id: adminEscolarCargos.id })
    .from(adminEscolarCargos)
    .innerJoin(adminEscolarPagos, eq(adminEscolarPagos.cargoId, adminEscolarCargos.id))
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.conceptoId, conceptoId),
    ));
  return new Set([...conFactura, ...conPago].map((r) => r.id));
}

/**
 * ¿El producto tiene alguna referencia FUERA de estas tarifas/concepto?
 *
 * Solo se borra el servicio de facturación si queda huérfano tras desligar la
 * configuración escolar. Cualquier fila que lo apunte con FK NO ACTION (POS,
 * inventario, compras, listas de precios, contabilidad, variantes, u OTRO
 * concepto/tarifa) haría fallar el DELETE y, peor, dejaría de existir algo que
 * el colegio sí usa. Las FK en CASCADE (stock por almacén, valores de maestro)
 * se van solas y no cuentan.
 */
async function productoTieneOtrasReferencias(
  exec: DbOrTx,
  teamId: number,
  productId: number,
  excepto: { conceptoIds: number[]; precioIds: number[] },
): Promise<boolean> {
  const existe = async (q: Promise<{ x: number }[]>) => (await q).length > 0;

  // Otro concepto (distinto de los que se borran) lo usa como servicio.
  const otroConcepto = await existe(
    exec.select({ x: adminEscolarConceptosPago.id }).from(adminEscolarConceptosPago)
      .where(and(
        eq(adminEscolarConceptosPago.teamId, teamId),
        eq(adminEscolarConceptosPago.productId, productId),
        excepto.conceptoIds.length ? notInArray(adminEscolarConceptosPago.id, excepto.conceptoIds) : sql`true`,
      )).limit(1),
  );
  if (otroConcepto) return true;

  // Otra tarifa (de otro concepto, u otro objetivo) lo usa como servicio.
  const otraTarifa = await existe(
    exec.select({ x: adminEscolarConceptoPrecios.id }).from(adminEscolarConceptoPrecios)
      .where(and(
        eq(adminEscolarConceptoPrecios.teamId, teamId),
        eq(adminEscolarConceptoPrecios.productId, productId),
        excepto.precioIds.length ? notInArray(adminEscolarConceptoPrecios.id, excepto.precioIds) : sql`true`,
      )).limit(1),
  );
  if (otraTarifa) return true;

  // Referencias fuera del módulo escolar. Cualquiera basta para conservarlo.
  const externas = await Promise.all([
    existe(exec.select({ x: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId)).limit(1)),
    existe(exec.select({ x: inventoryMovements.id }).from(inventoryMovements).where(eq(inventoryMovements.productoId, productId)).limit(1)),
    existe(exec.select({ x: comprasLocalesItems.id }).from(comprasLocalesItems).where(eq(comprasLocalesItems.productoId, productId)).limit(1)),
    existe(exec.select({ x: listasPrecios_items.id }).from(listasPrecios_items).where(eq(listasPrecios_items.productoId, productId)).limit(1)),
    existe(exec.select({ x: comandaItems.id }).from(comandaItems).where(eq(comandaItems.productoId, productId)).limit(1)),
    existe(exec.select({ x: contabilidadConfigIngresos.id }).from(contabilidadConfigIngresos).where(eq(contabilidadConfigIngresos.productoId, productId)).limit(1)),
  ]);
  return externas.some(Boolean);
}

/**
 * Calcula el impacto de borrar un concepto entero (todas sus tarifas).
 *
 * No borra nada: es lo que alimenta la confirmación de la UI y lo que el propio
 * borrado consulta para decidir si va por «completo» o por «solo configuración».
 */
export async function calcularImpactoConcepto(
  exec: DbOrTx,
  teamId: number,
  conceptoId: number,
): Promise<ImpactoConcepto | null> {
  const [concepto] = await exec.select({ id: adminEscolarConceptosPago.id, nombre: adminEscolarConceptosPago.nombre, productId: adminEscolarConceptosPago.productId })
    .from(adminEscolarConceptosPago)
    .where(and(eq(adminEscolarConceptosPago.id, conceptoId), eq(adminEscolarConceptosPago.teamId, teamId)))
    .limit(1);
  if (!concepto) return null;

  const [precios, cuotas, cargos, protegidos, matriculaMensualidad] = await Promise.all([
    exec.select({ id: adminEscolarConceptoPrecios.id, productId: adminEscolarConceptoPrecios.productId })
      .from(adminEscolarConceptoPrecios)
      .where(and(eq(adminEscolarConceptoPrecios.teamId, teamId), eq(adminEscolarConceptoPrecios.conceptoId, conceptoId))),
    exec.select({ id: adminEscolarConceptoCuotas.id }).from(adminEscolarConceptoCuotas)
      .where(and(eq(adminEscolarConceptoCuotas.teamId, teamId), eq(adminEscolarConceptoCuotas.conceptoId, conceptoId))),
    exec.select({ id: adminEscolarCargos.id }).from(adminEscolarCargos)
      .where(and(eq(adminEscolarCargos.teamId, teamId), eq(adminEscolarCargos.conceptoId, conceptoId))),
    idsCargosProtegidos(exec, teamId, conceptoId),
    exec.select({ id: adminEscolarMatriculas.id }).from(adminEscolarMatriculas)
      .where(and(eq(adminEscolarMatriculas.teamId, teamId), eq(adminEscolarMatriculas.conceptoMensualidadId, conceptoId)))
      .limit(1),
  ]);

  const precioIds = precios.map((p) => p.id);
  const cargosProtegidos = cargos.filter((c) => protegidos.has(c.id)).map((c) => c.id);
  const cargosSinHistorial = cargos.filter((c) => !protegidos.has(c.id)).map((c) => c.id);
  const tieneHistorial = cargosProtegidos.length > 0;

  // Los servicios candidatos: el del concepto y los de sus tarifas.
  const productIds = [...new Set([
    ...(concepto.productId != null ? [concepto.productId] : []),
    ...precios.map((p) => p.productId).filter((x): x is number => x != null),
  ])];

  // Un producto solo se borra si NO hay historial facturado y no lo referencia
  // nadie más. Con historial se conservan todos (regla #2).
  const productosBorrables: number[] = [];
  const productosConservados: number[] = [];
  for (const pid of productIds) {
    const conservar = tieneHistorial
      || await productoTieneOtrasReferencias(exec, teamId, pid, { conceptoIds: [conceptoId], precioIds });
    if (conservar) productosConservados.push(pid);
    else productosBorrables.push(pid);
  }

  return {
    conceptoId,
    nombre: concepto.nombre,
    precioIds,
    cuotaCount: cuotas.length,
    cargosSinHistorial,
    cargosProtegidos,
    productIds,
    productosBorrables,
    productosConservados,
    tieneHistorial,
    bloqueadoPorMensualidad: matriculaMensualidad.length > 0,
  };
}

/**
 * Borrado COMPLETO de un concepto sin historial (regla #1).
 *
 * Transaccional: o se va todo —tarifas, cuotas, cargos sin factura, avisos
 * (CASCADE), el concepto y su servicio si quedó huérfano— o no se va nada. Un
 * fallo a mitad dejaría cargos apuntando a un concepto borrado o servicios sin
 * dueño, que es justo lo que el plan pide evitar.
 *
 * Exige el impacto ya calculado para no re-consultar y para fallar si entre el
 * cálculo y aquí apareció una factura (lo revalida dentro de la transacción).
 */
export async function eliminarConceptoCompleto(tx: Tx, teamId: number, conceptoId: number): Promise<void> {
  const impacto = await calcularImpactoConcepto(tx, teamId, conceptoId);
  if (!impacto) throw new Error('Concepto no encontrado');
  if (impacto.tieneHistorial) throw new Error('El concepto tiene historial facturado');
  if (impacto.bloqueadoPorMensualidad) throw new Error('Hay matrículas que generan su mensualidad con este concepto');

  // Cargos primero: los avisos se van con ellos por CASCADE; no hay pagos
  // (si los hubiera, el cargo sería «protegido» y no estaríamos aquí).
  if (impacto.cargosSinHistorial.length) {
    await tx.delete(adminEscolarCargos)
      .where(and(eq(adminEscolarCargos.teamId, teamId), inArray(adminEscolarCargos.id, impacto.cargosSinHistorial)));
  }

  // Tarifas. Las cuotas del calendario se van por CASCADE al borrar el concepto.
  await tx.delete(adminEscolarConceptoPrecios)
    .where(and(eq(adminEscolarConceptoPrecios.teamId, teamId), eq(adminEscolarConceptoPrecios.conceptoId, conceptoId)));

  await tx.delete(adminEscolarConceptosPago)
    .where(and(eq(adminEscolarConceptosPago.id, conceptoId), eq(adminEscolarConceptosPago.teamId, teamId)));

  // El servicio de facturación, solo si quedó sin dueño.
  if (impacto.productosBorrables.length) {
    await tx.delete(products)
      .where(and(eq(products.teamId, teamId), inArray(products.id, impacto.productosBorrables)));
  }
}

/**
 * Alternativa cuando SÍ hay factura (regla #2): se saca el concepto de la
 * configuración escolar sin tocar el historial.
 *
 * No se puede borrar la fila del concepto: los cargos ya facturados la apuntan
 * con FK. Así que se le quitan las tarifas —para que deje de cobrarse de aquí
 * en adelante— y se desactiva; el servicio del catálogo y las facturas quedan
 * intactos. Es «eliminar solo la configuración», no la factura.
 */
export async function eliminarSoloConfig(tx: Tx, teamId: number, conceptoId: number): Promise<void> {
  await tx.delete(adminEscolarConceptoPrecios)
    .where(and(eq(adminEscolarConceptoPrecios.teamId, teamId), eq(adminEscolarConceptoPrecios.conceptoId, conceptoId)));

  // Los cargos sin factura que aún no son historial también estorban: son deuda
  // futura de un concepto que el colegio ya no quiere cobrar. Se van los que no
  // tengan factura ni pago; los protegidos se quedan como historial.
  const protegidos = await idsCargosProtegidos(tx, teamId, conceptoId);
  const cargos = await tx.select({ id: adminEscolarCargos.id }).from(adminEscolarCargos)
    .where(and(eq(adminEscolarCargos.teamId, teamId), eq(adminEscolarCargos.conceptoId, conceptoId)));
  const borrables = cargos.filter((c) => !protegidos.has(c.id)).map((c) => c.id);
  if (borrables.length) {
    await tx.delete(adminEscolarCargos)
      .where(and(eq(adminEscolarCargos.teamId, teamId), inArray(adminEscolarCargos.id, borrables)));
  }

  await tx.update(adminEscolarConceptosPago)
    .set({ activo: false, updatedAt: new Date() })
    .where(and(eq(adminEscolarConceptosPago.id, conceptoId), eq(adminEscolarConceptosPago.teamId, teamId)));
}

// ─── Nivel tarifa individual (quitar un precio) ──────────────────────────────

/** Matrículas colgadas de un objetivo (servicio/grado/sección). */
export async function matriculasBajoObjetivo(
  exec: DbOrTx,
  teamId: number,
  periodoId: number,
  objetivoTipo: string,
  objetivoId: number,
): Promise<number[]> {
  // Todo se resuelve a un conjunto de secciones (cursos); la matrícula cuelga
  // de la sección.
  let cursoIds: number[];
  if (objetivoTipo === 'seccion') {
    cursoIds = [objetivoId];
  } else if (objetivoTipo === 'grado') {
    const cursos = await exec.select({ id: adminEscolarCursos.id }).from(adminEscolarCursos)
      .where(and(eq(adminEscolarCursos.teamId, teamId), eq(adminEscolarCursos.gradoId, objetivoId)));
    cursoIds = cursos.map((c) => c.id);
  } else if (objetivoTipo === 'servicio') {
    const grados = await exec.select({ id: adminEscolarGrados.id }).from(adminEscolarGrados)
      .where(and(eq(adminEscolarGrados.teamId, teamId), eq(adminEscolarGrados.servicioId, objetivoId)));
    if (!grados.length) return [];
    const cursos = await exec.select({ id: adminEscolarCursos.id }).from(adminEscolarCursos)
      .where(and(eq(adminEscolarCursos.teamId, teamId), inArray(adminEscolarCursos.gradoId, grados.map((g) => g.id))));
    cursoIds = cursos.map((c) => c.id);
  } else {
    return [];
  }
  if (!cursoIds.length) return [];
  const mats = await exec.select({ id: adminEscolarMatriculas.id }).from(adminEscolarMatriculas)
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.periodoId, periodoId),
      inArray(adminEscolarMatriculas.cursoId, cursoIds),
    ));
  return mats.map((m) => m.id);
}

export interface ImpactoPrecio {
  precioId: number;
  conceptoId: number;
  periodoId: number;
  objetivoTipo: string;
  objetivoId: number;
  productId: number | null;
  /** Cargos de matrículas del objetivo, sin historial: se pueden quitar. */
  cargosSinHistorial: number[];
  /** Cargos de matrículas del objetivo con factura/pago. */
  cargosProtegidos: number[];
  tieneHistorial: boolean;
  /** El servicio de la tarifa puede borrarse (sin factura y sin otras refs). */
  productoBorrable: number | null;
}

/**
 * Matrículas de un objetivo con su cadena (sección → grado → servicio), para
 * saber qué otra tarifa podría seguir cubriéndolas.
 */
async function matriculasConCadena(
  exec: DbOrTx, teamId: number, periodoId: number, objetivoTipo: string, objetivoId: number,
): Promise<{ id: number; seccionId: number; gradoId: number; servicioId: number }[]> {
  const base = exec.select({
      id: adminEscolarMatriculas.id,
      seccionId: adminEscolarCursos.id,
      gradoId: adminEscolarGrados.id,
      servicioId: adminEscolarGrados.servicioId,
    })
    .from(adminEscolarMatriculas)
    .innerJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
    .innerJoin(adminEscolarGrados, eq(adminEscolarGrados.id, adminEscolarCursos.gradoId));
  const cond =
    objetivoTipo === 'seccion' ? eq(adminEscolarCursos.id, objetivoId)
    : objetivoTipo === 'grado' ? eq(adminEscolarGrados.id, objetivoId)
    : objetivoTipo === 'servicio' ? eq(adminEscolarGrados.servicioId, objetivoId)
    : sql`false`;
  return base.where(and(
    eq(adminEscolarMatriculas.teamId, teamId),
    eq(adminEscolarMatriculas.periodoId, periodoId),
    cond,
  ));
}

/**
 * Impacto de quitar UNA tarifa (un precio de un objetivo).
 *
 * Solo cuentan los cargos de matrículas que quedarían SIN tarifa aplicable tras
 * quitar este precio: si un precio de grado o servicio todavía las cubre por
 * herencia, su cargo sigue teniendo base y no se toca. Así quitar el precio de
 * una sección no borra cargos que el precio del grado sigue sosteniendo.
 */
export async function calcularImpactoPrecio(exec: DbOrTx, teamId: number, precioId: number): Promise<ImpactoPrecio | null> {
  const [precio] = await exec.select().from(adminEscolarConceptoPrecios)
    .where(and(eq(adminEscolarConceptoPrecios.id, precioId), eq(adminEscolarConceptoPrecios.teamId, teamId)))
    .limit(1);
  if (!precio) return null;

  const matriculas = await matriculasConCadena(exec, teamId, precio.periodoId, precio.objetivoTipo, precio.objetivoId);

  // Precios que quedan del concepto en el mismo período (sin el que se quita).
  const restantes = await exec.select({ objetivoTipo: adminEscolarConceptoPrecios.objetivoTipo, objetivoId: adminEscolarConceptoPrecios.objetivoId })
    .from(adminEscolarConceptoPrecios)
    .where(and(
      eq(adminEscolarConceptoPrecios.teamId, teamId),
      eq(adminEscolarConceptoPrecios.conceptoId, precio.conceptoId),
      eq(adminEscolarConceptoPrecios.periodoId, precio.periodoId),
      eq(adminEscolarConceptoPrecios.activo, true),
      ne(adminEscolarConceptoPrecios.id, precioId),
    ));
  // Huérfanas: pierden toda tarifa al quitar este precio. Solo sus cargos entran.
  const huerfanas = matriculas
    .filter((m) => !restantes.some((r) => objetivoCubreCadena(r.objetivoTipo, r.objetivoId, m)))
    .map((m) => m.id);

  let cargos: { id: number; ecfDocumentId: number | null }[] = [];
  if (huerfanas.length) {
    cargos = await exec.select({ id: adminEscolarCargos.id, ecfDocumentId: adminEscolarCargos.ecfDocumentId })
      .from(adminEscolarCargos)
      .where(and(
        eq(adminEscolarCargos.teamId, teamId),
        eq(adminEscolarCargos.conceptoId, precio.conceptoId),
        inArray(adminEscolarCargos.matriculaId, huerfanas),
      ));
  }
  const ids = cargos.map((c) => c.id);
  const conPago = ids.length
    ? new Set((await exec.select({ cargoId: adminEscolarPagos.cargoId }).from(adminEscolarPagos)
        .where(and(eq(adminEscolarPagos.teamId, teamId), inArray(adminEscolarPagos.cargoId, ids)))).map((r) => r.cargoId))
    : new Set<number | null>();
  const protegido = (c: { id: number; ecfDocumentId: number | null }) => c.ecfDocumentId != null || conPago.has(c.id);
  const cargosProtegidos = cargos.filter(protegido).map((c) => c.id);
  const cargosSinHistorial = cargos.filter((c) => !protegido(c)).map((c) => c.id);
  const tieneHistorial = cargosProtegidos.length > 0;

  let productoBorrable: number | null = null;
  if (precio.productId != null && !tieneHistorial) {
    const otras = await productoTieneOtrasReferencias(exec, teamId, precio.productId, { conceptoIds: [], precioIds: [precioId] });
    // Además, el propio concepto puede seguir apuntando al mismo servicio.
    const [conc] = await exec.select({ productId: adminEscolarConceptosPago.productId }).from(adminEscolarConceptosPago)
      .where(and(eq(adminEscolarConceptosPago.id, precio.conceptoId), eq(adminEscolarConceptosPago.teamId, teamId))).limit(1);
    if (!otras && conc?.productId !== precio.productId) productoBorrable = precio.productId;
  }

  return {
    precioId,
    conceptoId: precio.conceptoId,
    periodoId: precio.periodoId,
    objetivoTipo: precio.objetivoTipo,
    objetivoId: precio.objetivoId,
    productId: precio.productId,
    cargosSinHistorial,
    cargosProtegidos,
    tieneHistorial,
    productoBorrable,
  };
}

/**
 * Quita una tarifa sin historial (regla #1/#4 a nivel de un objetivo): se lleva
 * los cargos huérfanos sin factura y el servicio si quedó sin dueño.
 */
export async function eliminarPrecioCompleto(tx: Tx, teamId: number, precioId: number): Promise<void> {
  const impacto = await calcularImpactoPrecio(tx, teamId, precioId);
  if (!impacto) throw new Error('Tarifa no encontrada');
  if (impacto.tieneHistorial) throw new Error('La tarifa tiene cargos facturados o pagados');

  if (impacto.cargosSinHistorial.length) {
    await tx.delete(adminEscolarCargos)
      .where(and(eq(adminEscolarCargos.teamId, teamId), inArray(adminEscolarCargos.id, impacto.cargosSinHistorial)));
  }
  await tx.delete(adminEscolarConceptoPrecios)
    .where(and(eq(adminEscolarConceptoPrecios.id, precioId), eq(adminEscolarConceptoPrecios.teamId, teamId)));
  if (impacto.productoBorrable != null) {
    await tx.delete(products)
      .where(and(eq(products.teamId, teamId), eq(products.id, impacto.productoBorrable)));
  }
}

/** Alternativa cuando la tarifa tiene historial: se quita solo la fila del
 *  precio y se conservan cargos, facturas y el servicio. */
export async function eliminarSoloTarifa(tx: Tx, teamId: number, precioId: number): Promise<void> {
  await tx.delete(adminEscolarConceptoPrecios)
    .where(and(eq(adminEscolarConceptoPrecios.id, precioId), eq(adminEscolarConceptoPrecios.teamId, teamId)));
}
