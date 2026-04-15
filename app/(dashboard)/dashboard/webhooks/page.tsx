import { PlanGate } from '@/components/plan-gate';
import WebhooksClient from './_page-client';

export default async function Page() {
  return (
    <>
      <PlanGate feature="webhooks" />
      <WebhooksClient />
    </>
  );
}
