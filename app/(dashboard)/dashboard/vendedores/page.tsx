import { PlanGate } from '@/components/plan-gate';
import VendedoresClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="inventario-avanzado" />
      <VendedoresClient />
    </>
  );
}
