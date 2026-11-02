import { requireModule, requirePermission } from '@/lib/auth/page-guard';
import { PestanasNomina } from '@/components/nomina/PestanasNomina';

/**
 * Nómina dentro de Gobernanza: las mismas pantallas del módulo Nómina, con el
 * menú del colegio alrededor. Lizandro pidió hacer la nómina desde Gobernanza
 * sin ir a otra parte del sistema.
 *
 * Los mismos guards que `app/nomina/layout.tsx` (el módulo activo y poder ver
 * empleados) encima de los de Gobernanza; sin el módulo, vuelve al colegio.
 * Las secciones van en pestañas porque el menú de la izquierda es el del colegio.
 */
export default async function NominaGobernanzaLayout({ children }: { children: React.ReactNode }) {
  await requireModule('nomina', '/escolar');
  await requirePermission('empleados:ver');
  return (
    <div className="space-y-4">
      <PestanasNomina />
      {children}
    </div>
  );
}
