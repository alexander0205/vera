import { PlanGate } from '@/components/plan-gate';
import FacturasRecurrentesClient from './_page-client';
import { hasPermission } from '@/lib/auth/page-guard';

export default async function Page() {
  const canOperate = await hasPermission('facturas:crear');
  return (
    <>
      <PlanGate feature="facturas-recurrentes" />
      <FacturasRecurrentesClient canOperate={canOperate} />
    </>
  );
}
