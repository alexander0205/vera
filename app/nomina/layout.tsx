import { NominaNavRail } from '@/components/nomina-nav-rail';
import { ModuleShell } from '@/components/module-shell';
import { requireModule, requirePermission } from '@/lib/auth/page-guard';
import { getUser } from '@/lib/db/queries';
import { exigirOnboarding } from '@/lib/onboarding/muro';

export const metadata = { title: 'Zero Nómina' };

/**
 * Módulo Nómina — su propio espacio, como Facturación, POS y Escolar. Doble
 * gate de servidor sobre todo lo que cuelga de /nomina:
 *
 *   1. requireModule    → la empresa tiene el módulo activo (es opt-in).
 *   2. requirePermission → el rol puede al menos ver empleados.
 *
 * Sub-rutas más estrictas (corridas, pagos, configuración) agregan su propio
 * requirePermission encima de este.
 */
export default async function NominaLayout({ children }: { children: React.ReactNode }) {
  await exigirOnboarding();
  await requireModule('nomina', '/dashboard');
  await requirePermission('empleados:ver');
  const user = await getUser();

  return (
    <ModuleShell
      current="nomina"
      user={user ?? null}
      rail={<NominaNavRail />}
      railMovil={<NominaNavRail variant="drawer" />}
    >
      {children}
    </ModuleShell>
  );
}
