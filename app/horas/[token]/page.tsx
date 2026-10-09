import HorasClient from './_horas-client';

// El token va en la URL: ni buscadores ni cabecera Referer hacia fuera.
export const metadata = {
  title: 'Mis horas · Zero Nómina',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};

/**
 * Página pública donde un empleado que cobra por hora sube sus horas. No lleva
 * sesión: el token de la URL es toda la autorización y lo valida el servidor en
 * /api/horas/<token>.
 */
export default async function HorasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <HorasClient token={token} />;
}
