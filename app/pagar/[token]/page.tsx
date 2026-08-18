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
import { notFound } from 'next/navigation';
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

export default async function PagarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await resolverLink(token);
  if (!link) notFound();

  await marcarAcceso(link.linkId);

  return <PagarClient token={token} vista={link.vista} tarjetaHabilitada={PAGOS_ONLINE_ENABLED} />;
}
