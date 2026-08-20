/**
 * GET    /api/productos/[id]  — Detalle de un producto
 * PUT    /api/productos/[id]  — Actualiza un producto
 * DELETE /api/productos/[id]  — Elimina un producto
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  products, inventoryMovements, productVariants, productVariantAlmacenStock, almacenes,
} from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and, sql, desc, asc } from 'drizzle-orm';

// Ejes de variante (igual que en POST /api/productos).
const variantAtributoSchema = z.object({
  nombre:  z.string().min(1).max(50),
  valores: z.array(z.string().min(1).max(50)).min(1),
});

// Fila de variante en edición. `id` presente = variante existente; ausente =
// nueva. `removed` = soft-delete. `stockActual` = objetivo en el almacén por
// defecto. `precio` null = hereda del padre.
const variantEditSchema = z.object({
  id:          z.number().int().positive().optional(),
  atributos:   z.record(z.string(), z.string()),
  nombre:      z.string().min(1).max(255),
  precio:      z.number().min(0).optional().nullable(),
  stockActual: z.number().int().min(0).optional(),
  removed:     z.boolean().optional(),
});

const updateSchema = z.object({
  nombre:               z.string().min(1).max(255),
  descripcion:          z.string().max(1000).optional().nullable(),
  referencia:           z.string().max(100).optional().nullable(),
  codigoBarras:         z.string().max(64).optional().nullable(),
  precio:               z.number().min(0),
  tasaItbis:            z.enum(['0.18', '0.16', '0', 'exento']),
  tipo:                 z.enum(['bien', 'servicio']),
  activo:               z.boolean().optional(),
  unidadMedida:         z.string().max(50).optional(),
  costo:                z.number().min(0).optional(),
  stockActual:          z.number().int().min(0).optional(),
  stockMinimo:          z.number().int().min(0).optional(),
  controlaInventario:   z.boolean().optional(),
  permiteVentaSinStock: z.boolean().optional(),
  visiblePos:           z.boolean().optional(),
  visibleFacturacion:   z.boolean().optional(),
  categoriaId:          z.number().int().positive().optional().nullable(),
  imagen:               z.string().max(1_500_000).optional().nullable(),
  // Variantes (Opción B). Si `variants` viene, se reconcilian con las existentes.
  variantAtributos:     z.array(variantAtributoSchema).max(5).optional(),
  variants:             z.array(variantEditSchema).max(200).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const prodId = parseInt(id);
  if (isNaN(prodId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [prod] = await db.select().from(products)
    .where(and(eq(products.id, prodId), eq(products.teamId, teamId))).limit(1);
  if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  // Las variantes van con el producto: quien pregunta por un producto con ejes
  // casi siempre necesita saber CUÁLES son (para elegir talla al ajustar el
  // inventario, por ejemplo). Traerlas aparte obligaba a una segunda ruta y a
  // que cada pantalla se acordara de llamarla.
  const variantes = await db.select({
    id: productVariants.id,
    nombre: productVariants.nombre,
    atributos: productVariants.atributos,
    precio: productVariants.precio,
    stockActual: productVariants.stockActual,
    activo: productVariants.activo,
  })
    .from(productVariants)
    .where(and(
      eq(productVariants.productId, prodId),
      eq(productVariants.teamId, teamId),
      eq(productVariants.activo, true),
    ))
    .orderBy(productVariants.id);

  return NextResponse.json({
    producto: { ...prod, precioDOP: prod.precio / 100, costoDOP: prod.costo / 100, variantes },
  });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('productos:gestionar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const { id } = await params;
  const prodId = parseInt(id);
  if (isNaN(prodId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  const {
    nombre, descripcion, referencia, codigoBarras, precio, tasaItbis, tipo, activo,
    unidadMedida, costo, stockActual, stockMinimo, controlaInventario, permiteVentaSinStock,
    visiblePos, visibleFacturacion,
    categoriaId, imagen, variantAtributos, variants,
  } = parsed.data;

  // ¿Este PUT reconcilia variantes? Solo bienes que mandan `variants`.
  const reconciliaVariantes = tipo === 'bien' && Array.isArray(variants);

  // Transacción: lock del producto, escribe campos, y si stockActual cambió
  // registra un movimiento de ajuste por el delta (no romper la auditoría de
  // inventory_movements — editar el número a mano debe dejar rastro).
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx.execute<{ stock_actual: number; controla_inventario: boolean; tipo: string }>(sql`
      SELECT stock_actual, controla_inventario, tipo
      FROM products
      WHERE id = ${prodId} AND team_id = ${teamId}
      FOR UPDATE
    `);
    if (!existing) return null;

    const [row] = await tx.update(products).set({
      nombre,
      descripcion:          descripcion || null,
      referencia:           referencia  || null,
      codigoBarras:         codigoBarras || null,
      precio:               Math.round(precio * 100),
      tasaItbis,
      tipo,
      activo:               activo === false ? 'false' : 'true',
      updatedBy:            user.id,
      ...(unidadMedida         !== undefined && { unidadMedida }),
      ...(costo                !== undefined && { costo: Math.round(costo * 100) }),
      ...(stockActual          !== undefined && { stockActual }),
      ...(stockMinimo          !== undefined && { stockMinimo }),
      ...(controlaInventario   !== undefined && { controlaInventario }),
      ...(permiteVentaSinStock !== undefined && { permiteVentaSinStock }),
      // Estas dos estaban en el esquema de validación y NO en el update: el
      // formulario mandaba «¿dónde se vende?», la API la daba por buena y la
      // tiraba. Editar un producto para sacarlo de la caja no hacía nada, y por
      // eso 334 de 335 productos de producción seguían con visible_pos = true
      // pese a que el desplegable lleva meses en pantalla.
      ...(visiblePos           !== undefined && { visiblePos }),
      ...(visibleFacturacion   !== undefined && { visibleFacturacion }),
      ...(categoriaId          !== undefined && { categoriaId }),
      ...(imagen               !== undefined && { imagen }),
      updatedAt: new Date(),
    }).where(eq(products.id, prodId)).returning();

    // Movimiento de auditoría solo si el stock cambió en un bien controlado.
    // Con variantes el conteo vive por variante: el stock del producto lo lleva
    // el bloque de reconciliación (abajo), no este ajuste a nivel producto.
    const controla = controlaInventario ?? existing.controla_inventario;
    if (!reconciliaVariantes && stockActual !== undefined && existing.tipo === 'bien' && controla && stockActual !== existing.stock_actual) {
      const delta     = stockActual - existing.stock_actual;
      const esEntrada = delta > 0;
      await tx.insert(inventoryMovements).values({
        teamId,
        productoId:   prodId,
        tipo:         esEntrada ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
        cantidad:     Math.abs(delta),
        esEntrada,
        stockAntes:   existing.stock_actual,
        stockDespues: stockActual,
        motivo:       'Ajuste manual desde edición de producto',
        createdBy:    user.id,
      });
    }

    // ── Reconciliación de variantes (Opción B) ────────────────────────────────
    if (reconciliaVariantes) {
      // Almacén por defecto: donde este form ajusta el stock de la variante
      // (mismo criterio que la siembra al crear en POST /api/productos).
      const [almacenDefault] = await tx
        .select({ id: almacenes.id })
        .from(almacenes)
        .where(eq(almacenes.teamId, teamId))
        .orderBy(desc(almacenes.esDefault), asc(almacenes.id))
        .limit(1);

      // Stock de la variante en el almacén por defecto (0 si no hay fila).
      const stockDefault = async (variantId: number): Promise<number> => {
        if (!almacenDefault) return 0;
        const [r] = await tx
          .select({ s: productVariantAlmacenStock.stockActual })
          .from(productVariantAlmacenStock)
          .where(and(
            eq(productVariantAlmacenStock.variantId, variantId),
            eq(productVariantAlmacenStock.almacenId, almacenDefault.id),
          ))
          .limit(1);
        return r?.s ?? 0;
      };
      // Suma del stock de la variante en TODOS los almacenes (denormalizado).
      const sumStock = async (variantId: number): Promise<number> => {
        const [r] = await tx
          .select({ s: sql<number>`coalesce(sum(${productVariantAlmacenStock.stockActual}), 0)` })
          .from(productVariantAlmacenStock)
          .where(eq(productVariantAlmacenStock.variantId, variantId));
        return Number(r?.s ?? 0);
      };
      // Fija el stock de la variante en el almacén por defecto a `target`,
      // dejando rastro en inventory_movements por el delta (con variant_id).
      const setStockDefault = async (variantId: number, target: number): Promise<void> => {
        if (!almacenDefault) return;
        const antes = await stockDefault(variantId);
        const delta = target - antes;
        if (delta === 0) return;
        await tx
          .insert(productVariantAlmacenStock)
          .values({ teamId, variantId, almacenId: almacenDefault.id, stockActual: target })
          .onConflictDoUpdate({
            target: [productVariantAlmacenStock.variantId, productVariantAlmacenStock.almacenId],
            set:    { stockActual: target },
          });
        await tx.insert(inventoryMovements).values({
          teamId,
          productoId:   prodId,
          variantId,
          tipo:         delta > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA',
          cantidad:     Math.abs(delta),
          esEntrada:    delta > 0,
          stockAntes:   antes,
          stockDespues: target,
          motivo:       'Ajuste manual desde edición de variantes',
          createdBy:    user.id,
        });
      };

      for (const v of variants!) {
        if (v.id) {
          if (v.removed) {
            // Soft-delete: baja su stock del almacén por defecto y desactiva.
            await setStockDefault(v.id, 0);
            const total = await sumStock(v.id);
            await tx.update(productVariants)
              .set({ activo: false, stockActual: total, updatedAt: new Date() })
              .where(and(eq(productVariants.id, v.id), eq(productVariants.teamId, teamId)));
          } else {
            if (v.stockActual !== undefined) await setStockDefault(v.id, v.stockActual);
            const total = await sumStock(v.id);
            await tx.update(productVariants)
              .set({
                atributos:   v.atributos,
                nombre:      v.nombre,
                precio:      v.precio != null ? Math.round(v.precio * 100) : null,
                stockActual: total,
                activo:      true,
                updatedAt:   new Date(),
              })
              .where(and(eq(productVariants.id, v.id), eq(productVariants.teamId, teamId)));
          }
        } else {
          // Nueva variante.
          const [nv] = await tx
            .insert(productVariants)
            .values({
              teamId,
              productId: prodId,
              atributos: v.atributos,
              nombre:    v.nombre,
              precio:    v.precio != null ? Math.round(v.precio * 100) : null,
              stockActual: 0,
            })
            .returning({ id: productVariants.id });
          if ((v.stockActual ?? 0) > 0) await setStockDefault(nv.id, v.stockActual!);
          const total = await sumStock(nv.id);
          if (total !== 0) {
            await tx.update(productVariants)
              .set({ stockActual: total })
              .where(eq(productVariants.id, nv.id));
          }
        }
      }

      // Denormalizados del producto: ejes + stock global = suma de variantes activas.
      const [agg] = await tx
        .select({ s: sql<number>`coalesce(sum(${productVariants.stockActual}), 0)` })
        .from(productVariants)
        .where(and(
          eq(productVariants.productId, prodId),
          eq(productVariants.teamId, teamId),
          eq(productVariants.activo, true),
        ));
      await tx.update(products)
        .set({
          variantAtributos:   variantAtributos ?? [],
          controlaInventario: true,
          stockActual:        Number(agg?.s ?? 0),
          updatedAt:          new Date(),
        })
        .where(eq(products.id, prodId));
    }

    return row;
  });

  if (!updated) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true, producto: { ...updated, precioDOP: updated.precio / 100, costoDOP: updated.costo / 100 } });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('productos:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const prodId = parseInt(id);
  if (isNaN(prodId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [existing] = await db.select({ id: products.id }).from(products)
    .where(and(eq(products.id, prodId), eq(products.teamId, teamId))).limit(1);
  if (!existing) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

  await db.delete(products).where(eq(products.id, prodId));
  return NextResponse.json({ ok: true });
}
