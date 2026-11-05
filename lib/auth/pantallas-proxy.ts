/**
 * ¿La pantalla que se pide está oculta para quien la pide? — para `proxy.ts`.
 *
 * Ocultar una pantalla tiene que impedir abrirla, no solo sacarla del menú: el
 * aviso del cliente (`GuardPantalla`) llega tarde, cuando el servidor ya armó la
 * página con sus datos. El proxy corre antes que la página en cada carga Y en
 * cada navegación interna (las peticiones RSC también pasan por él), así que
 * aquí se corta sin tocar ninguna página.
 *
 * Corre en CADA petición de página, así que tiene que ser barato:
 *  - Solo mira la base si la ruta es de una pantalla del catálogo
 *    (`pantallaDeRuta`, en memoria). El resto pasa sin consultar nada.
 *  - Lo leído se guarda en memoria de la instancia `TTL_MS`: quien navega por
 *    el sistema no paga una consulta por clic. Un cambio en el panel se aplica
 *    en, como mucho, ese tiempo (el panel lo dice).
 *  - Si la lectura falla, no se bloquea: lo mismo que `pantallasOcultasDe`.
 *
 * La memoria es de esta instancia y del proxy: la ruta que cambia las pantallas
 * vive en otro paquete y no puede vaciarla, por eso caduca sola.
 */

import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers, teamRolePantallasOcultas, teamRoles, users } from '@/lib/db/schema';
import { normalizeRoleKey } from '@/lib/config/roles';
import { esPantalla, pantallaDeRuta, type PantallaDef } from '@/lib/config/pantallas';

const TTL_MS = 15_000;

interface Miembro { platformRole: string | null; equipos: { teamId: number; role: string; desde: number }[] }

const miembros = new Map<number, { hasta: number; valor: Miembro }>();
const ocultasPorEquipo = new Map<number, { hasta: number; valor: { key: string; pantalla: string }[] }>();

async function miembro(userId: number): Promise<Miembro> {
  const guardado = miembros.get(userId);
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;
  const filas = await db
    .select({ platformRole: users.platformRole, teamId: teamMembers.teamId, role: teamMembers.role, joinedAt: teamMembers.joinedAt })
    .from(users)
    .leftJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(eq(users.id, userId));
  const valor: Miembro = {
    platformRole: filas[0]?.platformRole ?? null,
    equipos: filas.flatMap(f => (f.teamId != null && f.role
      ? [{ teamId: f.teamId, role: f.role, desde: f.joinedAt ? new Date(f.joinedAt).getTime() : 0 }]
      : [])),
  };
  miembros.set(userId, { hasta: Date.now() + TTL_MS, valor });
  return valor;
}

async function ocultasDelEquipo(teamId: number) {
  const guardado = ocultasPorEquipo.get(teamId);
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;
  const valor = await db
    .select({ key: teamRoles.key, pantalla: teamRolePantallasOcultas.pantalla })
    .from(teamRolePantallasOcultas)
    .innerJoin(teamRoles, eq(teamRoles.id, teamRolePantallasOcultas.teamRoleId))
    .where(eq(teamRoles.teamId, teamId));
  ocultasPorEquipo.set(teamId, { hasta: Date.now() + TTL_MS, valor });
  return valor;
}

/**
 * La pantalla oculta que se está pidiendo, o `null` si se puede abrir.
 *
 * La empresa se resuelve como `getTeamIdForUser`: la activa de la sesión si es
 * miembro, si no la primera a la que entró. El admin de plataforma y el
 * Propietario nunca tienen pantallas ocultas.
 */
export async function pantallaOcultaPara(
  userId: number,
  activeTeamId: number | null | undefined,
  ruta: string,
): Promise<PantallaDef | null> {
  const pantalla = pantallaDeRuta(ruta);
  if (!pantalla) return null;
  try {
    const m = await miembro(userId);
    if (m.platformRole === 'admin') return null;
    const equipo = m.equipos.find(e => e.teamId === activeTeamId)
      ?? [...m.equipos].sort((a, b) => a.desde - b.desde)[0];
    const key = normalizeRoleKey(equipo?.role);
    if (!equipo || !key || key === 'owner') return null;
    const filas = await ocultasDelEquipo(equipo.teamId);
    const oculta = filas.some(f => f.pantalla === pantalla.id && normalizeRoleKey(f.key) === key && esPantalla(f.pantalla));
    return oculta ? pantalla : null;
  } catch (err) {
    console.error('[pantallas/proxy] no se pudo comprobar; se deja pasar', err instanceof Error ? err.message : err);
    return null;
  }
}
