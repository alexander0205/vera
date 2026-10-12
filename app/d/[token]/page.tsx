import { SubidaFamiliaClient } from './_subida-client';

/**
 * La página que abre la familia: el enlace o el QR que le manda el colegio.
 *
 * No lleva sesión de usuario — el token de la URL es toda la autorización y lo
 * valida el servidor en /api/documentos-familia/<token>.
 *
 * No se resuelve nada en el servidor a propósito: si el token está muerto
 * queremos enseñar un mensaje amable en el móvil, no un 404 de Next.
 */
export default async function SubidaDocumentosPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { token } = await params;
  const { c } = await searchParams;
  return <SubidaFamiliaClient token={token} camaraPrimero={c === '1'} />;
}
