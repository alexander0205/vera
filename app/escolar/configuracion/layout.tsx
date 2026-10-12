import { requirePermission } from '@/lib/auth/page-guard';
import { ConfiguracionNav } from './_nav';

/**
 * El permiso se comprueba UNA vez aquí y vale para todas las pestañas: en el
 * layout, no en cada página, para no repetir la consulta de sesión al saltar
 * de una a otra.
 */
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('administracion-escolar:configurar');
  return (
    <section className="mx-auto max-w-5xl space-y-5 p-6">
      <ConfiguracionNav />
      {children}
    </section>
  );
}
