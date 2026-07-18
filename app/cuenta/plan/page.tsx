import { requirePermission } from '@/lib/auth/page-guard';
import SuscripcionPage from '@/app/(dashboard)/dashboard/suscripcion/page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plan y facturación — Zero Administración' };

/** Plan contratado, límites de uso y portal de pago. */
export default async function CuentaPlanPage() {
  await requirePermission('suscripcion:gestionar');
  return <SuscripcionPage />;
}
