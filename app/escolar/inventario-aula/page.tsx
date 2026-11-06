import { notFound, redirect } from 'next/navigation';
import { getTeamIdForUser } from '@/lib/db/queries';
import { estadoPlantaDe } from '@/lib/escolar/planta-estado';
import { inventarioAulaVisible } from '@/lib/escolar/inventario-aula';
import { cargarInventario } from '@/lib/escolar/inventario-aula-db';
import { InventarioAulaClient } from './_client';

export const dynamic = 'force-dynamic';

/**
 * Inventario por aula. Ver exige `administracion-escolar:ver` (lo comprueba el
 * layout de /escolar). La pantalla NO EXISTE hasta que el colegio tiene espacios y
 * al menos un activo con aula: sin eso (o sin las migraciones) es un 404, y solo
 * queda «Planta física» en la configuración para empezar.
 */
export default async function InventarioAulaPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');
  if (!inventarioAulaVisible(await estadoPlantaDe(teamId))) notFound();

  let inv;
  try {
    inv = await cargarInventario(teamId);
  } catch (e) {
    console.error('[inventario-aula] no se pudo cargar', e instanceof Error ? e.message : e);
    notFound();
  }

  const secciones = Object.fromEntries(inv.espacios.map((e) => [e.id, e.secciones.map((x) => x.etiqueta)]));
  return <InventarioAulaClient resumen={{ tarjetas: inv.tarjetas, aulas: inv.aulas, sinAula: inv.sinAula }} secciones={secciones} />;
}
