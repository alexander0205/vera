/**
 * GET /api/compras/capturas — las capturas de foto pendientes de registrar.
 *
 * La cola que el negocio revisa: cada foto que entró por el enlace público, con
 * lo que QR/IA leyó y una miniatura. Registrar/descartar es aparte.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { comprasCapturas } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { urlDeFoto } from '@/lib/fotos/storage';

export async function GET() {
  const auth = await requirePermission('productos:gestionar');
  if (!auth.ok) return auth.response;

  const filas = await db
    .select({
      id:           comprasCapturas.id,
      origen:       comprasCapturas.origen,
      extraido:     comprasCapturas.extraido,
      proveedorRnc: comprasCapturas.proveedorRnc,
      ncf:          comprasCapturas.ncf,
      totalCents:   comprasCapturas.totalCents,
      fotoRef:      comprasCapturas.fotoRef,
      creadoEn:     comprasCapturas.creadoEn,
    })
    .from(comprasCapturas)
    .where(and(eq(comprasCapturas.teamId, auth.teamId), eq(comprasCapturas.estado, 'pendiente')))
    .orderBy(desc(comprasCapturas.id))
    .limit(100);

  const capturas = await Promise.all(filas.map(async (f) => ({
    id: f.id,
    origen: f.origen,
    proveedorNombre: f.extraido?.proveedorNombre ?? null,
    proveedorRnc: f.proveedorRnc,
    ncf: f.ncf,
    fecha: f.extraido?.fecha ?? null,
    totalCents: f.totalCents,
    fotoUrl: await urlDeFoto(f.fotoRef),
    creadoEn: f.creadoEn.toISOString(),
  })));

  return NextResponse.json({ capturas });
}
