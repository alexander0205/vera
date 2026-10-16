import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { almacenes, clients, listasPrecios, products, vendedores } from '@/lib/db/schema';

/**
 * Toda referencia que llega en el cuerpo de una petición (cliente, almacén,
 * vendedor, lista de precios, productos) tiene que ser de la empresa de la
 * sesión. Los formularios solo ofrecen cosas de la empresa, pero el cuerpo se
 * puede escribir a mano: sin esta comprobación, un id de OTRA empresa se
 * guardaba en el documento y, al abrirlo, se leían los datos de esa otra
 * empresa (teléfono y correo de un cliente ajeno).
 *
 * Devuelve el mensaje de error, o `null` si todo es de la empresa.
 */
export async function validarReferenciasDeEmpresa(
  teamId: number,
  refs: {
    clientId?: number | null;
    almacenId?: number | null;
    vendedorId?: number | null;
    listaPreciosId?: number | null;
    productoIds?: (number | null | undefined)[];
  },
): Promise<string | null> {
  const unico = async (
    id: number | null | undefined,
    existe: (id: number) => Promise<unknown[]>,
    nombre: string,
  ) => {
    if (id == null) return null;
    const filas = await existe(id);
    return filas.length ? null : `No se encontró ${nombre.toLowerCase()} en tu empresa.`;
  };

  const errores = await Promise.all([
    unico(refs.clientId, (id) => db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, id), eq(clients.teamId, teamId))).limit(1), 'El cliente'),
    unico(refs.almacenId, (id) => db.select({ id: almacenes.id }).from(almacenes).where(and(eq(almacenes.id, id), eq(almacenes.teamId, teamId))).limit(1), 'El almacén'),
    unico(refs.vendedorId, (id) => db.select({ id: vendedores.id }).from(vendedores).where(and(eq(vendedores.id, id), eq(vendedores.teamId, teamId))).limit(1), 'El vendedor'),
    unico(refs.listaPreciosId, (id) => db.select({ id: listasPrecios.id }).from(listasPrecios).where(and(eq(listasPrecios.id, id), eq(listasPrecios.teamId, teamId))).limit(1), 'La lista de precios'),
  ]);
  const primero = errores.find(Boolean);
  if (primero) return primero;

  const productos = [...new Set((refs.productoIds ?? []).filter((x): x is number => typeof x === 'number' && x > 0))];
  if (productos.length) {
    const propios = await db.select({ id: products.id }).from(products)
      .where(and(inArray(products.id, productos), eq(products.teamId, teamId)));
    if (propios.length !== productos.length) return 'Uno de los productos no se encontró.';
  }
  return null;
}
