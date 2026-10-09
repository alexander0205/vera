import { ContabilidadNavRail } from '@/components/contabilidad-nav-rail';
import { ModuleShell } from '@/components/module-shell';
import { requireModule, requirePermission } from '@/lib/auth/page-guard';
import { getUser } from '@/lib/db/queries';
import { exigirOnboarding } from '@/lib/onboarding/muro';

export const metadata = { title: 'Zero Contabilidad' };

/**
 * Módulo Contabilidad — su propio espacio, como Nómina. Cada página lleva
 * además su `requirePermission`: un redirect en el layout no impide que la
 * página renderice y mande sus datos.
 */
export default async function ContabilidadLayout({ children }: { children: React.ReactNode }) {
  await exigirOnboarding();
  await requireModule('contabilidad', '/dashboard');
  await requirePermission('contabilidad:ver');
  const user = await getUser();

  return (
    <ModuleShell
      current="contabilidad"
      user={user ?? null}
      rail={<ContabilidadNavRail />}
      railMovil={<ContabilidadNavRail variant="drawer" />}
    >
      {children}
    </ModuleShell>
  );
}
