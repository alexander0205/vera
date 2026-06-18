import { requirePermissionAny } from '@/lib/auth/page-guard';

/**
 * Server-side gate: compras:ver (ver e-CF de proveedores) O
 * productos:gestionar (registrar/ver compras manuales sin ver e-CF).
 * Redirige a /dashboard si no tiene ninguno de los dos.
 */
export default async function ComprasLayout({ children }: { children: React.ReactNode }) {
  await requirePermissionAny(['compras:ver', 'productos:gestionar']);
  return <>{children}</>;
}
