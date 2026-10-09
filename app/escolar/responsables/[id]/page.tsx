import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import FamiliaPerfilClient from './_perfil-client';

/**
 * El perfil de la empresa se trae AQUÍ, en el servidor, y no dentro del cajón
 * de factura.
 *
 * Es el mismo motivo por el que lo hace la pantalla de `/dashboard/facturas/
 * nueva`: los datos del emisor —RNC, razón social, secuencias— tienen que
 * llegar ya resueltos, porque al cambiar de empresa el `router.refresh` vuelve
 * a ejecutar este server component y el formulario se entera. Pedirlos desde
 * el cliente al abrir el cajón añadiría una espera justo en el gesto de
 * facturar, que es el que tiene que ser inmediato.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getEmpresaPerfil();
  return <FamiliaPerfilClient clientId={Number(id)} perfilEmpresa={perfil} />;
}
