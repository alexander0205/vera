/**
 * POS — Asignación producto ↔ almacén (catálogo del punto de venta).
 *
 * Regla única: un producto aparece en un POS si está asignado al almacén de la
 * terminal. "Asignado" = tiene fila en product_almacen_stock. Vale igual para
 * productos con o sin control de inventario (en los sin control, el stock se
 * ignora; la fila solo significa "se vende aquí").
 *
 * Seguridad de stock: quitar una asignación borra la fila SOLO si stock=0, para
 * no destruir el inventario de un producto que sí controla stock. Si tiene
 * stock, se reporta como "no removible" (hay que ajustar el stock a 0 primero).
 */

import { and, eq, inArray, asc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { products, almacenes, productAlmacenStock } from '@/lib/db/schema';

export interface AlmacenAsignacion {
  id:          number;
  nombre:      string;
  asignado:    boolean;
  stockActual: number;
}
export interface ProductoAsignacion {
  id:                 number;
  nombre:             string;
  referencia:         string | null;
  controlaInventario: boolean;
  visiblePos:         boolean;
  asignado:           boolean;
  stockActual:        number;
}

export interface ResultadoSync {
  agregados:    number;
  removidos:    number;
  noRemovibles: string[];  // nombres con stock > 0 que no se pudieron quitar
}

/** Almacenes del equipo con flag de si el producto está asignado a cada uno. */
export async function almacenesDeProducto(teamId: number, productId: number): Promise<AlmacenAsignacion[]> {
  const [alms, rows] = await Promise.all([
    db.select({ id: almacenes.id, nombre: almacenes.nombre }).from(almacenes)
      .where(eq(almacenes.teamId, teamId)).orderBy(asc(almacenes.nombre)),
    db.select({ almacenId: productAlmacenStock.almacenId, stock: productAlmacenStock.stockActual })
      .from(productAlmacenStock)
      .where(and(eq(productAlmacenStock.teamId, teamId), eq(productAlmacenStock.productId, productId))),
  ]);
  const map = new Map(rows.map(r => [r.almacenId, r.stock]));
  return alms.map(a => ({ id: a.id, nombre: a.nombre, asignado: map.has(a.id), stockActual: map.get(a.id) ?? 0 }));
}

/** Productos del equipo con flag de si están asignados al almacén dado. */
export async function productosDeAlmacen(teamId: number, almacenId: number): Promise<ProductoAsignacion[]> {
  const [prods, rows] = await Promise.all([
    db.select({
      id: products.id, nombre: products.nombre, referencia: products.referencia,
      controlaInventario: products.controlaInventario, visiblePos: products.visiblePos,
    }).from(products).where(and(eq(products.teamId, teamId), eq(products.activo, 'true'))).orderBy(asc(products.nombre)),
    db.select({ productId: productAlmacenStock.productId, stock: productAlmacenStock.stockActual })
      .from(productAlmacenStock)
      .where(and(eq(productAlmacenStock.teamId, teamId), eq(productAlmacenStock.almacenId, almacenId))),
  ]);
  const map = new Map(rows.map(r => [r.productId, r.stock]));
  return prods.map(p => ({
    id: p.id, nombre: p.nombre, referencia: p.referencia,
    controlaInventario: p.controlaInventario, visiblePos: p.visiblePos,
    asignado: map.has(p.id), stockActual: map.get(p.id) ?? 0,
  }));
}

/** Sincroniza el conjunto de filas (producto×almacén) para una dimensión fija. */
async function sync(
  teamId: number,
  fixed: { productId: number } | { almacenId: number },
  desiredVarIds: number[],
): Promise<ResultadoSync> {
  const isProductFixed = 'productId' in fixed;
  // Validar que los ids variables pertenezcan al equipo (anti cross-tenant).
  const validIds = new Set<number>();
  if (desiredVarIds.length) {
    const tabla = isProductFixed ? almacenes : products;
    const rows = await db.select({ id: tabla.id }).from(tabla)
      .where(and(eq(tabla.teamId, teamId), inArray(tabla.id, desiredVarIds)));
    for (const r of rows) validIds.add(r.id);
  }
  const desired = desiredVarIds.filter(id => validIds.has(id));

  const whereFixed = isProductFixed
    ? eq(productAlmacenStock.productId, fixed.productId)
    : eq(productAlmacenStock.almacenId, fixed.almacenId);

  const current = await db
    .select({
      varId: isProductFixed ? productAlmacenStock.almacenId : productAlmacenStock.productId,
      stock: productAlmacenStock.stockActual,
    })
    .from(productAlmacenStock)
    .where(and(eq(productAlmacenStock.teamId, teamId), whereFixed));

  const currentSet = new Map(current.map(c => [c.varId, c.stock]));
  const desiredSet = new Set(desired);

  const toAdd    = desired.filter(id => !currentSet.has(id));
  const toRemove = [...currentSet.keys()].filter(id => !desiredSet.has(id));

  let agregados = 0, removidos = 0;
  const noRemovibles: string[] = [];

  for (const varId of toAdd) {
    const productId = isProductFixed ? fixed.productId : varId;
    const almacenId = isProductFixed ? varId : fixed.almacenId;
    await db.insert(productAlmacenStock)
      .values({ teamId, productId, almacenId, stockActual: 0 })
      .onConflictDoNothing();
    agregados++;
  }

  for (const varId of toRemove) {
    if ((currentSet.get(varId) ?? 0) > 0) {
      const productId = isProductFixed ? fixed.productId : varId;
      const [p] = await db.select({ nombre: products.nombre }).from(products)
        .where(eq(products.id, productId)).limit(1);
      noRemovibles.push(p?.nombre ?? `#${productId}`);
      continue;  // protege el stock: no se borra si > 0
    }
    const productId = isProductFixed ? fixed.productId : varId;
    const almacenId = isProductFixed ? varId : fixed.almacenId;
    await db.delete(productAlmacenStock).where(and(
      eq(productAlmacenStock.teamId, teamId),
      eq(productAlmacenStock.productId, productId),
      eq(productAlmacenStock.almacenId, almacenId),
    ));
    removidos++;
  }

  return { agregados, removidos, noRemovibles };
}

export function setAlmacenesDeProducto(teamId: number, productId: number, almacenIds: number[]) {
  return sync(teamId, { productId }, almacenIds);
}
export function setProductosDeAlmacen(teamId: number, almacenId: number, productIds: number[]) {
  return sync(teamId, { almacenId }, productIds);
}
