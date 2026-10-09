import { EscolarNavRail } from '@/components/escolar-nav-rail';
import { ModuleShell } from '@/components/module-shell';
import { requireModule, requirePermission } from '@/lib/auth/page-guard';
import { getUser } from '@/lib/db/queries';
import { exigirOnboarding } from '@/lib/onboarding/muro';

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
 */
export default async function EscolarLayout({ children }: { children: React.ReactNode }) {
  await exigirOnboarding();
  await requireModule('escolar', '/dashboard');
  await requirePermission('administracion-escolar:ver');
  const user = await getUser();

  return (
    <ModuleShell
      current="escolar"
      user={user ?? null}
      rail={<EscolarNavRail />}
      railMovil={<EscolarNavRail variant="drawer" />}
    >
      {children}
    </ModuleShell>
  );
}
