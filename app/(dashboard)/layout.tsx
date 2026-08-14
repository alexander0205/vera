/**
 * Layout (dashboard) — sin gating por plan.
 * Todos los usuarios autenticados acceden libremente.
 */
import { TicketWidget } from '@/components/support/ticket-widget';

export default async function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TicketWidget />
    </>
  );
}
