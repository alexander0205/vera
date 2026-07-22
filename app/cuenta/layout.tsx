import { CuentaNavRail } from '@/components/cuenta-nav-rail';
import { ModuleShell } from '@/components/module-shell';
import { getUser } from '@/lib/db/queries';

export const metadata = { title: 'Zero Administración' };

/**
 * Área de Administración del negocio — su propio espacio, como Facturación y
 * Punto de Venta. Todo lo que aquí vive se centra en la EMPRESA ACTIVA:
 * perfil, usuarios, roles y plan.
 *
 * No es un módulo del catálogo (toda empresa se administra), así que el header
 * va con título propio y sin marcar módulo activo en el switcher.
 */
export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <ModuleShell
      current={null}
      titulo="Administración"
      user={user ?? null}
      rail={<CuentaNavRail />}
      railMovil={<CuentaNavRail variant="drawer" />}
    >
      {children}
    </ModuleShell>
  );
}
