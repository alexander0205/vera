/**
 * Server component — carga el perfil de la empresa activa en el servidor.
 * Esto garantiza que al cambiar de empresa (router.refresh), los datos
 * del emisor en el formulario de nueva factura se actualicen correctamente.
 *
 * Pantalla de FACTURA DE VENTA. La categoría queda fija; el usuario solo elige
 * el subtipo (e31/e32/e44/e45/e46/Sin NCF). NC, ND, Compras y Gastos tienen sus
 * propias rutas/pantallas.
 */
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import NuevaFacturaFormClient from './_nueva-factura-client';
import { requirePermission } from '@/lib/auth/page-guard';

// Re-export para consumidores existentes (editar, wrapper cliente).
export type { EmpresaPerfil } from '@/lib/facturas/empresa-perfil';

export default async function NuevaFacturaPage() {
  await requirePermission('facturas:crear');
  const perfil = await getEmpresaPerfil();

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    }>
      <NuevaFacturaFormClient initialPerfil={perfil} categoriaFija="factura-venta" />
    </Suspense>
  );
}
