/**
 * POS — Auto-provisioning de prerequisitos.
 *
 * El POS necesita la cadena almacén → terminal → turno. Antes, una empresa
 * nueva veía "No hay terminales configuradas / pide a un administrador" y no
 * podía vender. Ahora, al entrar al POS se garantizan los defaults:
 *
 *   1. Sin almacén        → crea "Almacén principal" (esDefault=true)
 *   2. Sin terminal activa → crea "Caja principal" (almacén default, sin-ncf)
 *
 * Idempotente y seguro ante concurrencia: corre dentro de una transacción con
 * advisory lock por team, así dos requests simultáneos no duplican defaults.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { almacenes, posTerminales } from '@/lib/db/schema';

// Namespace arbitrario para el advisory lock de provisioning POS (2 llaves:
// clase, teamId). Debe ser distinto de otros locks de la app.
const LOCK_CLASS = 74_201;

export async function ensurePosDefaults(teamId: number): Promise<void> {
  // Fast path sin lock: si ya hay terminal activa, no hay nada que hacer.
  const [terminal] = await db
    .select({ id: posTerminales.id })
    .from(posTerminales)
    .where(and(eq(posTerminales.teamId, teamId), eq(posTerminales.activo, true)))
    .limit(1);
  if (terminal) return;

  await db.transaction(async (tx) => {
    // Serializa el provisioning por team (se libera al terminar la tx).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_CLASS}, ${teamId})`);

    // Re-chequear dentro del lock (otro request pudo ganarnos).
    const [t] = await tx
      .select({ id: posTerminales.id })
      .from(posTerminales)
      .where(and(eq(posTerminales.teamId, teamId), eq(posTerminales.activo, true)))
      .limit(1);
    if (t) return;

    // 1. Almacén: usar el default, o el primero, o crear uno.
    let almacenId: number;
    const alms = await tx
      .select({ id: almacenes.id, esDefault: almacenes.esDefault })
      .from(almacenes)
      .where(eq(almacenes.teamId, teamId))
      .orderBy(asc(almacenes.id));
    if (alms.length > 0) {
      // esDefault es varchar 'true'/'false' en el schema.
      almacenId = (alms.find(a => a.esDefault === 'true') ?? alms[0]).id;
    } else {
      const [nuevo] = await tx
        .insert(almacenes)
        .values({ teamId, nombre: 'Almacén principal', esDefault: 'true' })
        .returning({ id: almacenes.id });
      almacenId = nuevo.id;
    }

    // 2. Terminal default: venta sin NCF (ticket) hasta que configuren DGII.
    await tx.insert(posTerminales).values({
      teamId,
      nombre: 'Caja principal',
      almacenId,
      tipoEcf: 'sin-ncf',
      activo: true,
      mesas: false,
    });
  });
}
