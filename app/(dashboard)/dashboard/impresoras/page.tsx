import { PlanGate } from '@/components/plan-gate';
import ImpresorasClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="impresoras" />
      <ImpresorasClient />
    </>
  );
}
