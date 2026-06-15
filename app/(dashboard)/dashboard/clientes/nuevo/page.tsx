import { PlanGate } from '@/components/plan-gate';
import ClienteForm from '../_cliente-form';

export default async function NuevoClientePage() {
  return (
    <>
      <PlanGate feature="clientes" />
      <ClienteForm />
    </>
  );
}
