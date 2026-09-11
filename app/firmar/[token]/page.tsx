import FirmaClient from './_firma-client';

/**
 * Página pública de firma de contrato. No lleva sesión: el token de la URL es
 * toda la autorización y lo valida el servidor en /api/firma/<token>. No se
 * resuelve nada aquí para poder mostrar un mensaje amable si el enlace no sirve.
 */
export default async function FirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FirmaClient token={token} />;
}
