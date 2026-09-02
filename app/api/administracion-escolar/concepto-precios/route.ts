import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarServicios, adminEscolarGrados, adminEscolarCursos, adminEscolarPeriodos,
  adminEscolarConceptosPago, adminEscolarConceptoPrecios, products,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { cachearPorTag, invalidarEstructura, tagEstructura } from '@/lib/cache/escolar';
import {
  calcularImpactoPrecio, eliminarPrecioCompleto, eliminarSoloTarifa, matriculasBajoObjetivo,
} from '@/lib/administracion-escolar/tarifa-lifecycle';
import { devengarPeriodo } from '@/lib/administracion-escolar/devengar';

const TIPOS_OBJ = new Set(['servicio', 'grado', 'seccion']);

/** Productos que son venta de mostrador, no cargo escolar. */
const NO_ES_CARGO = /t-?shirt|camis|uniforme|polo/i;

/**
 * Estructura, conceptos, tarifas y servicios de facturación de UN año escolar.
 *
 * Todo va acotado al período: la tarifa de 2026-2027 no es la de 2025-2026, y
 * los servicios ya cuelgan de su año. Sin `?periodoId=` se usa el activo.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const t = auth.teamId;
  const pedidoUrl = Number(new URL(req.url).searchParams.get('periodoId')) || 0;

  // Siete consultas para pintar una pantalla que casi nunca cambia: el año
  // escolar, la estructura entera, los conceptos, las tarifas y el catálogo de
  // productos. Se sirve de caché hasta que alguien toque algo, y cualquier
  // escritura de estructura o tarifas lo invalida.
  const datos = await cachearPorTag(
    () => leer(t, pedidoUrl),
    ['escolar', 'concepto-precios', String(t), String(pedidoUrl)],
    [tagEstructura(t)],
  )();
  return NextResponse.json(datos);
}

/** La lectura de verdad, aparte para poder envolverla en caché. */
async function leer(t: number, pedido: number) {
  const periodos = await db
    .select({ id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre, activo: adminEscolarPeriodos.activo })
    .from(adminEscolarPeriodos)
    .where(eq(adminEscolarPeriodos.teamId, t))
    .orderBy(desc(adminEscolarPeriodos.id));

  const periodo = periodos.find((p) => p.id === pedido)
    ?? periodos.find((p) => p.activo)
    ?? periodos[0];

  if (!periodo) {
    return {
      periodos: [], periodo: null, servicios: [], grados: [], secciones: [],
      conceptos: [], precios: [], productos: [],
    };
  }

  const [servicios, conceptos, precios, productos] = await Promise.all([
    db.select({ id: adminEscolarServicios.id, nombre: adminEscolarServicios.nombre, tanda: adminEscolarServicios.tanda, orden: adminEscolarServicios.orden })
      .from(adminEscolarServicios)
      .where(and(eq(adminEscolarServicios.teamId, t), eq(adminEscolarServicios.periodoId, periodo.id)))
      // El nombre desempata en los tres niveles: dos filas con el mismo
      // `orden` —un empate heredado, o algo recién creado— saldrían en orden de
      // la base, que puede cambiar entre dos lecturas y hace bailar la lista.
      .orderBy(asc(adminEscolarServicios.orden), asc(adminEscolarServicios.nombre)),
    // Por `orden` y no por nombre: es el que el colegio arregló a mano en la
    // pestaña Conceptos, y verlos en otro sitio en otro orden obliga a buscar
    // dos veces el mismo concepto.
    db.select({ id: adminEscolarConceptosPago.id, nombre: adminEscolarConceptosPago.nombre, tipo: adminEscolarConceptosPago.tipo, frecuencia: adminEscolarConceptosPago.frecuencia, orden: adminEscolarConceptosPago.orden })
      .from(adminEscolarConceptosPago).where(eq(adminEscolarConceptosPago.teamId, t))
      .orderBy(asc(adminEscolarConceptosPago.orden), asc(adminEscolarConceptosPago.nombre)),
    db.select().from(adminEscolarConceptoPrecios)
      .where(and(eq(adminEscolarConceptoPrecios.teamId, t), eq(adminEscolarConceptoPrecios.periodoId, periodo.id))),
    db.select({ id: products.id, nombre: products.nombre, referencia: products.referencia, precio: products.precio })
      .from(products).where(eq(products.teamId, t)).orderBy(asc(products.nombre)),
  ]);

  // Grados y secciones se recortan a los servicios del período: traer los del
  // team entero mezclaría años.
  const idsServicio = new Set(servicios.map((s) => s.id));
  const grados = (await db
    .select({ id: adminEscolarGrados.id, servicioId: adminEscolarGrados.servicioId, nombre: adminEscolarGrados.nombre, orden: adminEscolarGrados.orden })
    .from(adminEscolarGrados).where(eq(adminEscolarGrados.teamId, t))
    .orderBy(asc(adminEscolarGrados.orden), asc(adminEscolarGrados.nombre))
  ).filter((g) => idsServicio.has(g.servicioId));

  const idsGrado = new Set(grados.map((g) => g.id));
  const secciones = (await db
    .select({ id: adminEscolarCursos.id, gradoId: adminEscolarCursos.gradoId, nombre: adminEscolarCursos.nombre, orden: adminEscolarCursos.orden })
    .from(adminEscolarCursos).where(eq(adminEscolarCursos.teamId, t))
    .orderBy(asc(adminEscolarCursos.orden), asc(adminEscolarCursos.nombre))
  ).filter((s) => idsGrado.has(s.gradoId));


  return { periodos, periodo, servicios, grados, secciones, conceptos, precios, productos };
}

/**
 * Fija la tarifa de un concepto en un nodo, para un año escolar.
 *
 * Body: `{ conceptoId, periodoId, objetivoTipo, objetivoId, monto, productId? }`
 * o, para estrenar servicio de facturación, `nuevoProducto: { nombre, referencia, precio }`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const t = auth.teamId;
  const { conceptoId, periodoId, objetivoTipo, objetivoId, monto, productId, nuevoProducto } = await req.json();

  const cId = Number(conceptoId), oId = Number(objetivoId), pId = Number(periodoId);
  if (!cId || !oId || !pId || !TIPOS_OBJ.has(objetivoTipo)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const [c] = await db.select({ id: adminEscolarConceptosPago.id, productId: adminEscolarConceptosPago.productId })
    .from(adminEscolarConceptosPago)
    .where(and(eq(adminEscolarConceptosPago.id, cId), eq(adminEscolarConceptosPago.teamId, t))).limit(1);
  if (!c) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });

  const [per] = await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, pId), eq(adminEscolarPeriodos.teamId, t))).limit(1);
  if (!per) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });

  // El monto puede venir de tres sitios, en este orden: el que se escribe, el
  // del servicio recién creado, o el del servicio existente que se eligió.
  let montoCentavos = monto != null ? Math.round(Number(monto) * 100) : null;
  let prodId: number | null = null;

  if (nuevoProducto?.nombre?.trim()) {
    const precioNuevo = Math.round(Number(nuevoProducto.precio) * 100);
    if (!Number.isFinite(precioNuevo) || precioNuevo < 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }
    const [creado] = await db.insert(products).values({
      teamId: t,
      nombre: String(nuevoProducto.nombre).trim(),
      referencia: nuevoProducto.referencia ? String(nuevoProducto.referencia).trim().slice(0, 100) : null,
      precio: precioNuevo,
      // La enseñanza es servicio exento de itbis; el POS no la vende en mostrador.
      tasaItbis: 'exento',
      tipo: 'servicio',
      visiblePos: false,
      controlaInventario: false,
    }).returning({ id: products.id, precio: products.precio });
    prodId = creado.id;
    montoCentavos ??= creado.precio;
  } else if (productId != null) {
    const [p] = await db.select({ id: products.id, precio: products.precio }).from(products)
      .where(and(eq(products.id, Number(productId)), eq(products.teamId, t))).limit(1);
    if (!p) return NextResponse.json({ error: 'Servicio de facturación no encontrado' }, { status: 404 });
    prodId = p.id;
    montoCentavos ??= p.precio;
  }

  if (!Number.isFinite(montoCentavos) || montoCentavos == null || montoCentavos < 0) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
  }

  /**
   * R2: una tarifa tiene que poder facturarse contra un producto.
   *
   * El producto es lo que carga el ITBIS y el tipo (bien/servicio) en la
   * factura; una tarifa sin producto —ni propio ni heredado del concepto— sale
   * exenta por defecto sin que nadie lo decida. Además, un override de grado o
   * sección con monto pero sin producto GANA la resolución y deja al nodo sin
   * producto aunque el servicio sí lo tuviera. Se exige aquí, al configurar, en
   * vez de descubrirlo al emitir. No es retroactivo: solo valida altas nuevas.
   */
  if (prodId == null && c.productId == null) {
    return NextResponse.json(
      { error: 'La tarifa necesita un producto de facturación. Elige uno o créalo aquí (así la factura sale con el ITBIS correcto).' },
      { status: 400 },
    );
  }

  const [row] = await db.insert(adminEscolarConceptoPrecios)
    .values({ teamId: t, conceptoId: cId, periodoId: pId, objetivoTipo, objetivoId: oId, montoCentavos, productId: prodId })
    .onConflictDoUpdate({
      target: [
        adminEscolarConceptoPrecios.teamId, adminEscolarConceptoPrecios.conceptoId,
        adminEscolarConceptoPrecios.periodoId, adminEscolarConceptoPrecios.objetivoTipo,
        adminEscolarConceptoPrecios.objetivoId,
      ],
      set: { montoCentavos, ...(prodId != null ? { productId: prodId } : {}), updatedAt: new Date() },
    })
    .returning();
  invalidarEstructura(t);

  // Propagación al alta (regla #4): la tarifa se aplica a los estudiantes ya
  // matriculados en el objetivo, materializando la deuda vigente de ESTE
  // concepto. Es un devengo acotado e idempotente —el índice único evita
  // duplicados—; si falla, el precio ya quedó guardado y el cron mensual
  // recupera lo que falte, así que no tumba la respuesta.
  let cargosCreados = 0;
  try {
    const matriculaIds = await matriculasBajoObjetivo(db, t, pId, objetivoTipo, oId);
    if (matriculaIds.length) {
      // Mismo criterio que el cron: hasta hoy, no hasta fin de mes. Poner el
      // precio no debe adelantar cuotas que todavía no toca emitir.
      const hasta = new Date().toISOString().slice(0, 10);
      const r = await devengarPeriodo(t, pId, hasta, false, { soloMatriculas: matriculaIds, soloConceptos: [cId] });
      cargosCreados = r.cargosCreados;
    }
  } catch (e) {
    console.error('[concepto-precios] devengo al alta de tarifa falló:', e);
  }

  return NextResponse.json({ precio: row, cargosCreados });
}

/**
 * Quita una tarifa (un precio de un objetivo) con el mismo ciclo de vida que el
 * concepto, un escalón más abajo (ver `tarifa-lifecycle.ts`).
 *
 * - `?preview=1`: devuelve el impacto sin borrar.
 * - `?modo=completo`: sin historial, se lleva los cargos huérfanos sin factura
 *   y el servicio si quedó sin dueño.
 * - `?modo=solo-tarifa`: quita solo la fila del precio, conserva el historial.
 * - sin parámetros: completo si se puede; si hay historial, 409 con impacto.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const t = auth.teamId;
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
  const preview = url.searchParams.get('preview') === '1';
  const modo = url.searchParams.get('modo'); // 'completo' | 'solo-tarifa' | null

  const impacto = await calcularImpactoPrecio(db, t, id);
  if (!impacto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  if (preview) return NextResponse.json({ impacto });

  if (modo === 'solo-tarifa') {
    await db.transaction((tx) => eliminarSoloTarifa(tx, t, id));
    invalidarEstructura(t);
    return NextResponse.json({ ok: true, modo: 'solo-tarifa' });
  }

  if (impacto.tieneHistorial) {
    return NextResponse.json(
      {
        error: 'No se puede quitar por completo: hay cargos facturados o pagados con esta tarifa.',
        requiereConfirmacion: true,
        alternativa: 'solo-tarifa',
        impacto,
      },
      { status: 409 },
    );
  }

  await db.transaction((tx) => eliminarPrecioCompleto(tx, t, id));
  invalidarEstructura(t);
  return NextResponse.json({ ok: true, modo: 'completo', impacto });
}
