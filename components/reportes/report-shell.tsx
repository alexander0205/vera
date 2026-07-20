/**
 * Shell server-safe para páginas de reporte: breadcrumb + header + filtro de
 * fecha (form GET) + botón de descarga. Sin 'use client' — se renderiza en el
 * server. Reutilizado por todos los reportes analíticos.
 */
import Link from 'next/link';
import { ChevronRight, Download } from 'lucide-react';
import { DateRangeFilter } from './date-range-filter';

export function ReportShell({
  titulo, descripcion, migaja, desde, hasta, exportHref, children,
}: {
  titulo: string;
  descripcion: string;
  migaja: string;
  desde: string;   // YYYY-MM-DD
  hasta: string;
  exportHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
        <Link href="/dashboard/reportes" className="hover:text-teal-600">Reportes</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-teal-600 font-medium">{migaja}</span>
      </div>

      {/* Header + export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
          <p className="text-sm text-gray-500 mt-1">{descripcion}</p>
        </div>
        {exportHref && (
          <a
            href={exportHref}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            <Download className="h-4 w-4" />
            Descargar Excel
          </a>
        )}
      </div>

      {/* Filtro de fecha — navegación client-side (no recarga el layout) */}
      <DateRangeFilter desde={desde} hasta={hasta} />

      {children}
    </section>
  );
}

/** Tarjeta KPI compartida. `tone` colorea el valor. */
export function KpiCard({
  label, value, sub, tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'teal' | 'amber' | 'red' | 'emerald';
}) {
  const toneClass = {
    default: 'text-gray-900',
    teal: 'text-teal-700',
    amber: 'text-amber-600',
    red: 'text-red-600',
    emerald: 'text-emerald-600',
  }[tone];
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-bold text-lg ${toneClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Panel blanco con título — contenedor de charts/tablas. */
export function Panel({ titulo, children, right }: { titulo: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}
