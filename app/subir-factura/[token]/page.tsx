import SubirFacturaClient from './_client';

// El token va en la URL: ni buscadores ni cabecera Referer hacia fuera.
export const metadata = {
  title: 'Enviar factura · Zero',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};

/**
 * La página que abre quien fotografía una factura de proveedor: el enlace que
 * la empresa comparte por WhatsApp. No lleva sesión; el token de la URL es toda
 * la autorización y lo valida /api/subir-factura/<token>.
 */
export default async function SubirFacturaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SubirFacturaClient token={token} />;
}
