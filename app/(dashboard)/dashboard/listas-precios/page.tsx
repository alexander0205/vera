import { PlanGate } from '@/components/plan-gate';
import ListasPreciosClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="inventario-avanzado" />
      <ListasPreciosClient />
    </>
  );
}
