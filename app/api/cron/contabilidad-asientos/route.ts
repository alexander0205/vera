import { NextRequest, NextResponse } from 'next/server';
import { ejecutarBarridoContabilidad } from '@/lib/contabilidad/barrido-cron';
import { llamadaDeCronValida } from '@/lib/seguridad/cron';

// Invocado por el cron de Vercel (vercel.json → crons[]). Barre los asientos
// pendientes de los teams con contabilidad encendida y evalúa las promesas de
// pago vencidas. Protegido con el mismo patrón que los demás crons:
// Authorization: Bearer ${CRON_SECRET}
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!llamadaDeCronValida(authHeader)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const resultado = await ejecutarBarridoContabilidad();

  return NextResponse.json({ ...resultado, timestamp: new Date().toISOString() });
}
