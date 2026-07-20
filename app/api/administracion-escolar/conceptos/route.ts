import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarConceptosPago, products } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, asc, and } from 'drizzle-orm';

const TIPOS = ['inscripcion', 'mensualidad', 'uniforme', 'actividad', 'otro'];

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const rows = await db
    .select({
      id: adminEscolarConceptosPago.id,
      teamId: adminEscolarConceptosPago.teamId,
      nombre: adminEscolarConceptosPago.nombre,
      tipo: adminEscolarConceptosPago.tipo,
      recurrente: adminEscolarConceptosPago.recurrente,
      activo: adminEscolarConceptosPago.activo,
      productId: adminEscolarConceptosPago.productId,
      productNombre: products.nombre,
    })
    .from(adminEscolarConceptosPago)
    .leftJoin(products, eq(adminEscolarConceptosPago.productId, products.id))
    .where(eq(adminEscolarConceptosPago.teamId, teamId))
    .orderBy(asc(adminEscolarConceptosPago.nombre));
  return NextResponse.json({ conceptos: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { nombre, tipo, recurrente, activo, productId } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  if (productId !== undefined && productId !== null) {
    const [p] = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.teamId, teamId)))
      .limit(1);
    if (!p) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  const tipoNorm = TIPOS.includes(tipo) ? tipo : 'otro';
  const [row] = await db.insert(adminEscolarConceptosPago).values({
    teamId,
    nombre: nombre.trim(),
    tipo: tipoNorm,
    recurrente: recurrente ?? tipoNorm === 'mensualidad',
    productId: productId ?? null,
    activo: activo ?? true,
  }).returning();
  return NextResponse.json({ concepto: row });
}
