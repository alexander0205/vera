/**
 * La página del padre avisa que se abrió: POST { a?: número del aviso }.
 *
 * Pública como la página: el token es la credencial. Siempre responde 204, para
 * no confirmarle a nadie si un token existe. Con sesión de Zero no cuenta: es
 * alguien del colegio probando el enlace, no la familia.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { registrarApertura } from '@/lib/administracion-escolar/aperturas-aviso';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const listo = new NextResponse(null, { status: 204 });
  if ((await cookies()).has('session')) return listo;
  try {
    const { token } = await params;
    const { a } = await req.json().catch(() => ({})) as { a?: unknown };
    await registrarApertura(token, Number.isInteger(a) && Number(a) > 0 ? Number(a) : null);
  } catch (e) {
    console.error('[pagar] no se pudo anotar la apertura', e instanceof Error ? e.message : e);
  }
  return listo;
}
