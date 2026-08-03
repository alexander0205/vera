import { PosNavRail } from '@/components/pos-nav-rail';
import { ModuleShell } from '@/components/module-shell';
import { getUser } from '@/lib/db/queries';

export const metadata = { title: 'Zero Punto de Venta' };

/**
 * El <Toaster> vive en el layout raíz (app/layout.tsx). No montar otro aquí:
 * duplicaba cada notificación (salían dos toasts por acción).
 *
 * El POS era el único módulo SIN header de aplicación: se entraba y no había
 * forma de cambiar de empresa, saltar a otro módulo ni llegar al perfil. Ahora
 * monta el mismo ModuleShell que Escolar y Administración. La barra de trabajo
 * del POS (buscador/escáner) sigue siendo suya y vive dentro de la pantalla —
 * es otra cosa: esa opera la venta, esta ubica al usuario en el sistema.
 */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <ModuleShell
      current="pos"
      user={user ?? null}
      rail={<PosNavRail />}
      railMovil={<PosNavRail variant="drawer" />}
    >
      {children}
    </ModuleShell>
  );
}
