import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarConceptoCuotas, adminEscolarConceptosPago } from '@/lib/db/schema';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  LARGO_NOMBRE, claveDeNombre, cuotasDeLaCopia, valoresDeLaCopia,
} from '@/lib/administracion-escolar/duplicar-concepto';
import { and, asc, desc, eq } from 'drizzle-orm';

/**
 * POST { nombre } — crea un concepto nuevo con la configuración y el
 * calendario de cuotas de este. Sin tarifas ni producto de facturación: ver
 * `duplicar-concepto.ts`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const origenId = parseInt((await params).id, 10);
  if (!Number.isInteger(origenId) || origenId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim().replace(/\s+/g, ' ') : '';
  if (!nombre) return NextResponse.json({ error: 'Ponle nombre al concepto nuevo' }, { status: 400 });
  if (nombre.length > LARGO_NOMBRE) {
    return NextResponse.json({ error: `El nombre puede tener hasta ${LARGO_NOMBRE} caracteres` }, { status: 400 });
  }

  const conceptos = await db.select().from(adminEscolarConceptosPago)
    .where(eq(adminEscolarConceptosPago.teamId, teamId))
    .orderBy(desc(adminEscolarConceptosPago.orden));
  const origen = conceptos.find((c) => c.id === origenId);
  if (!origen) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });
  if (conceptos.some((c) => claveDeNombre(c.nombre) === claveDeNombre(nombre))) {
    return NextResponse.json({ error: `Ya hay un concepto que se llama «${nombre}»` }, { status: 409 });
  }

  const cuotas = await db.select().from(adminEscolarConceptoCuotas)
    .where(and(
      eq(adminEscolarConceptoCuotas.teamId, teamId),
      eq(adminEscolarConceptoCuotas.conceptoId, origenId),
    ))
    .orderBy(asc(adminEscolarConceptoCuotas.periodoId), asc(adminEscolarConceptoCuotas.numero));

  // Concepto y calendario juntos: un concepto copiado sin sus cuotas cobraría
  // en la fecha de la matrícula, no en la del calendario, sin que se note.
  const concepto = await db.transaction(async (tx) => {
    // Al final de la lista, como un concepto nuevo (ver POST /conceptos).
    const orden = (conceptos[0]?.orden ?? -1) + 1;
    const [nuevo] = await tx.insert(adminEscolarConceptosPago)
      .values(valoresDeLaCopia(origen, nombre, orden))
      .returning();
    const filas = cuotasDeLaCopia(origen, cuotas, nuevo.id, nombre);
    if (filas.length) await tx.insert(adminEscolarConceptoCuotas).values(filas);
    return nuevo;
  });

  invalidarEstructura(teamId);
  return NextResponse.json({ concepto, cuotasCopiadas: cuotas.length });
}
