/**
 * Resultado del pago (post-redirect de la pasarela o del simulador).
 * Lee el estado AUTORITATIVO del link desde la DB (no de query params).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { paymentLinks } from '@/lib/db/schema';
import { fmtMoneda } from '@/lib/factura/core';

export const dynamic = 'force-dynamic';

export default async function ResultadoPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { token } = await params;
  const { estado: estadoQuery } = await searchParams;
  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.token, token)).limit(1);

  const estado = link?.estado ?? 'desconocido';
  const cancelado = estadoQuery === 'cancelado' && estado !== 'pagado';
  const pagado = estado === 'pagado';

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={{ fontSize: 56 }}>{pagado ? '✅' : cancelado ? '↩️' : '❌'}</div>
        <h1 style={S.h1}>
          {pagado ? 'Pago exitoso' : cancelado ? 'Pago cancelado' : 'Pago no completado'}
        </h1>
        {link && (
          <div style={S.monto}>{fmtMoneda(link.montoCentavos / 100)}</div>
        )}
        {pagado && link?.providerRef && (
          <div style={S.ref}>Autorización: <b>{link.providerRef}</b></div>
        )}
        {pagado ? (
          <p style={S.msg}>Tu pago fue recibido y registrado. Puedes cerrar esta página.</p>
        ) : (
          <a href={`/pay/${token}`} style={S.link}>Volver e intentar de nuevo</a>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 16, fontFamily: 'system-ui, sans-serif' },
  card: { width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,.08)', padding: 32, textAlign: 'center' },
  h1:   { fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '12px 0' },
  monto:{ fontSize: 32, fontWeight: 800, color: '#0f172a', margin: '8px 0' },
  ref:  { fontSize: 13, color: '#64748b', marginBottom: 8 },
  msg:  { fontSize: 14, color: '#475569', marginTop: 8 },
  link: { display: 'inline-block', marginTop: 12, color: '#0d9488', fontWeight: 600, textDecoration: 'none' },
};
