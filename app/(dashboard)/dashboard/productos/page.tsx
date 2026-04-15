import { PlanGate } from '@/components/plan-gate';
import ProductosClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="productos" />
      <ProductosClient />
    </>
  );
}
