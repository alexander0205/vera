import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { historialDeAvisos } from '@/lib/administracion-escolar/panel-avisos';

/**
 * Lo que ya se le mandó a las familias, lo más reciente primero.
 *
 * Va aparte del resumen porque se pagina y el resumen no: el panel abre con lo
 * de hoy y el historial crece para siempre.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;
  const canal = sp.get('canal');

  const datos = await historialDeAvisos(auth.teamId, {
    limit: Number(sp.get('limit')) || 50,
    offset: Number(sp.get('offset')) || 0,
    canal: canal && ['correo', 'whatsapp', 'sms'].includes(canal) ? canal : undefined,
  });

  return NextResponse.json(datos);
}
