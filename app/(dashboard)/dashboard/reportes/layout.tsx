import { requireModule } from '@/lib/auth/page-guard';

/** Gate de módulo Facturación — un usuario solo-POS es redirigido a /pos. */
export default async function ModuleGuardLayout({ children }: { children: React.ReactNode }) {
  await requireModule('facturacion', '/pos');
  return <>{children}</>;
}
