/**
 * Si la familia abrió el enlace de pago de un aviso.
 *
 * Lo avisa la propia página desde el navegador: los que previsualizan enlaces
 * (WhatsApp, los filtros de correo) la descargan pero no ejecutan JavaScript, y
 * contarlos sería decir que el padre abrió algo que nunca vio.
 */
import 'server-only';
import { and, desc, eq, gte, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarAvisosEnviados as av, adminEscolarLinksPago } from '@/lib/db/schema';

/** Hasta dónde se busca el aviso de un enlace que no dice de cuál viene. */
const DIAS_SIN_AVISO = 30;

/**
 * Anota la apertura en el aviso `avisoId` o, si el enlace no lo dice (salió por
 * SMS o antes de este cambio), en el último aviso con enlace de esa familia. Un
 * aviso de otra familia no se toca: el token es la única credencial.
 */
export async function registrarApertura(token: string, avisoId: number | null): Promise<boolean> {
  const [link] = await db
    .select({ teamId: adminEscolarLinksPago.teamId, clientId: adminEscolarLinksPago.clientId })
    .from(adminEscolarLinksPago)
    .where(and(eq(adminEscolarLinksPago.token, token), eq(adminEscolarLinksPago.estado, 'abierto')))
    .limit(1);
  if (!link) return false;

  const deLaFamilia = sql`${av.cargoId} IN (
    SELECT c.id FROM admin_escolar_cargos c
    JOIN admin_escolar_estudiantes e ON e.id = c.estudiante_id
    WHERE c.team_id = ${link.teamId} AND e.facturar_a_client_id = ${link.clientId})`;
  const cual = avisoId != null
    ? eq(av.id, avisoId)
    : and(
      gte(av.enviadoAt, new Date(Date.now() - DIAS_SIN_AVISO * 86_400_000)),
      or(eq(av.conEnlace, true), and(isNull(av.conEnlace), ne(av.canal, 'sms'))),
    );
  const [aviso] = await db
    .select({ id: av.id, grupo: av.grupo })
    .from(av)
    .where(and(eq(av.teamId, link.teamId), deLaFamilia, cual))
    .orderBy(desc(av.enviadoAt), desc(av.id))
    .limit(1);
  if (!aviso) return false;

  // Varios cobros que viajaron juntos son un solo mensaje: se abrió para todos.
  await db.update(av)
    .set({ abiertoAt: sql`coalesce(${av.abiertoAt}, now())`, aperturas: sql`${av.aperturas} + 1` })
    .where(aviso.grupo ? and(eq(av.teamId, link.teamId), eq(av.grupo, aviso.grupo)) : eq(av.id, aviso.id));
  return true;
}
