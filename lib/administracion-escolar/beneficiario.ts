/**
 * lib/administracion-escolar/beneficiario.ts — el alumno como beneficiario
 * (dependiente de Contactos) de quien le paga.
 *
 * La factura dice de quién es cada línea por el beneficiario, y el buscador de
 * productos de «Nueva factura» solo ofrece las mensualidades del beneficiario
 * de la línea. Un alumno con responsable de pago pero sin beneficiario bajo
 * ese contacto no deja facturar sus cargos: el buscador solo enseña el
 * catálogo. Pasó en CEMM (octubre 2026) con los responsables asignados desde
 * «a quién se le factura», que cambiaba el contacto sin tocar el beneficiario.
 */
import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { db as Db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, dependientes } from '@/lib/db/schema';

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/**
 * Deja al alumno como beneficiario de `clientId` y devuelve el id del
 * beneficiario. Usa, en este orden: el suyo si ya es de ese contacto, uno con
 * su mismo nombre bajo ese contacto (el padre que ya lo tenía en Contactos), o
 * uno nuevo. Nunca mueve ni borra el beneficiario de otro contacto: ese guarda
 * las facturas viejas de quien pagaba antes.
 */
export async function asegurarBeneficiario(
  tx: Tx, teamId: number, estudianteId: number, clientId: number,
): Promise<number | null> {
  const [e] = await tx.select({
    nombres: adminEscolarEstudiantes.nombres, apellidos: adminEscolarEstudiantes.apellidos,
    dependienteId: adminEscolarEstudiantes.dependienteId, depClientId: dependientes.clientId,
  })
    .from(adminEscolarEstudiantes)
    .leftJoin(dependientes, eq(dependientes.id, adminEscolarEstudiantes.dependienteId))
    .where(and(eq(adminEscolarEstudiantes.id, estudianteId), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  if (!e) return null;
  if (e.dependienteId && e.depClientId === clientId) return e.dependienteId;

  const nombre = e.nombres.trim();
  const apellido = (e.apellidos ?? '').trim();
  const [existente] = await tx.select({ id: dependientes.id }).from(dependientes)
    .where(and(
      eq(dependientes.teamId, teamId), eq(dependientes.clientId, clientId),
      eq(dependientes.nombre, nombre), eq(dependientes.apellido, apellido),
    ))
    .limit(1);
  const id = existente?.id ?? (await tx.insert(dependientes)
    .values({ teamId, clientId, nombre, apellido })
    .returning({ id: dependientes.id }))[0].id;

  await tx.update(adminEscolarEstudiantes)
    .set({ dependienteId: id, updatedAt: new Date() })
    .where(eq(adminEscolarEstudiantes.id, estudianteId));
  return id;
}
