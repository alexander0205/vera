/**
 * Pantalla dedicada de NOTA DE CRÉDITO (e34). Categoría fija → sin selector de
 * tipo. Acepta ?padreId=N para prellenar desde una factura de origen.
 */
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import NuevaFacturaFormClient from '@/app/(dashboard)/dashboard/facturas/nueva/_nueva-factura-client';
import { requirePermission } from '@/lib/auth/page-guard';

export default async function NuevaNotaCreditoPage() {
  await requirePermission('facturas:crear');
  const perfil = await getEmpresaPerfil();

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    }>
      <NuevaFacturaFormClient initialPerfil={perfil} categoriaFija="nota-credito" />
    </Suspense>
  );
}
