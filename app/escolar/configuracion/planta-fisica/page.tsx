import { notFound, redirect } from 'next/navigation';
import { getTeamIdForUser } from '@/lib/db/queries';
import { estadoPlantaDe } from '@/lib/escolar/planta-estado';
import { plantaFisicaDisponible, inventarioAulaVisible } from '@/lib/escolar/inventario-aula';
import { listarEspacios, listarSecciones, personalParaResponsable } from '@/lib/escolar/inventario-aula-db';
import { PlantaFisicaClient } from './_client';

export const dynamic = 'force-dynamic';

/**
 * Planta física: los espacios del colegio (aulas, laboratorio, oficinas…), qué
 * secciones usa cada uno y quién responde por él. Es lo que enciende «Inventario
 * por aula». El permiso `administracion-escolar:configurar` lo exige el layout de
 * la configuración. Sin las migraciones no existe (404).
 */
export default async function PlantaFisicaPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');
  const estado = await estadoPlantaDe(teamId);
  if (!plantaFisicaDisponible(estado)) notFound();

  let datos;
  try {
    const [espacios, secciones, personal] = await Promise.all([
      listarEspacios(teamId, { incluirInactivos: true }), listarSecciones(teamId), personalParaResponsable(teamId),
    ]);
    datos = { espacios, secciones, personal };
  } catch (e) {
    console.error('[planta-fisica] no se pudo cargar', e instanceof Error ? e.message : e);
    notFound();
  }

  return <PlantaFisicaClient {...datos} inventarioActivo={inventarioAulaVisible(estado)} />;
}
