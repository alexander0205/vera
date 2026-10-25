/**
 * El cliente de una factura de venta: nunca queda en NULL.
 *
 * El 23-10-2026 había 1,049 facturas de venta sin cliente en producción —
 * 623 de ellas e-CF ya aceptados por la DGII—. Dos causas:
 *
 *  - Quien facturaba escribía (o buscaba en el padrón de la DGII) la cédula del
 *    padre y no elegía su ficha guardada: la factura salía con el nombre y la
 *    cédula escritos, pero sin el enlace al cliente.
 *  - El modo «emitir» de la ruta guardaba la factura sin `client_id` aunque se
 *    hubiera elegido la ficha.
 *
 * Una factura sin cliente no sale en la cartera de nadie: en Gobernanza, una
 * familia con un pago parcial no veía lo que debía. Así que la regla es: si se
 * eligió la ficha, esa; si no, la que tenga la misma cédula/RNC (y si no hay,
 * se crea con el nombre y la cédula de la factura); sin cédula, la única ficha
 * con exactamente ese nombre; y si no, el cliente «CONSUMIDOR FINAL» del
 * negocio, que se crea una vez.
 *
 * Las facturas de alumnos (con cargos o alumnos en sus líneas) NO pasan por
 * aquí: su dueño es el responsable de pago, y lo pone `vincular-por-clave`.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { clients } from '@/lib/db/schema';

export const NOMBRE_CONSUMIDOR_FINAL = 'CONSUMIDOR FINAL';

/** Solo los dígitos: «001-1506746-4» y «00115067464» son la misma cédula. */
export const soloDigitos = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');

export const esConsumidorFinal = (nombre: string | null | undefined): boolean =>
  /^consumidor\s+final$/i.test((nombre ?? '').trim());

/** Cédula (11) o RNC (9): lo que identifica a alguien sin dudas. */
export const esDocumento = (doc: string): boolean => doc.length === 9 || doc.length === 11;

// El ejecutor puede ser `db` o una transacción; solo se usan select e insert.
type Ejecutor = {
  select: (...a: never[]) => unknown;
  insert: (...a: never[]) => unknown;
};

/**
 * El id del cliente que se guarda en una factura que llegó sin uno elegido.
 * Busca antes de crear, y crea lo mínimo: nombre y cédula, que es lo que la
 * factura ya traía escrito.
 */
export async function clienteDeLaFactura(
  ejecutor: Ejecutor,
  args: { teamId: number; rnc?: string | null; razonSocial?: string | null; userId?: number | null },
): Promise<number> {
  const x = ejecutor as unknown as typeof import('@/lib/db/drizzle').db;
  const doc = soloDigitos(args.rnc);
  const nombre = (args.razonSocial ?? '').trim();

  if (esDocumento(doc)) {
    const [existe] = await x.select({ id: clients.id }).from(clients)
      .where(and(
        eq(clients.teamId, args.teamId),
        sql`regexp_replace(coalesce(${clients.rnc}, ''), '\\D', '', 'g') = ${doc}`,
      ))
      .orderBy(asc(clients.id)).limit(1);
    if (existe) return existe.id;
    const [nuevo] = await x.insert(clients).values({
      teamId: args.teamId,
      rnc: doc,
      razonSocial: (nombre && !esConsumidorFinal(nombre) ? nombre : `Cliente ${doc}`).slice(0, 255),
      createdBy: args.userId ?? null,
      descripcion: 'Creado al facturar: la factura traía esta cédula o RNC y no había ficha con ella.',
    }).returning({ id: clients.id });
    return nuevo.id;
  }

  if (nombre && !esConsumidorFinal(nombre)) {
    // Solo si hay UNA ficha con ese nombre exacto: con dos, no se adivina.
    const iguales = await x.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.teamId, args.teamId), sql`lower(trim(${clients.razonSocial})) = lower(${nombre})`))
      .limit(2);
    if (iguales.length === 1) return iguales[0].id;
  }

  const [cf] = await x.select({ id: clients.id }).from(clients)
    .where(and(
      eq(clients.teamId, args.teamId),
      isNull(clients.rnc),
      sql`upper(trim(${clients.razonSocial})) = ${NOMBRE_CONSUMIDOR_FINAL}`,
    ))
    .orderBy(asc(clients.id)).limit(1);
  if (cf) return cf.id;
  const [nuevo] = await x.insert(clients).values({
    teamId: args.teamId,
    razonSocial: NOMBRE_CONSUMIDOR_FINAL,
    createdBy: args.userId ?? null,
    descripcion: 'Las ventas sin cédula ni ficha del cliente. Lo crea el sistema la primera vez que hace falta.',
  }).returning({ id: clients.id });
  return nuevo.id;
}
