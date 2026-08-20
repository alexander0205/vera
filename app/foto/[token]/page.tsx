import { CapturaMovilClient } from './_captura-client';

/**
 * Página que abre el teléfono al escanear el QR. No lleva sesión de usuario:
 * el token de la URL es toda la autorización y lo valida el servidor en
 * /api/fotos/captura/<token>.
 *
 * No se resuelve nada en el servidor a propósito — si el token está muerto,
 * queremos enseñar un mensaje amable en el móvil, no un 404 de Next.
 */
export default async function FotoCapturaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CapturaMovilClient token={token} />;
}
