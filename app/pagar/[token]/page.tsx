/**
 * La página del padre — /pagar/{token}
 *
 * Pública: el token es el secreto. Se abre casi siempre desde el botón de un
 * WhatsApp, en el móvil, con la cobertura que haya. De ahí las tres reglas del
 * cliente: nada que cargar de fuera, todo en una pantalla, y el número de
 * cuenta a un toque de distancia.
 *
 * `force-dynamic` porque la deuda se calcula al abrir. Una versión cacheada le
 * enseñaría al padre una cuota que ya pagó en la caja del colegio.
 */

import type { Metadata } from 'next';
import { resolverLink, marcarAcceso } from '@/lib/administracion-escolar/link-pago';
import { PAGOS_ONLINE_ENABLED } from '@/lib/config/pagos-online';
import { PagarClient } from './_pagar-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pagos pendientes',
  // Un enlace de cobro con nombres de menores no tiene por qué acabar en un
  // buscador.
  robots: { index: false, follow: false },
};

/**
 * Enlace que ya no sirve.
 *
 * Se pinta aquí y no con `notFound()`: con PPR el armazón de la página ya se
 * mandó cuando se descubre que el token no vale, y el 404 de Next acababa
 * dejando una pantalla EN BLANCO. A quien le pasa esto es a un padre, en el
 * teléfono, con un enlace de un WhatsApp viejo — y un blanco no le dice qué
 * hacer.
 *
 * No se distingue «no existe» de «revocado» ni de «el colegio ya no usa el
 * sistema»: los tres dan lo mismo, para no confirmarle a nadie que un token
 * existió.
 */
function EnlaceNoValido() {
  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', background: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        maxWidth: '26rem', width: '100%', background: '#fff', borderRadius: 16,
        border: '1px solid #e2e8f0', padding: '2rem 1.75rem', textAlign: 'center',
        boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 12px 32px -20px rgba(15,23,42,.25)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '999px', background: '#fef3c7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem', fontSize: 24,
        }} aria-hidden>🔗</div>
        <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 650, color: '#0f172a' }}>
          Este enlace ya no está disponible
        </h1>
        <p style={{ margin: '.6rem 0 0', fontSize: '.925rem', lineHeight: 1.6, color: '#475569' }}>
          Puede que el colegio lo haya reemplazado por uno nuevo, o que el mensaje
          sea de hace tiempo.
        </p>
        <p style={{ margin: '1rem 0 0', fontSize: '.875rem', lineHeight: 1.6, color: '#64748b' }}>
          Busca el mensaje más reciente del colegio, o escríbeles para que te
          manden el enlace otra vez.
        </p>
      </div>
    </main>
  );
}

export default async function PagarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await resolverLink(token);
  if (!link) return <EnlaceNoValido />;

  await marcarAcceso(link.linkId);

  return <PagarClient token={token} vista={link.vista} tarjetaHabilitada={PAGOS_ONLINE_ENABLED} />;
}
