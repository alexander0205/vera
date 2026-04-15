import { PlanGate } from '@/components/plan-gate';
import ReportesClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="reportes" />
      <ReportesClient />
    </>
  );
}
