import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { estadoPlantaDe } from '@/lib/escolar/planta-estado';
import { plantaFisicaDisponible } from '@/lib/escolar/inventario-aula';
import { ConfiguracionNav } from './_nav';

/**
 * El permiso se comprueba UNA vez aquí y vale para todas las pestañas: en el
 * layout, no en cada página, para no repetir la consulta de sesión al saltar
 * de una a otra.
 */
export default async function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('administracion-escolar:configurar');
  // «Planta física» solo sale si ya corrieron las migraciones que necesita (falla cerrado).
  const teamId = await getTeamIdForUser();
  const planta = teamId ? plantaFisicaDisponible(await estadoPlantaDe(teamId)) : false;
  // Ancho: los conceptos y las tarifas son tablas de muchas columnas, y a
  // 1024 px se apretaban con media pantalla vacía a cada lado.
  return (
    <section className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <ConfiguracionNav planta={planta} />
      {children}
    </section>
  );
}
