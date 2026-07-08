import { db } from '@/lib/db/drizzle';
import { maestros, maestroValores, maestroTargets } from '@/lib/db/schema';
import { eq, and, inArray, asc } from 'drizzle-orm';

export interface FacturaMaestro {
  id: number;
  nombre: string;
  descripcion: string | null;
  multiple: boolean;
  valores: { id: number; maestroId: number; valor: string; orden: number; createdAt: Date }[];
}

/** Maestros del equipo con target='factura', con sus valores ordenados. */
export async function loadFacturaMaestros(teamId: number): Promise<FacturaMaestro[]> {
  const ms = await db.select({
    id: maestros.id, nombre: maestros.nombre, descripcion: maestros.descripcion,
    multiple: maestros.multiple,
  }).from(maestros)
    .innerJoin(maestroTargets, and(
      eq(maestroTargets.maestroId, maestros.id),
      eq(maestroTargets.entidad, 'factura'),
    ))
    .where(eq(maestros.teamId, teamId)).orderBy(asc(maestros.nombre));

  const ids = ms.map(m => m.id);
  const valores = ids.length
    ? await db.select().from(maestroValores)
        .where(inArray(maestroValores.maestroId, ids))
        .orderBy(asc(maestroValores.orden), asc(maestroValores.id))
    : [];

  return ms.map(m => ({ ...m, valores: valores.filter(v => v.maestroId === m.id) }));
}
