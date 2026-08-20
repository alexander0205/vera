import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarServicios, adminEscolarGrados, adminEscolarConceptosPago } from '@/lib/db/schema';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/**
 * Reordena de golpe a todos los hermanos de un nivel.
 *
 * Existe porque reordenar es UNA operación aunque toque varias filas: mover un
 * grado de la quinta a la tercera posición renumera a todos los de en medio.
 * Mandándolo como un PATCH por fila, cada uno invalidaba el caché de la
 * estructura por su cuenta y una lectura que cayera entre dos escrituras se
 * quedaba cacheada con la lista a medio renumerar — la pantalla volvía sola al
 * orden viejo, y el siguiente movimiento lo guardaba de verdad.
 *
 * Aquí todo entra en una transacción y se invalida una sola vez, al final.
 */

const TABLAS = {
  servicio: adminEscolarServicios,
  grado:    adminEscolarGrados,
  // Los conceptos no son un nivel del árbol, pero se reordenan igual y por la
  // misma razón: la lista es de la empresa, se renumera entera y no puede
  // quedarse a medias. Reusar esto es preferible a un segundo endpoint que
  // tarde o temprano se olvidaría de la transacción.
  concepto: adminEscolarConceptosPago,
} as const;

type Nivel = keyof typeof TABLAS;

const NIVELES = Object.keys(TABLAS) as Nivel[];

export async function PATCH(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { nivel, items } = await req.json();
  if (!NIVELES.includes(nivel)) {
    return NextResponse.json({ error: 'Nivel inválido' }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Nada que reordenar' }, { status: 400 });
  }

  const filas = items.map((x: { id: unknown; orden: unknown }) => ({
    id: Number(x?.id),
    orden: Number(x?.orden),
  }));
  if (filas.some((f) => !Number.isInteger(f.id) || f.id <= 0 || !Number.isInteger(f.orden) || f.orden < 0)) {
    return NextResponse.json({ error: 'id u orden inválido' }, { status: 400 });
  }

  const tabla = TABLAS[nivel as Nivel];

  // Todas las filas tienen que ser del team que pide. Se comprueba antes de
  // escribir nada: un id ajeno colado en la lista movería la estructura de
  // otro colegio.
  const ids = filas.map((f) => f.id);
  const propias = await db.select({ id: tabla.id }).from(tabla)
    .where(and(eq(tabla.teamId, teamId), inArray(tabla.id, ids)));
  if (propias.length !== ids.length) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const ahora = new Date();
  await db.transaction(async (tx) => {
    for (const f of filas) {
      await tx.update(tabla)
        .set({ orden: f.orden, updatedAt: ahora })
        .where(and(eq(tabla.id, f.id), eq(tabla.teamId, teamId)));
    }
  });

  invalidarEstructura(teamId);
  return NextResponse.json({ ok: true, actualizados: filas.length });
}
