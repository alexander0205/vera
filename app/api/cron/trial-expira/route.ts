import { NextRequest, NextResponse } from 'next/server';
import { expireTrials } from '@/lib/payments/module-subscriptions';

// Invocado por el cron de Vercel (vercel.json → crons[]). Pasa a
// 'trial_expired' las pruebas locales de 15 días ya vencidas y re-deriva el
// gate de acceso de las empresas afectadas.
// Protegido: Authorization: Bearer ${CRON_SECRET}
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const expirados = await expireTrials();

  return NextResponse.json({
    expirados,
    timestamp: new Date().toISOString(),
  });
}
