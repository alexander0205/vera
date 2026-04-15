import { PlanGate } from '@/components/plan-gate';
import FacturasRecurrentesClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="facturas-recurrentes" />
      <FacturasRecurrentesClient />
    </>
  );
}
