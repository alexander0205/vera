/**
 * Catálogo de COMPRAS — artículos/servicios que el negocio COMPRA.
 *
 * GET  /api/compras/catalogo?q=  → busca en el catálogo curado del equipo.
 * POST /api/compras/catalogo     → crea un artículo de compra.
 *
 * Es el simétrico del catálogo de venta (`/api/productos`) pero separado: en
 * una compra/gasto no se ofrece lo que vendes. Alimenta el buscador de líneas
 * de gasto (e43/e47) y compra (e41). Devuelve el shape `Producto` que ya
 * consume el Autocomplete de la factura.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { catalogoCompras } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { and, eq, ilike, or, desc } from 'drizzle-orm';

/** Mapea una fila del catálogo al shape `Producto` que espera el buscador. */
function aProducto(row: typeof catalogoCompras.$inferSelect) {
  return {
    id:          row.id,
    nombre:      row.nombre,
    descripcion: row.descripcion,
    precioDOP:   row.costoCents / 100,
    tasaItbis:   row.tasaItbis,
    tipo:        'servicio' as const,
    referencia:  row.referencia,
    // El catálogo de compras no controla inventario (eso vive en Compras
    // registradas); se rellenan los campos para satisfacer el tipo Producto.
    stockActual:          0,
    stockMinimo:          0,
    controlaInventario:   false,
    permiteVentaSinStock: true,
    // Marca de origen para que el cliente sepa que vino del catálogo de compras.
    esCatalogoCompra:     true,
  };
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const q = new URL(req.url).searchParams.get('q')?.trim();

  let where = and(eq(catalogoCompras.teamId, teamId), eq(catalogoCompras.activo, true));
  if (q) {
    where = and(
      where,
      or(
        ilike(catalogoCompras.nombre, `%${q}%`),
        ilike(catalogoCompras.referencia, `%${q}%`),
      ),
    );
  }

  const rows = await db
    .select()
    .from(catalogoCompras)
    .where(where)
    .orderBy(desc(catalogoCompras.updatedAt))
    .limit(50);

  return NextResponse.json({ items: rows.map(aProducto) });
}

const crearSchema = z.object({
  nombre:          z.string().min(1, 'El nombre es obligatorio').max(255),
  descripcion:     z.string().max(1000).optional().nullable(),
  referencia:      z.string().max(100).optional().nullable(),
  costoDOP:        z.number().min(0).optional(),
  tasaItbis:       z.enum(['0.18', '0.16', '0', 'exento']).default('0.18'),
  proveedorNombre: z.string().max(255).optional().nullable(),
  proveedorRnc:    z.string().max(20).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission('facturas:crear');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const parsed = crearSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const [row] = await db
    .insert(catalogoCompras)
    .values({
      teamId,
      nombre:          d.nombre,
      descripcion:     d.descripcion || null,
      referencia:      d.referencia || null,
      costoCents:      Math.round((d.costoDOP ?? 0) * 100),
      tasaItbis:       d.tasaItbis,
      proveedorNombre: d.proveedorNombre || null,
      proveedorRnc:    d.proveedorRnc || null,
      createdBy:       user.id,
    })
    .returning();

  return NextResponse.json({ ok: true, item: aProducto(row) }, { status: 201 });
}
