import { NextRequest, NextResponse } from 'next/server';
import { aplicarRecargosMoraVencidos } from '@/lib/cobranza/recargo';
import { llamadaDeCronValida } from '@/lib/seguridad/cron';

// Este endpoint es invocado por el cron de Vercel (vercel.json → crons[]).
// Protegido con el mismo patrón que los demás crons del proyecto:
// Authorization: Bearer ${CRON_SECRET}
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!llamadaDeCronValida(authHeader)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const resultado = await aplicarRecargosMoraVencidos();

  return NextResponse.json({
    procesados:         resultado.procesados,
    aplicados:          resultado.aplicados,
    omitidos:           resultado.omitidos,
    montoTotalCentavos: resultado.montoTotalCentavos,
    timestamp:          new Date().toISOString(),
  });
}
