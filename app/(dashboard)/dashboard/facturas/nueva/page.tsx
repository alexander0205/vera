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
import { hasPermission } from '@/lib/auth/page-guard';
import { ShieldX } from 'lucide-react';
import Link from 'next/link';

// Re-export para consumidores existentes (editar, wrapper cliente).
export type { EmpresaPerfil } from '@/lib/facturas/empresa-perfil';

export default async function NuevaFacturaPage() {
  const canCreate = await hasPermission('facturas:crear');
  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-5 p-6 text-center">
        <div className="h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
          <ShieldX className="h-7 w-7 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sin permisos para crear facturas</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            Tu rol no tiene acceso para crear facturas. Contacta al administrador si necesitas realizar cambios.
          </p>
        </div>
        <Link
          href="/dashboard/facturas"
          className="text-sm px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          Volver a facturas
        </Link>
      </div>
    );
  }
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
