/**
 * Avisar al colegio de que cayó un pago: la fila de la campana y el push.
 *
 * Lo llaman los dos sitios donde una familia manda dinero sin estar dentro del
 * sistema:
 *
 *  · `POST /api/pagar/[token]/comprobante` — sube el comprobante de una
 *    transferencia (`notificarComprobante`).
 *  · `marcarLinkPagado` en lib/pagos/links.ts — la pasarela (CardNet, Azul)
 *    confirmó un pago con tarjeta (`notificarPagoEnLinea`).
 *
 * Reglas que sostienen esto:
 *
 *  1. NUNCA estorba al padre. Todo corre dentro de `despuesDeResponder`
 *     (`after()` de Next): la respuesta ya salió, y un fallo aquí se registra y
 *     se traga. El pago ya está guardado; que el aviso no salga es un problema
 *     del colegio, no de quien pagó.
 *  2. NUNCA lanza. Cada función pública tiene su try/catch.
 *  3. No repite. El índice único (team, tipo, ref) de `notificaciones` hace que
 *     un callback duplicado inserte cero filas, y sin fila nueva no hay push.
 */

import 'server-only';
import { after } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  notificaciones, teams, teamMembers, paymentLinks, ecfDocuments, cotizaciones, clients,
  adminEscolarCargos,
} from '@/lib/db/schema';
import { getEffectivePermissions } from '@/lib/auth/permissions';
import { PERMISOS_POR_TIPO } from './tipos';
import {
  notificacionDeComprobante, notificacionDePagoEnLinea, payloadPush,
  type DatosComprobante, type NotificacionNueva,
} from './texto';
import { empujarA } from './push';

/**
 * Corre `tarea` cuando la respuesta ya salió. Fuera de una petición —un script,
 * un cron— `after()` lanza; en ese caso se ejecuta de inmediato, sin esperar.
 */
export function despuesDeResponder(tarea: () => Promise<unknown>): void {
  const correr = () => tarea().catch((e) =>
    console.error('[notificaciones] falló en segundo plano:', e instanceof Error ? e.message : e));
  try {
    after(correr);
  } catch {
    void correr();
  }
}

/**
 * Quiénes de la empresa se enteran: los miembros cuyo rol tiene alguno de los
 * permisos de ese tipo.
 *
 * Los permisos se miran por ROL, sin el atajo de «administrador de plataforma»:
 * el equipo de Zero que entra a una empresa a dar soporte no debe recibir en el
 * celular cada pago de cada colegio. Si es miembro con un rol que lo incluye,
 * sí; si solo entra por ser de plataforma, no.
 */
export async function destinatariosDe(teamId: number, tipo: NotificacionNueva['tipo']): Promise<number[]> {
  const miembros = await db.select({ userId: teamMembers.userId, role: teamMembers.role })
    .from(teamMembers).where(eq(teamMembers.teamId, teamId));
  if (miembros.length === 0) return [];

  const requeridos = PERMISOS_POR_TIPO[tipo];
  const porRol = new Map<string, boolean>();
  for (const rol of new Set(miembros.map((m) => m.role))) {
    const permisos = await getEffectivePermissions(teamId, rol);
    porRol.set(rol, requeridos.some((p) => permisos.includes(p)));
  }
  return [...new Set(miembros.filter((m) => porRol.get(m.role)).map((m) => m.userId))];
}

/**
 * Guarda la notificación y empuja el aviso. Devuelve `false` si ya existía o si
 * falló; nunca lanza.
 */
export async function notificarPago(teamId: number, n: NotificacionNueva): Promise<boolean> {
  try {
    const [fila] = await db.insert(notificaciones).values({
      teamId,
      tipo: n.tipo,
      titulo: n.titulo.slice(0, 160),
      detalle: n.detalle,
      enlace: n.enlace.slice(0, 300),
      refId: n.refId,
      montoCentavos: n.montoCentavos,
    }).onConflictDoNothing().returning({ id: notificaciones.id });

    // Ya estaba: un reintento del callback. Avisar otra vez sería ruido.
    if (!fila) return false;

    const quienes = await destinatariosDe(teamId, n.tipo);
    if (quienes.length > 0) {
      const [t] = await db.select({ nombre: teams.name }).from(teams).where(eq(teams.id, teamId)).limit(1);
      await empujarA(quienes, payloadPush(n, t?.nombre ?? null));
    }
    return true;
  } catch (e) {
    console.error('[notificaciones] no se pudo notificar el pago:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Una familia subió un comprobante de transferencia. */
export async function notificarComprobante(teamId: number, datos: DatosComprobante): Promise<boolean> {
  try {
    return await notificarPago(teamId, notificacionDeComprobante(datos));
  } catch (e) {
    console.error('[notificaciones] comprobante:', e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * La pasarela confirmó un pago con tarjeta. Lee el enlace, la factura y el
 * cliente para que el aviso diga de quién es; llamar DESPUÉS de marcarlo pagado.
 */
export async function notificarPagoEnLinea(linkId: number): Promise<boolean> {
  try {
    const [l] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, linkId)).limit(1);
    if (!l || l.estado !== 'pagado') return false;

    let cliente: string | null = null;
    let documento: string | null = null;
    let escolar = false;

    if (l.ecfDocumentId) {
      const [d] = await db.select({
        codigo: ecfDocuments.codigo, encf: ecfDocuments.encf,
        comprador: ecfDocuments.razonSocialComprador, clientId: ecfDocuments.clientId,
      }).from(ecfDocuments)
        .where(and(eq(ecfDocuments.id, l.ecfDocumentId), eq(ecfDocuments.teamId, l.teamId)))
        .limit(1);
      documento = d?.codigo ?? d?.encf ?? null;
      cliente = d?.comprador ?? null;
      if (!cliente && d?.clientId) {
        const [c] = await db.select({ nombre: clients.razonSocial }).from(clients)
          .where(eq(clients.id, d.clientId)).limit(1);
        cliente = c?.nombre ?? null;
      }
      const [cargo] = await db.select({ id: adminEscolarCargos.id }).from(adminEscolarCargos)
        .where(and(eq(adminEscolarCargos.teamId, l.teamId), eq(adminEscolarCargos.ecfDocumentId, l.ecfDocumentId)))
        .limit(1);
      escolar = !!cargo;
    } else if (l.cotizacionId) {
      const [q] = await db.select({ numero: cotizaciones.numero, clientId: cotizaciones.clientId })
        .from(cotizaciones)
        .where(and(eq(cotizaciones.id, l.cotizacionId), eq(cotizaciones.teamId, l.teamId)))
        .limit(1);
      documento = q?.numero ? `Cotización ${q.numero}` : null;
      if (q?.clientId) {
        const [c] = await db.select({ nombre: clients.razonSocial }).from(clients)
          .where(eq(clients.id, q.clientId)).limit(1);
        cliente = c?.nombre ?? null;
      }
    }

    return await notificarPago(l.teamId, notificacionDePagoEnLinea({
      linkId: l.id,
      montoCentavos: l.montoCentavos,
      cliente,
      documento,
      ecfDocumentId: l.ecfDocumentId,
      cotizacionId: l.cotizacionId,
      referencia: l.providerRef,
      proveedor: l.provider,
      escolar,
    }));
  } catch (e) {
    console.error('[notificaciones] pago en línea:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Atajo para los puntos de enganche: programa el aviso del pago en línea sin esperar. */
export function avisarPagoEnLinea(linkId: number): void {
  despuesDeResponder(() => notificarPagoEnLinea(linkId));
}

/** Atajo para la ruta del comprobante. */
export function avisarComprobante(teamId: number, datos: DatosComprobante): void {
  despuesDeResponder(() => notificarComprobante(teamId, datos));
}
