/**
 * El enlace permanente del negocio para registrar compras con la cámara.
 *
 * Un negocio genera UN enlace, sin vencimiento, que puede imprimir como QR y
 * pegar en la oficina. Quien lo abre —un empleado, sin cuenta de Zero— ve una
 * cámara, fotografía la factura del proveedor y la envía. Lo que sale de ahí es
 * un BORRADOR: cae como «captura pendiente» y alguien con sesión la revisa y la
 * registra desde la pantalla de compras. El enlace nunca postea contabilidad.
 *
 * Dos decisiones que sostienen el resto:
 *
 * 1. El enlace es del NEGOCIO (team), no de una factura ni de un usuario. Uno
 *    por equipo: unique (team_id). Así el QR impreso es estable.
 *
 * 2. Sin vencimiento, pero REVOCABLE. No se puede hacer un enlace imposible de
 *    apagar; se hace uno que no caduca pero que el negocio puede regenerar. Si
 *    se filtra, «Regenerar» reemplaza el token en la misma fila y el viejo deja
 *    de resolver al instante.
 */

import 'server-only';
import { randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { comprasCapturaLinks, comprasCapturas, teams } from '@/lib/db/schema';
import { baseDeEnlaces } from '@/lib/config/enlaces';

/** 32 bytes en base64url. Es la única credencial de la página. */
export function generarToken(): string {
  return randomBytes(24).toString('base64url');
}

/** El enlace completo de un token. `base` es el origen real cuando se contesta
 *  a un navegador; sin ella, la del despliegue. */
export function urlDelLink(token: string, base?: string): string {
  return `${(base ?? baseDeEnlaces()).replace(/\/+$/, '')}/compras-captura/${token}`;
}

export interface LinkNegocio {
  token: string;
  estado: string;
}

/** ¿Ya tiene enlace este negocio? Sin crearlo — para poder enseñar el estado
 *  antes de generar. */
export async function buscarLink(teamId: number): Promise<LinkNegocio | null> {
  const [ya] = await db
    .select({ token: comprasCapturaLinks.token, estado: comprasCapturaLinks.estado })
    .from(comprasCapturaLinks)
    .where(eq(comprasCapturaLinks.teamId, teamId))
    .limit(1);
  return ya ?? null;
}

/** El enlace del negocio, creándolo la primera vez. Idempotente por el único
 *  (team_id): dos clics a la vez no crean dos enlaces. */
export async function getOCrearLink(teamId: number): Promise<LinkNegocio> {
  const ya = await buscarLink(teamId);
  if (ya) return ya;

  const [creado] = await db
    .insert(comprasCapturaLinks)
    .values({ teamId, token: generarToken() })
    .onConflictDoNothing({ target: comprasCapturaLinks.teamId })
    .returning({ token: comprasCapturaLinks.token, estado: comprasCapturaLinks.estado });
  if (creado) return creado;

  // Perdió la carrera contra otro clic: el suyo ya está.
  const otro = await buscarLink(teamId);
  if (!otro) throw new Error('No se pudo crear el enlace de captura');
  return otro;
}

/**
 * Regenera el token (y reabre el enlace si estaba revocado). El token anterior
 * deja de resolver de inmediato. Crea el enlace si no existía.
 */
export async function regenerarLink(teamId: number): Promise<LinkNegocio> {
  await getOCrearLink(teamId); // asegura que la fila existe
  const [actualizado] = await db
    .update(comprasCapturaLinks)
    .set({ token: generarToken(), estado: 'abierto', actualizadoEn: new Date() })
    .where(eq(comprasCapturaLinks.teamId, teamId))
    .returning({ token: comprasCapturaLinks.token, estado: comprasCapturaLinks.estado });
  return actualizado;
}

/** Apaga el enlace sin borrarlo: el token deja de resolver, pero regenerar lo
 *  reabre. */
export async function revocarLink(teamId: number): Promise<void> {
  await db
    .update(comprasCapturaLinks)
    .set({ estado: 'revocado', actualizadoEn: new Date() })
    .where(eq(comprasCapturaLinks.teamId, teamId));
}

export interface LinkPublicoResuelto {
  linkId: number;
  teamId: number;
  negocio: { nombre: string; logo: string | null };
}

/**
 * Resuelve un token público. Devuelve null si no existe, si el negocio lo
 * revocó, o si el equipo ya no está — sin distinguir los casos, para no
 * confirmarle a nadie que un token existió.
 */
export async function resolverLinkPublico(token: string): Promise<LinkPublicoResuelto | null> {
  if (!token || token.length < 20) return null;
  const [link] = await db
    .select({
      id:              comprasCapturaLinks.id,
      teamId:          comprasCapturaLinks.teamId,
      estado:          comprasCapturaLinks.estado,
      nombre:          teams.name,
      nombreComercial: teams.nombreComercial,
      logo:            teams.logo,
    })
    .from(comprasCapturaLinks)
    .innerJoin(teams, eq(teams.id, comprasCapturaLinks.teamId))
    .where(and(eq(comprasCapturaLinks.token, token), eq(comprasCapturaLinks.estado, 'abierto')))
    .limit(1);
  if (!link) return null;
  return {
    linkId: link.id,
    teamId: link.teamId,
    negocio: { nombre: link.nombreComercial || link.nombre, logo: link.logo ?? null },
  };
}

/** Deja constancia de que alguien abrió el enlace. */
export async function marcarAcceso(linkId: number): Promise<void> {
  await db
    .update(comprasCapturaLinks)
    .set({ ultimoAcceso: new Date() })
    .where(eq(comprasCapturaLinks.id, linkId));
}

/** Saca una captura de la cola porque se convirtió en compra. */
export async function marcarCapturaRegistrada(teamId: number, capturaId: number, compraId: number): Promise<void> {
  await db
    .update(comprasCapturas)
    .set({ estado: 'registrada', compraId, actualizadoEn: new Date() })
    .where(and(eq(comprasCapturas.id, capturaId), eq(comprasCapturas.teamId, teamId)));
}
