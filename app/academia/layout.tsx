import { AcademiaNavRail } from '@/components/academia/academia-nav-rail';
import { ModuleShell } from '@/components/module-shell';
import { getUser } from '@/lib/db/queries';
import { exigirOnboarding } from '@/lib/onboarding/muro';

export const metadata = { title: 'Academia · Zero' };

/**
 * La Academia: videos de entrenamiento. Vive fuera de los módulos —cualquier
 * persona con sesión entra, sin importar su rol—, así que el armazón va sin
 * módulo activo. La sesión la exige el proxy (`/academia` es ruta protegida).
 */
export default async function AcademiaLayout({ children }: { children: React.ReactNode }) {
  await exigirOnboarding();
  const user = await getUser();

  return (
    <ModuleShell
      current={null}
      titulo="Academia"
      user={user ?? null}
      rail={<AcademiaNavRail />}
      railMovil={<AcademiaNavRail variant="drawer" />}
    >
      {children}
    </ModuleShell>
  );
}
