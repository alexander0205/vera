/**
 * Layout (dashboard) — sin gating por plan.
 * Todos los usuarios autenticados acceden libremente.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
