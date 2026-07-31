import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/page-guard';
import SuscripcionPage from '@/app/(dashboard)/dashboard/suscripcion/page';
import { BILLING_ENABLED } from '@/lib/config/billing';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plan y facturación — Zero Administración' };

/** Plan contratado, límites de uso y portal de pago. */
export default async function CuentaPlanPage() {
  // Producto en desarrollo: sin UI de planes. Ver lib/config/billing.
  if (!BILLING_ENABLED) notFound();
  await requirePermission('suscripcion:gestionar');
  return <SuscripcionPage />;
}
