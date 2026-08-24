/**
 * El almacén por defecto de un team, creándolo si no existe.
 *
 * El stock —de un bien simple o de una variante— vive por almacén
 * (product_almacen_stock / product_variant_almacen_stock), que es lo que miran
 * el POS y el inventario. Una empresa puede controlar inventario sin haber
 * creado nunca un almacén: entra por Facturación, marca «controla inventario» y
 * pone una cifra. Sin un almacén donde aterrizar, esa cifra no tenía dónde
 * guardarse y la reconciliación de variantes la ponía en cero —subir el stock
 * lo borraba. Aquí se garantiza el destino, igual que hace el POS al entrar
 * (ensurePosDefaults), pero sin crear terminal: esto es solo inventario.
 *
 * Idempotente: devuelve el default existente (o el primero) y solo crea cuando
 * no hay ninguno. Corre DENTRO de la transacción de quien la llama, así el
 * almacén y el movimiento de stock se confirman juntos.
 */

import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { almacenes } from '@/lib/db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function ensureAlmacenDefaultId(tx: Tx, teamId: number): Promise<number> {
  const [existente] = await tx
    .select({ id: almacenes.id })
    .from(almacenes)
    .where(eq(almacenes.teamId, teamId))
    .orderBy(desc(almacenes.esDefault), asc(almacenes.id))
    .limit(1);
  if (existente) return existente.id;

  const [nuevo] = await tx
    .insert(almacenes)
    .values({ teamId, nombre: 'Almacén principal', esDefault: 'true' })
    .returning({ id: almacenes.id });
  return nuevo.id;
}
