/**
 * GET  /api/productos  — Lista productos/servicios del equipo
 * POST /api/productos  — Crea un nuevo producto/servicio
 */

import { NextRequest, NextResponse } from 'next/server';
import { visibleEnFacturacion } from '@/lib/productos/visibilidad';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { products } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, ilike, or, and, sql, getTableColumns } from 'drizzle-orm';

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
  // POS: si aparece en la grilla del punto de venta y si es favorito.
  visiblePos:           z.boolean().optional(),
  visibleFacturacion:   z.boolean().optional(),
  posFavorito:          z.boolean().optional(),
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

  // `?contexto=facturacion` aplica la regla de visibilidad (producto oculto o
  // almacén solo-POS). Es OPT-IN a propósito: la pantalla de Productos tiene que
  // seguir mostrándolos todos, si no no habría forma de editarlos ni de volver a
  // hacerlos visibles. Solo lo pide el buscador de las facturas.
  if (params.get('contexto') === 'facturacion') {
    whereCondition = and(whereCondition, visibleEnFacturacion()) as typeof whereCondition;
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
    categoriaId, imagen, visiblePos, visibleFacturacion, posFavorito,
  } = parsed.data;

  // Default inteligente: un servicio no se muestra en el mostrador salvo que
  // se marque explícito; un bien sí. El usuario puede sobreescribir.
  const visiblePosFinal = visiblePos ?? (tipo === 'bien');

  const [created] = await db.insert(products).values({
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
    stockActual:          stockActual ?? 0,
    stockMinimo:          stockMinimo ?? 0,
    categoriaId:          categoriaId ?? null,
    imagen:               imagen ?? null,
    visiblePos:           visiblePosFinal,
    visibleFacturacion:   visibleFacturacion ?? true,
    posFavorito:          posFavorito ?? false,
    controlaInventario:   tipo === 'bien' ? (controlaInventario ?? false) : false,
    permiteVentaSinStock: permiteVentaSinStock ?? true,
  }).returning();

  return NextResponse.json({ ok: true, producto: { ...created, precioDOP: created.precio / 100, costoDOP: created.costo / 100 } }, { status: 201 });
}
