import { CuentaNavRail } from '@/components/cuenta-nav-rail';
import { ModuleShell } from '@/components/module-shell';
import { getUser } from '@/lib/db/queries';
import { exigirOnboarding } from '@/lib/onboarding/muro';

export const metadata = { title: 'Zero Administración' };

/**
 * Área de Administración del negocio — su propio espacio, como Facturación y
 * Punto de Venta. Todo lo que aquí vive se centra en la EMPRESA ACTIVA:
 * perfil, usuarios, roles y plan.
 *
 * Administración ya es un módulo del catálogo (base, toda empresa lo tiene),
 * así que el switcher lo marca como activo. Sin `titulo`: el switcher ya dice
 * "Administración" y ponerlo dos veces al lado se leía como un error.
 */
export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  await exigirOnboarding();
  const user = await getUser();

  return (
    <ModuleShell
      current="administracion"
      user={user ?? null}
      rail={<CuentaNavRail />}
      railMovil={<CuentaNavRail variant="drawer" />}
    >
      {children}
    </ModuleShell>
  );
}
