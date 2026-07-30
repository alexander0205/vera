import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { ConsultaNcfClient } from './_client';
import { AnularRangoPanel } from './_anular-rango';

export const dynamic = 'force-dynamic';

export default async function ConsultaNcfPage() {
  await requirePermission('reportes:ver');

  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
        <Link href="/dashboard/contabilidad/secuencias" className="hover:text-teal-600">Contabilidad</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-teal-600 font-medium">Consulta de e-NCF</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Consulta de e-NCF</h1>
        <p className="text-sm text-gray-500 mt-1">
          Busca cualquier comprobante o rango completo y mira exactamente qué pasó con cada número:
          si llegó a la DGII, si falló y por qué, o si nunca se llegó a generar.
        </p>
      </div>

      <ConsultaNcfClient />

      {/* Acción fiscal: colgada del final a propósito — se llega aquí después de
          revisar el rango, no antes. El panel se oculta solo si el usuario no
          tiene `facturas:anular` (el contador consulta pero no anula). */}
      <div className="mt-5">
        <AnularRangoPanel />
      </div>
    </section>
  );
}
