/**
 * Página pública SIN sesión: la cámara para registrar compras.
 *
 * El negocio comparte este enlace (o su QR impreso). Quien lo abre fotografía la
 * factura y la envía; el negocio la revisa después en su panel. No hay login ni
 * datos del negocio expuestos más allá del nombre.
 */

import type { Metadata } from 'next';
import { resolverLinkPublico } from '@/lib/compras/captura-link';
import CapturaClient from './_captura-client';

// Enlace público permanente: que no lo indexe un buscador.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CapturaCompraPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolverLinkPublico(token);

  if (!link) {
    return (
      <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{ fontSize: 40 }}>🔗</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Enlace no válido</h1>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            Este enlace no existe o el negocio lo desactivó. Pídele uno nuevo.
          </p>
        </div>
      </main>
    );
  }

  return <CapturaClient token={token} negocio={link.negocio} />;
}
