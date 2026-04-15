import { PlanGate } from '@/components/plan-gate';
import CotizacionesClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="cotizaciones" />
      <CotizacionesClient />
    </>
  );
}
