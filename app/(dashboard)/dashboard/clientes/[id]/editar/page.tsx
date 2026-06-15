import { notFound } from 'next/navigation';
import { PlanGate } from '@/components/plan-gate';
import ClienteForm from '../../_cliente-form';

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = parseInt(id);
  if (isNaN(clienteId)) notFound();

  return (
    <>
      <PlanGate feature="clientes" />
      <ClienteForm clienteId={clienteId} />
    </>
  );
}
