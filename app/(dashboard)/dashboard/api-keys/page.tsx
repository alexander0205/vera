import { PlanGate } from '@/components/plan-gate';
import ApiKeysClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="api-keys" />
      <ApiKeysClient />
    </>
  );
}
