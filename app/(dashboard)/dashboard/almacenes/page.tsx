import { PlanGate } from '@/components/plan-gate';
import AlmacenesClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="inventario-avanzado" />
      <AlmacenesClient />
    </>
  );
}
