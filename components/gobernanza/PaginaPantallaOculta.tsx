import 'server-only';
import { AvisoPantallaOculta } from '@/components/gobernanza/Gobernanza';
import { pantallasOcultasDe } from '@/lib/auth/pantallas';
import { PANTALLAS, primeraVisible } from '@/lib/config/pantallas';
import { getTeamIdForUser, getTeamRoleForUser, getUser } from '@/lib/db/queries';

/**
 * Lo que el proxy sirve EN LUGAR de una pantalla oculta (ver
 * lib/auth/pantallas-proxy.ts): la pantalla pedida no llega a ejecutarse, así
 * que sus datos no salen del servidor. La barra sigue diciendo la ruta pedida.
 *
 * Hay una de estas por módulo (`<módulo>/pantalla-oculta`) para que el aviso
 * salga dentro del menú de su módulo y no en una página suelta.
 */
export async function PaginaPantallaOculta({ searchParams }: {
  searchParams: Promise<{ pantalla?: string | string[] }>;
}) {
  const { pantalla: id } = await searchParams;
  const pantalla = PANTALLAS.find(p => p.id === id) ?? null;
  const [user, teamId, rol] = await Promise.all([getUser(), getTeamIdForUser(), getTeamRoleForUser()]);
  const ocultas = teamId ? await pantallasOcultasDe(teamId, user?.platformRole, rol) : [];
  const alternativa = pantalla ? primeraVisible(pantalla.modulo, ocultas) : null;
  return (
    <AvisoPantallaOculta
      pantalla={pantalla ?? { label: 'Esta pantalla' }}
      alternativa={alternativa ? { label: alternativa.label, href: alternativa.href } : null}
    />
  );
}
