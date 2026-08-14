/**
 * Pantalla de NUEVA COTIZACIÓN.
 *
 * Server component — carga el perfil de la empresa activa (igual que Nueva
 * Factura) para que el emisor del resumen se actualice al cambiar de empresa.
 * La cotización reutiliza los componentes del formulario de factura, sin
 * comprobante fiscal ni registro de pago.
 */
import { Suspense } from 'react';
import { Loader2, ShieldX } from 'lucide-react';
import Link from 'next/link';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import { hasPermission } from '@/lib/auth/page-guard';
import NuevaCotizacionFormClient from './_nueva-cotizacion-client';

export default async function NuevaCotizacionPage() {
  const canCreate = await hasPermission('cotizaciones:gestionar');
  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-5 p-6 text-center">
        <div className="h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
          <ShieldX className="h-7 w-7 text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sin permisos para crear cotizaciones</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            Tu rol no tiene acceso para crear cotizaciones. Contacta al administrador si necesitas realizar cambios.
          </p>
        </div>
        <Link
          href="/dashboard/cotizaciones"
          className="text-sm px-4 py-2 bg-zero-600 text-white rounded-lg hover:bg-zero-700 transition-colors"
        >
          Volver a cotizaciones
        </Link>
      </div>
    );
  }

  const perfil = await getEmpresaPerfil();

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-zero-600" />
      </div>
    }>
      <NuevaCotizacionFormClient initialPerfil={perfil} />
    </Suspense>
  );
}
