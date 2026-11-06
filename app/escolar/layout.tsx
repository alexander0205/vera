import { EscolarNavRail } from '@/components/escolar-nav-rail';
import { ModuleShell } from '@/components/module-shell';
import { GuardPantalla } from '@/components/gobernanza/Gobernanza';
import { requireModule, requirePermission } from '@/lib/auth/page-guard';
import { pantallasOcultasDe } from '@/lib/auth/pantallas';
import { getTeamIdForUser, getTeamRoleForUser, getUser } from '@/lib/db/queries';
import { exigirOnboarding } from '@/lib/onboarding/muro';
import { estadoPlantaDe } from '@/lib/escolar/planta-estado';
import { inventarioAulaVisible } from '@/lib/escolar/inventario-aula';

export const metadata = { title: 'Zero Administración Escolar' };

/**
 * Módulo Administración Escolar — su propio espacio, como Facturación y Punto
 * de Venta. Doble gate de servidor sobre TODO lo que cuelga de /escolar:
 *
 *   1. requireModule    → la empresa tiene el módulo activo (es opt-in, no
 *      todo el mundo lo lleva) y el rol tiene 'modulo:escolar'.
 *   2. requirePermission → ya dentro del módulo, el rol puede al menos mirar.
 *
 * Sub-rutas más estrictas (p. ej. configuracion) agregan su propio
 * requirePermission encima de este.
 *
 * «Inventario por aula» solo sale cuando el colegio ya configuró su Planta física y
 * tiene activos con aula (`estadoPlantaDe`, que falla cerrado: sin migración o con un
 * error de lectura no se enseña nada). Mientras tanto se trata como una pantalla oculta.
 *
 * Encima, las pantallas que el dueño le apagó al rol (lib/config/pantallas.ts):
 * salen del menú y `GuardPantalla` las cambia por «Sin acceso». El layout no
 * se vuelve a pintar al cambiar de pantalla, por eso el bloqueo mira la ruta
 * en el cliente; la lista sí sale de aquí, y se refresca al cambiarla.
 */
export default async function EscolarLayout({ children }: { children: React.ReactNode }) {
  await exigirOnboarding();
  await requireModule('escolar', '/dashboard');
  await requirePermission('administracion-escolar:ver');
  const [user, teamId, teamRole] = await Promise.all([
    getUser(), getTeamIdForUser(), getTeamRoleForUser(),
  ]);
  const [ocultasDelRol, planta] = await Promise.all([
    teamId ? pantallasOcultasDe(teamId, user?.platformRole, teamRole) : Promise.resolve([] as string[]),
    teamId ? estadoPlantaDe(teamId) : Promise.resolve(null),
  ]);
  const ocultas = inventarioAulaVisible(planta) ? ocultasDelRol : [...ocultasDelRol, 'escolar-inventario-aula'];

  return (
    <ModuleShell
      current="escolar"
      user={user ?? null}
      rail={<EscolarNavRail ocultas={ocultas} />}
      railMovil={<EscolarNavRail variant="drawer" ocultas={ocultas} />}
    >
      {/* `inicio`: en colegio.zero.com.do la barra dice «/» estando en /escolar. */}
      <GuardPantalla ocultas={ocultas} inicio="/escolar">{children}</GuardPantalla>
    </ModuleShell>
  );
}
