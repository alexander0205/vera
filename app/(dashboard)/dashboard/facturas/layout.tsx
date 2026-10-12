import { requireModule } from '@/lib/auth/page-guard';

/**
 * Gate de módulo para toda la sección de Facturas (list, nueva, [id], editar).
 * Un usuario sin el módulo Facturación (p.ej. un cajero solo-POS) no debe
 * poder abrir estas páginas ni por URL directa — se le redirige a su módulo.
 * (Los datos ya están protegidos en las APIs por permiso; esto cierra el
 * acceso a la propia UI.)
 */
export default async function FacturasLayout({ children }: { children: React.ReactNode }) {
  await requireModule('facturacion', '/pos');
  return <>{children}</>;
}
