import { PlanGate } from '@/components/plan-gate';
import CategoriasClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="inventario-avanzado" />
      <CategoriasClient />
    </>
  );
}
