import { PlanGate } from '@/components/plan-gate';
import ProductoDetalleClient from './_page-client';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return (
    <>
      <PlanGate feature="productos" />
      <ProductoDetalleClient productoId={parseInt(id)} />
    </>
  );
}
