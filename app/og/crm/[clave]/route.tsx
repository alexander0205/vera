/**
 * La imagen para compartir de cada subpágina de Zero CRM (Open Graph y X).
 *
 * Se genera al compilar con `next/og` y dice lo mismo que la página: su nombre,
 * su titular y su resumen. Sin capturas inventadas ni cifras.
 */

import { ImageResponse } from 'next/og';
import { PAGINAS_CRM, type ClaveCrm } from '@/lib/agentes/crm-rutas';
import { subpaginaCrm } from '@/lib/agentes/crm';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return PAGINAS_CRM.map(p => ({ clave: p.clave }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ clave: string }> }) {
  const { clave } = await params;
  if (!PAGINAS_CRM.some(p => p.clave === clave)) return new Response('No encontrado', { status: 404 });
  const p = subpaginaCrm(clave as ClaveCrm);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#f4f8ff', color: '#102a72', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 700 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#3658e1', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>Z</div>
          Zero CRM
          <div style={{ marginLeft: 12, fontSize: 24, fontWeight: 600, color: '#3658e1' }}>{p.menu}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5 }}>{p.encabezado}</div>
          <div style={{ fontSize: 28, lineHeight: 1.4, color: '#3b4252' }}>{p.resumen}</div>
        </div>
        <div style={{ fontSize: 24, color: '#3658e1', fontWeight: 600 }}>zero.com.do/productos/crm</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
