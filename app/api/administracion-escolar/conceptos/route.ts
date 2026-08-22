import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarConceptosPago, products } from '@/lib/db/schema';
import { cachearPorTag, invalidarEstructura, tagEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { camposCiclo } from '@/lib/administracion-escolar/ciclo-cobro';
import { eq, asc, desc, and } from 'drizzle-orm';

const TIPOS = ['inscripcion', 'mensualidad', 'uniforme', 'actividad', 'otro'];

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  // Los conceptos de pago se definen al empezar el curso y se leen en cada
  // pantalla de cargos: se sirven de caché hasta que alguien los cambie.
  const rows = await cachearPorTag(
    () => db
    .select({
      id: adminEscolarConceptosPago.id,
      teamId: adminEscolarConceptosPago.teamId,
      nombre: adminEscolarConceptosPago.nombre,
      tipo: adminEscolarConceptosPago.tipo,
      frecuencia: adminEscolarConceptosPago.frecuencia,
      activo: adminEscolarConceptosPago.activo,
      productId: adminEscolarConceptosPago.productId,
      productNombre: products.nombre,
      admiteBeca:       adminEscolarConceptosPago.admiteBeca,
      cobraMora:        adminEscolarConceptosPago.cobraMora,
      diaEmision:       adminEscolarConceptosPago.diaEmision,
      diasParaPago:     adminEscolarConceptosPago.diasParaPago,
      avisosActivos:    adminEscolarConceptosPago.avisosActivos,
      avisoDiaEmision:  adminEscolarConceptosPago.avisoDiaEmision,
      avisoDiaVencimiento: adminEscolarConceptosPago.avisoDiaVencimiento,
      avisoAntesMoraDias: adminEscolarConceptosPago.avisoAntesMoraDias,
      moraDiasGracia:   adminEscolarConceptosPago.moraDiasGracia,
      avisoCorreo:      adminEscolarConceptosPago.avisoCorreo,
      avisoWhatsapp:    adminEscolarConceptosPago.avisoWhatsapp,
      avisoSms:         adminEscolarConceptosPago.avisoSms,
      descuentoAdelantoPct: adminEscolarConceptosPago.descuentoAdelantoPct,
      orden:            adminEscolarConceptosPago.orden,
    })
    .from(adminEscolarConceptosPago)
    .leftJoin(products, eq(adminEscolarConceptosPago.productId, products.id))
    .where(eq(adminEscolarConceptosPago.teamId, teamId))
    // El nombre desempata: dos conceptos con el mismo orden —uno recién creado,
    // o un empate heredado de la migración— saldrían en orden de la base, que
    // puede cambiar entre dos lecturas y hace que la lista baile sola.
    .orderBy(asc(adminEscolarConceptosPago.orden), asc(adminEscolarConceptosPago.nombre)),
    ['escolar', 'conceptos', String(teamId)],
    [tagEstructura(teamId)],
  )();
  return NextResponse.json({ conceptos: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const body = await req.json();
  const { nombre, tipo, activo, productId, admiteBeca } = body;
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  if (productId !== undefined && productId !== null) {
    const [p] = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.teamId, teamId)))
      .limit(1);
    if (!p) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  const tipoNorm = TIPOS.includes(tipo) ? tipo : 'otro';
  // Al final de la lista, no encima de todo. Sin esto cada concepto nuevo nacía
  // con `orden = 0` —el valor por defecto de la columna— y se colaba delante de
  // los que el colegio había puesto en su sitio con las flechas.
  const [ultimo] = await db
    .select({ orden: adminEscolarConceptosPago.orden })
    .from(adminEscolarConceptosPago)
    .where(eq(adminEscolarConceptosPago.teamId, teamId))
    .orderBy(desc(adminEscolarConceptosPago.orden))
    .limit(1);

  const [row] = await db.insert(adminEscolarConceptosPago).values({
    teamId,
    orden: (ultimo?.orden ?? -1) + 1,
    nombre: nombre.trim(),
    tipo: tipoNorm,
    // La mensualidad nace mensual; todo lo demás nace de pago único, que es lo
    // que menos daño hace si nadie lo revisa: genera una cuota, no once.
    frecuencia: tipoNorm === 'mensualidad' ? 'mensual' : 'unico',
    productId: productId ?? null,
    activo: activo ?? true,
    // Si la beca del alumno descuenta aquí. Por defecto no: una beca cubre la
    // mensualidad, no la inscripción ni el uniforme.
    admiteBeca: admiteBeca === true,
    ...camposCiclo(body),
  }).returning();
  invalidarEstructura(teamId);
  return NextResponse.json({ concepto: row });
}
