/**
 * POST /api/inventario/ajuste
 * Registra un movimiento manual de stock: entrada, salida, corrección o stock inicial.
 * Actualiza stock_actual del producto atómicamente con SELECT FOR UPDATE.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { products, inventoryMovements, teamMembers } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, sql } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';

const ajusteSchema = z.object({
  productoId:  z.number().int().positive(),
  tipo:        z.enum(['ENTRADA', 'AJUSTE_SALIDA', 'AJUSTE_ENTRADA', 'STOCK_INICIAL']),
  cantidad:    z.number().int().positive('La cantidad debe ser mayor a 0'),
  motivo:      z.string().max(500).optional().nullable(),
  almacenId:   z.number().int().positive().optional().nullable(),
  /**
   * Qué variante entra o sale. Obligatorio si el producto tiene ejes definidos.
   *
   * Sin esto, una entrada de cinco camisetas subía el total del producto y no
   * tocaba ninguna talla: el producto quedaba en 23 con M(10)+L(8)=18, cinco
   * unidades que existen en el total y en ninguna talla. Nadie se enteraba
   * hasta contar el almacén.
   */
  variantId:   z.number().int().positive().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);
  if (!userCan(user.platformRole, m?.role, 'productos:gestionar')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = ajusteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  const { productoId, tipo, cantidad, motivo, almacenId, variantId } = parsed.data;

  const esEntrada = tipo === 'ENTRADA' || tipo === 'AJUSTE_ENTRADA' || tipo === 'STOCK_INICIAL';

  const result = await db.transaction(async (tx) => {
    // Lock row para evitar race conditions en stock concurrente
    const [prod] = await tx.execute<{ id: number; stock_actual: number; controla_inventario: boolean; tipo: string; permite_venta_sin_stock: boolean; variant_atributos: unknown }>(sql`
      SELECT id, stock_actual, controla_inventario, tipo, permite_venta_sin_stock, variant_atributos
      FROM products
      WHERE id = ${productoId} AND team_id = ${teamId}
      FOR UPDATE
    `);

    if (!prod) return { error: 'Producto no encontrado', status: 404 };
    if (prod.tipo !== 'bien') return { error: 'Solo los productos tipo bien pueden tener ajustes de inventario', status: 422 };

    // El producto con ejes de variante NO tiene un stock propio que ajustar: su
    // total es la suma de las tallas. Aceptar el ajuste "al producto" sería
    // aceptar un número que no cuadra con su propio desglose, y eso no se ve
    // hasta el conteo físico. Se rechaza aquí y no solo en la pantalla, porque
    // la pantalla no es la única que llama a esto.
    const tieneVariantes = Array.isArray(prod.variant_atributos) && prod.variant_atributos.length > 0;
    if (tieneVariantes && !variantId) {
      return { error: 'Este producto tiene variantes: indica a cuál va el movimiento', status: 422 };
    }
    if (variantId && !tieneVariantes) {
      return { error: 'Este producto no tiene variantes', status: 422 };
    }

    // La variante tiene que ser de ESTE producto y de ESTE equipo. Sin la
    // comprobación, un id de otro producto movería un stock ajeno.
    let stockVarianteAntes = 0;
    if (variantId) {
      const [variante] = await tx.execute<{ stock_actual: number }>(sql`
        SELECT stock_actual FROM product_variants
        WHERE id = ${variantId} AND product_id = ${productoId} AND team_id = ${teamId}
        FOR UPDATE
      `);
      if (!variante) return { error: 'La variante no es de este producto', status: 422 };
      stockVarianteAntes = variante.stock_actual;
    }

    // Lo que se registra en el movimiento es el stock de lo que se movió: el de
    // la talla cuando hay talla, el del producto cuando no. Guardar el total
    // del producto en un movimiento de una talla haría ilegible el historial.
    const stockAntes   = variantId ? stockVarianteAntes : prod.stock_actual;
    const stockDespues = esEntrada ? stockAntes + cantidad : Math.max(0, stockAntes - cantidad);
    // Lo que de verdad se movió: con salida a stock 0 el delta es menor que la
    // cantidad pedida, y el total del producto tiene que bajar solo eso.
    const delta = stockDespues - stockAntes;

    if (variantId) {
      await tx.execute(sql`
        UPDATE product_variants SET stock_actual = ${stockDespues}, updated_at = now()
        WHERE id = ${variantId} AND team_id = ${teamId}
      `);
      // El total del producto sigue siendo la suma de sus tallas.
      await tx.execute(sql`
        UPDATE products SET stock_actual = GREATEST(0, stock_actual + ${delta}), updated_at = now()
        WHERE id = ${productoId} AND team_id = ${teamId}
      `);
    } else {
      await tx.update(products)
        .set({ stockActual: stockDespues, updatedAt: new Date() })
        .where(and(eq(products.id, productoId), eq(products.teamId, teamId)));
    }

    const [mov] = await tx.insert(inventoryMovements).values({
      // NULL cuando el ajuste no especifica almacén: igual que antes.
      almacenId: almacenId ?? null,
      teamId,
      productoId,
      variantId: variantId ?? null,
      tipo,
      cantidad,
      esEntrada,
      stockAntes,
      stockDespues,
      motivo:    motivo || null,
      createdBy: user.id,
    }).returning();

    // El stock por almacén de la talla, que es lo que mira el punto de venta
    // para saber si puede vender esa M. Va además del stock por almacén del
    // producto, no en su lugar: el POS usa el primero y los listados el segundo.
    if (almacenId && variantId) {
      await tx.execute(sql`
        INSERT INTO product_variant_almacen_stock (team_id, variant_id, almacen_id, stock_actual)
        VALUES (${teamId}, ${variantId}, ${almacenId}, GREATEST(0, ${delta}))
        ON CONFLICT (variant_id, almacen_id)
        DO UPDATE SET stock_actual = GREATEST(0, product_variant_almacen_stock.stock_actual + ${delta})
      `);
    }

    if (almacenId) {
      await tx.execute(sql`
        INSERT INTO product_almacen_stock (team_id, product_id, almacen_id, stock_actual)
        VALUES (${teamId}, ${productoId}, ${almacenId},
          GREATEST(0, COALESCE((
            SELECT stock_actual FROM product_almacen_stock
            WHERE product_id = ${productoId} AND almacen_id = ${almacenId}
          ), 0) + ${delta})
        )
        ON CONFLICT (product_id, almacen_id)
        DO UPDATE SET stock_actual = GREATEST(0, product_almacen_stock.stock_actual + ${delta})
      `);
    }

    return { ok: true, movimiento: mov, stockActual: stockDespues };
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status as number });
  }

  return NextResponse.json(result, { status: 201 });
}
