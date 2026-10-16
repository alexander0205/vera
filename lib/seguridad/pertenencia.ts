import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  almacenes, cajaTurnos, categorias, clients, ecfDocuments, listasPrecios, mesas, posTerminales, products, teamMembers, vendedores,
} from '@/lib/db/schema';

/**
 * Toda referencia que llega en el cuerpo de una petición (cliente, almacén,
 * vendedor, lista de precios, productos, terminal, mesa, turno, categoría,
 * responsable) tiene que ser de la empresa de la sesión. Los formularios solo
 * ofrecen cosas de la empresa, pero el cuerpo se puede escribir a mano: sin esta
 * comprobación, un id de OTRA empresa se guardaba en el documento y, al abrirlo,
 * se leían los datos de esa otra empresa (teléfono y correo de un cliente ajeno).
 *
 * Devuelve el mensaje de error, o `null` si todo es de la empresa.
 */
export interface Referencias {
  clientId?: number | null;
  almacenId?: number | null;
  vendedorId?: number | null;
  listaPreciosId?: number | null;
  terminalId?: number | null;
  mesaId?: number | null;
  turnoId?: number | null;
  categoriaId?: number | null;
  ecfDocumentId?: number | null;
  /** Un usuario que debe ser MIEMBRO de la empresa (responsable, mesero…). */
  miembroUserId?: number | null;
  productoIds?: (number | null | undefined)[];
}

export async function validarReferenciasDeEmpresa(teamId: number, refs: Referencias): Promise<string | null> {
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
    unico(refs.terminalId, (id) => db.select({ id: posTerminales.id }).from(posTerminales).where(and(eq(posTerminales.id, id), eq(posTerminales.teamId, teamId))).limit(1), 'La terminal'),
    unico(refs.mesaId, (id) => db.select({ id: mesas.id }).from(mesas).where(and(eq(mesas.id, id), eq(mesas.teamId, teamId))).limit(1), 'La mesa'),
    unico(refs.turnoId, (id) => db.select({ id: cajaTurnos.id }).from(cajaTurnos).where(and(eq(cajaTurnos.id, id), eq(cajaTurnos.teamId, teamId))).limit(1), 'El turno'),
    unico(refs.categoriaId, (id) => db.select({ id: categorias.id }).from(categorias).where(and(eq(categorias.id, id), eq(categorias.teamId, teamId))).limit(1), 'La categoría'),
    unico(refs.ecfDocumentId, (id) => db.select({ id: ecfDocuments.id }).from(ecfDocuments).where(and(eq(ecfDocuments.id, id), eq(ecfDocuments.teamId, teamId))).limit(1), 'El documento'),
    unico(refs.miembroUserId, (id) => db.select({ id: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.userId, id), eq(teamMembers.teamId, teamId))).limit(1), 'El usuario'),
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
