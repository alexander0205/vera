/**
 * Pantalla dedicada de GASTOS (e43 — gastos menores / e47 — pagos al exterior).
 * Categoría fija → el usuario solo elige entre los subtipos de gastos.
 */
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import NuevaFacturaFormClient from '@/app/(dashboard)/dashboard/facturas/nueva/_nueva-factura-client';
import { requirePermission } from '@/lib/auth/page-guard';

export default async function NuevoGastoPage() {
  await requirePermission('facturas:crear');
  const perfil = await getEmpresaPerfil();

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    }>
      <NuevaFacturaFormClient initialPerfil={perfil} categoriaFija="gastos" />
    </Suspense>
  );
}
