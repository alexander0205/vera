import { requirePermission, requireModule } from '@/lib/auth/page-guard';
import PosHistorialClient from './_historial-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Historial — Zero POS' };

/** Historial de recibos del turno de caja: ver y filtrar lo cobrado (Fase 1). */
export default async function PosHistorialPage() {
  await requirePermission('pos:vender');
  await requireModule('pos', '/dashboard');
  return <PosHistorialClient />;
}
