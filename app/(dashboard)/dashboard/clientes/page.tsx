import { PlanGate } from '@/components/plan-gate';
import ClientesClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="clientes" />
      <ClientesClient />
    </>
  );
}
