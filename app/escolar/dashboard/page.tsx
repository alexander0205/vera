import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import DashboardEscolarClient from './_dashboard-client';

/**
 * El perfil del emisor se resuelve AQUÍ, en el servidor, y se pasa al cliente:
 * lo necesita el cajón de «Nueva factura» que se abre desde el Panorama —el
 * mismo motivo que la ficha de la familia (ver responsables/[id]/page.tsx)—.
 */
export default async function DashboardEscolarPage() {
  const perfil = await getEmpresaPerfil();
  return <DashboardEscolarClient perfilEmpresa={perfil} />;
}
