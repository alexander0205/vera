/**
 * Landing pública de pago — pay.zero.com.do/{token}
 * Sin login (el token es el secreto). Muestra el monto y el negocio, y arranca
 * el pago con la pasarela. Responsive: la mayoría abre desde WhatsApp en móvil.
 */

import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { paymentLinks, ecfDocuments, cotizaciones, teams } from '@/lib/db/schema';
import { PROVIDER_LABELS } from '@/lib/pagos/config';
import { PayClient } from './pay-client';

export const dynamic = 'force-dynamic';

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.token, token)).limit(1);
  if (!link) notFound();

  const [team] = await db.select({ name: teams.name, rnc: teams.rnc })
    .from(teams).where(eq(teams.id, link.teamId)).limit(1);

  let docLabel = '';
  let cliente = '';
  let rncCliente = '';
  let fecha: Date | null = null;
  let itemsRaw: string | null = null;

  if (link.ecfDocumentId) {
    const [d] = await db.select({
      encf: ecfDocuments.encf, razon: ecfDocuments.razonSocialComprador,
      rnc: ecfDocuments.rncComprador, fecha: ecfDocuments.fechaEmision, items: ecfDocuments.lineasJson,
    }).from(ecfDocuments).where(eq(ecfDocuments.id, link.ecfDocumentId)).limit(1);
    docLabel = d?.encf ? `Factura ${d.encf}` : 'Factura';
    cliente  = d?.razon ?? '';
    rncCliente = d?.rnc ?? '';
    fecha = d?.fecha ?? null;
    itemsRaw = d?.items ?? null;
  } else if (link.cotizacionId) {
    const [c] = await db.select({
      numero: cotizaciones.numero, razon: cotizaciones.razonSocialComprador,
      rnc: cotizaciones.rncComprador, fecha: cotizaciones.fechaEmision, items: cotizaciones.items,
    }).from(cotizaciones).where(eq(cotizaciones.id, link.cotizacionId)).limit(1);
    docLabel = c?.numero ? `Cotización ${c.numero}` : 'Cotización';
    cliente  = c?.razon ?? '';
    rncCliente = c?.rnc ?? '';
    fecha = c?.fecha ?? null;
    itemsRaw = c?.items ?? null;
  }

  // Ítems para el desglose (nombre + total por línea). Tolerante a formatos.
  type LineaPago = { nombre: string; cantidad: number; totalCentavos: number };
  let lineas: LineaPago[] = [];
  if (itemsRaw) {
    try {
      const arr = JSON.parse(itemsRaw) as Array<Record<string, unknown>>;
      lineas = arr.map((it) => {
        const cantidad = Number(it.cantidadItem ?? it.cantidad ?? 1) || 1;
        const precio = Number(it.precioUnitarioItem ?? it.precio ?? 0) || 0;
        const nombre = String(it.nombreItem ?? it.nombre ?? it.descripcionItem ?? 'Ítem');
        return { nombre, cantidad, totalCentavos: Math.round(precio * cantidad * 100) };
      }).filter((l) => l.nombre);
    } catch { lineas = []; }
  }

  const expirado = link.estado === 'pendiente' && link.expiresAt ? link.expiresAt < new Date() : false;
  const subtotalCentavos = Math.max(0, link.montoCentavos - link.itbisCentavos);

  return (
    <PayClient
      token={token}
      estadoInicial={expirado ? 'expirado' : link.estado}
      provider={link.provider}
      providerLabel={PROVIDER_LABELS[link.provider] ?? link.provider}
      montoCentavos={link.montoCentavos}
      subtotalCentavos={subtotalCentavos}
      itbisCentavos={link.itbisCentavos}
      businessName={team?.name ?? 'Comercio'}
      rncNegocio={team?.rnc ?? ''}
      docLabel={docLabel}
      cliente={cliente}
      rncCliente={rncCliente}
      fecha={fecha ? fecha.toISOString() : null}
      lineas={lineas}
    />
  );
}
