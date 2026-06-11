/**
 * Layout minimalista para páginas de impresión.
 * No incluye sidebar, header ni nav del dashboard.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
