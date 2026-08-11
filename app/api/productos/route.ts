/**
 * GET  /api/productos  — Lista productos/servicios del equipo
 * POST /api/productos  — Crea un nuevo producto/servicio
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { products, productVariants, productVariantAlmacenStock, almacenes } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, ilike, or, and, sql, getTableColumns, desc, asc } from 'drizzle-orm';

// Ejes de variante definidos por el usuario (MVP "por producto"):
// [{ nombre: "Talla", valores: ["M","L","XL"] }]
const variantAtributoSchema = z.object({
  nombre:  z.string().min(1).max(50),
  valores: z.array(z.string().min(1).max(50)).min(1),
});

// Una combinación concreta con su stock (MVP "global": una sola cifra).
const variantSchema = z.object({
  atributos:    z.record(z.string(), z.string()),   // { "Talla": "M" }
  nombre:       z.string().min(1).max(255),          // display: "M" ó "Rojo · M"
  referencia:   z.string().max(100).optional().nullable(),
  codigoBarras: z.string().max(64).optional().nullable(),
  precio:       z.number().min(0).optional().nullable(), // null = hereda del padre
  costo:        z.number().min(0).optional(),
  stockActual:  z.number().int().min(0).optional(),
  stockMinimo:  z.number().int().min(0).optional(),
});

const productoSchema = z.object({
  nombre:               z.string().min(1, 'El nombre es obligatorio').max(255),
  descripcion:          z.string().max(1000).optional().nullable(),
  referencia:           z.string().max(100).optional().nullable(),
  codigoBarras:         z.string().max(64).optional().nullable(),
  precio:               z.number().min(0, 'El precio no puede ser negativo'),
  tasaItbis:            z.enum(['0.18', '0.16', '0', 'exento']).default('0.18'),
  tipo:                 z.enum(['bien', 'servicio']).default('servicio'),
  unidadMedida:         z.string().max(50).optional(),
  costo:                z.number().min(0).optional(),
  stockActual:          z.number().int().min(0).optional(),
  stockMinimo:          z.number().int().min(0).optional(),
  controlaInventario:   z.boolean().optional(),
  permiteVentaSinStock: z.boolean().optional(),
  categoriaId:          z.number().int().positive().optional().nullable(),
  imagen:               z.string().max(1_500_000).optional().nullable(),
  // Variantes (opcional). Si `variants` viene con filas, el producto se marca
  // como bien con control de inventario y su stock global es la suma de variantes.
  variantAtributos:     z.array(variantAtributoSchema).max(5).optional(),
  variants:             z.array(variantSchema).max(200).optional(),
});

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const q    = params.get('q')?.trim();
  const tipo = params.get('tipo'); // 'bien' | 'servicio'

  let whereCondition = eq(products.teamId, teamId);

  if (q && tipo) {
    whereCondition = and(
      eq(products.teamId, teamId),
      eq(products.tipo, tipo),
      or(
        ilike(products.nombre, `%${q}%`),
        ilike(products.referencia, `%${q}%`),
      )
    ) as typeof whereCondition;
  } else if (q) {
    whereCondition = and(
      eq(products.teamId, teamId),
      or(
        ilike(products.nombre, `%${q}%`),
        ilike(products.referencia, `%${q}%`),
      )
    ) as typeof whereCondition;
  } else if (tipo) {
    whereCondition = and(eq(products.teamId, teamId), eq(products.tipo, tipo)) as typeof whereCondition;
  }

  // Paginación opcional (compatible: sin params trae hasta 1000).
  const limit  = Math.min(Number(params.get('limit'))  || 1000, 1000);
  const offset = Math.max(Number(params.get('offset')) || 0, 0);

  // Excluir la columna `imagen` del listado: es un data-URL base64 (hasta ~800KB
  // por fila) que la tabla no muestra. Se carga on-demand al editar vía [id].
  const { imagen, ...cols } = getTableColumns(products);

  const rows = await db
    .select({ ...cols, tieneImagen: sql<boolean>`${products.imagen} IS NOT NULL` })
    .from(products)
    .where(whereCondition)
    .orderBy(products.nombre)
    .limit(limit)
    .offset(offset);

  const result = rows.map((p) => ({
    ...p,
    precioDOP: p.precio / 100,
    costoDOP:  p.costo  / 100,
  }));

  return NextResponse.json({ productos: result });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('productos:gestionar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const body = await req.json();
  const parsed = productoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  const {
    nombre, descripcion, referencia, codigoBarras, precio, tasaItbis, tipo,
    unidadMedida, costo, stockActual, stockMinimo, controlaInventario, permiteVentaSinStock,
    categoriaId, imagen, variantAtributos, variants,
  } = parsed.data;

  // Solo un bien puede llevar variantes; en servicios se ignoran.
  const conVariantes = tipo === 'bien' && !!variants && variants.length > 0;
  // Con variantes el conteo real vive por variante; el stock global del producto
  // se guarda como la SUMA (para listados/alertas) y siempre controla inventario.
  const stockGlobalVariantes = conVariantes
    ? variants!.reduce((s, v) => s + (v.stockActual ?? 0), 0)
    : null;

  const created = await db.transaction(async (tx) => {
    const [prod] = await tx.insert(products).values({
      teamId,
      nombre,
      descripcion:          descripcion  || null,
      referencia:           referencia   || null,
      codigoBarras:         codigoBarras || null,
      precio:               Math.round(precio * 100),
      tasaItbis,
      tipo,
      activo:               'true',
      createdBy:            user.id,
      unidadMedida:         unidadMedida ?? 'Unidad',
      costo:                Math.round((costo ?? 0) * 100),
      stockActual:          conVariantes ? stockGlobalVariantes! : (stockActual ?? 0),
      stockMinimo:          stockMinimo ?? 0,
      categoriaId:          categoriaId ?? null,
      imagen:               imagen ?? null,
      controlaInventario:   tipo === 'bien' ? (conVariantes || (controlaInventario ?? false)) : false,
      permiteVentaSinStock: permiteVentaSinStock ?? true,
      variantAtributos:     conVariantes ? (variantAtributos ?? []) : [],
    }).returning();

    if (conVariantes) {
      const creadas = await tx.insert(productVariants).values(
        variants!.map((v) => ({
          teamId,
          productId:    prod.id,
          atributos:    v.atributos,
          nombre:       v.nombre,
          referencia:   v.referencia   || null,
          codigoBarras: v.codigoBarras || null,
          precio:       v.precio != null ? Math.round(v.precio * 100) : null,
          costo:        Math.round((v.costo ?? 0) * 100),
          stockActual:  v.stockActual ?? 0,
          stockMinimo:  v.stockMinimo ?? 0,
        })),
      ).returning({ id: productVariants.id, stockActual: productVariants.stockActual });

      // Opción B: sembrar el stock inicial de cada variante en el almacén por
      // defecto (o el primero si no hay uno marcado). Así el conteo fino vive por
      // almacén desde el inicio y el producto aparece en el POS de ese almacén.
      // La gestión por-almacén más fina (repartir entre almacenes) queda para
      // la pantalla de detalle del producto.
      const [almacenDefault] = await tx
        .select({ id: almacenes.id })
        .from(almacenes)
        .where(eq(almacenes.teamId, teamId))
        .orderBy(desc(almacenes.esDefault), asc(almacenes.id))
        .limit(1);

      if (almacenDefault) {
        const filas = creadas
          .filter((c) => (c.stockActual ?? 0) > 0)
          .map((c) => ({ teamId, variantId: c.id, almacenId: almacenDefault.id, stockActual: c.stockActual }));
        if (filas.length > 0) {
          await tx.insert(productVariantAlmacenStock).values(filas);
        }
      }
    }
    return prod;
  });

  return NextResponse.json({ ok: true, producto: { ...created, precioDOP: created.precio / 100, costoDOP: created.costo / 100 } }, { status: 201 });
}
