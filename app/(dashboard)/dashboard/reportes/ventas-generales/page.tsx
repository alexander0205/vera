import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Calendar, Download, ChevronRight } from 'lucide-react';
import { getUser, getTeamIdForUser, getVentasGenerales } from '@/lib/db/queries';
import { userCan } from '@/lib/config/roles';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const TIPO_NOMBRE: Record<string, string> = {
  '31': 'Factura',
  '32': 'Factura Consumo',
  '33': 'Nota Débito',
  '34': 'Nota Crédito',
  '41': 'Compra',
  '43': 'Gasto Menor',
  '44': 'Régimen Especial',
  '45': 'Gubernamental',
  '46': 'Exportación',
  '47': 'Pago Exterior',
};

const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
  ACEPTADO:             { label: 'Cobrada',    color: 'bg-emerald-100 text-emerald-700' },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', color: 'bg-amber-100 text-amber-700' },
  EN_PROCESO:           { label: 'En Proceso', color: 'bg-blue-100 text-blue-700' },
  RECHAZADO:            { label: 'Rechazada',  color: 'bg-red-100 text-red-700' },
  ANULADO:              { label: 'Anulada',    color: 'bg-gray-200 text-gray-600' },
  BORRADOR:             { label: 'Borrador',   color: 'bg-gray-100 text-gray-500' },
};

function fmtDOP(centavos: number): string {
  return `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseRangeFromQuery(desde?: string, hasta?: string): { from: Date; to: Date } {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const from = desde ? new Date(desde) : defaultFrom;
  const to   = hasta ? new Date(hasta + 'T23:59:59') : defaultTo;
  return { from, to };
}

export default async function VentasGeneralesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  // Verificar permiso reportes:ver para acceder al reporte
  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!userCan(user.platformRole, member?.role, 'reportes:ver')) {
    redirect('/dashboard?error=sin_permiso');
  }

  const params = await searchParams;
  const { from, to } = parseRangeFromQuery(params.desde, params.hasta);

  const data = await getVentasGenerales(teamId, from, to);

  const desdeStr = from.toISOString().slice(0, 10);
  const hastaStr = to.toISOString().slice(0, 10);

  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
        <Link href="/dashboard/reportes" className="hover:text-teal-600">Reportes</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>Ventas</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-teal-600 font-medium">Ventas generales</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ventas generales</h1>
          <p className="text-sm text-gray-500 mt-1">
            Obtén una visión detallada de tus ventas y devoluciones para diseñar estrategias comerciales.
          </p>
        </div>
        <a
          href={`/api/reportes/ventas-generales/export?desde=${desdeStr}&hasta=${hastaStr}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="h-4 w-4" />
          Descargar
        </a>
      </div>

      {/* Filtros */}
      <form method="get" className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              name="desde"
              defaultValue={desdeStr}
              className="bg-transparent border-0 focus:outline-none text-sm"
            />
            <span className="text-gray-400">—</span>
            <input
              type="date"
              name="hasta"
              defaultValue={hastaStr}
              className="bg-transparent border-0 focus:outline-none text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg"
          >
            Aplicar
          </button>
        </div>
      </form>

      {/* Stat cards — fórmula: Brutas − Notas crédito = Antes impuestos + Impuestos = Después impuestos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Ventas brutas"      value={data.montos.ventasBrutas}     />
        <StatCard label="Notas crédito"      value={data.montos.notasCredito}      separator="−" />
        <StatCard label="Antes de impuestos" value={data.montos.antesImpuestos}    separator="=" highlight />
        <StatCard label="Impuestos"          value={data.montos.impuestos}         separator="+" />
        <StatCard label="Después de impuestos" value={data.montos.despuesImpuestos} separator="=" highlight />
      </div>

      {/* Total ventas - placeholder por gráfica */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Total ventas</h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <span className="px-3 py-1 text-xs font-medium bg-white rounded shadow-sm">Diario</span>
            <span className="px-3 py-1 text-xs font-medium text-gray-500">Mensual</span>
          </div>
        </div>
        <SimpleBarChart docs={data.documentos} />
      </div>

      {/* Tabla documentos */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Documentos ({data.documentos.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Documento</th>
                <th className="px-4 py-2.5 text-left">Cliente</th>
                <th className="px-4 py-2.5 text-left">Estado</th>
                <th className="px-4 py-2.5 text-left">Creación</th>
                <th className="px-4 py-2.5 text-right">Subtotal</th>
                <th className="px-4 py-2.5 text-right">Impuestos</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.documentos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Sin documentos en este rango.
                  </td>
                </tr>
              ) : data.documentos.map(d => {
                const estado = ESTADO_LABEL[d.estado] ?? { label: d.estado, color: 'bg-gray-100 text-gray-700' };
                const subtotal = d.montoTotal - d.totalItbis;
                return (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/facturas/${d.id}`} className="text-teal-600 hover:text-teal-700 font-medium">
                        {d.encf}
                      </Link>
                      <p className="text-xs text-gray-400">{TIPO_NOMBRE[d.tipoEcf] ?? `Tipo ${d.tipoEcf}`}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900">{d.razonSocialComprador ?? 'Consumidor Final'}</p>
                      {d.rncComprador && <p className="text-xs text-gray-400">{d.rncComprador}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${estado.color}`}>
                        {estado.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtFecha(d.fechaEmision)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtDOP(subtotal)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtDOP(d.totalItbis)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtDOP(d.montoTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  separator,
  highlight,
}: {
  label: string;
  value: number;
  separator?: '+' | '−' | '=';
  highlight?: boolean;
}) {
  return (
    <div className="relative bg-white border border-gray-200 rounded-xl p-4">
      {separator && (
        <span className="absolute -left-2 top-1/2 -translate-y-1/2 hidden lg:flex h-5 w-5 items-center justify-center bg-white border border-gray-200 rounded-full text-gray-500 text-xs font-bold">
          {separator}
        </span>
      )}
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-bold ${highlight ? 'text-gray-900 text-lg' : 'text-gray-700 text-base'}`}>
        {fmtDOP(value)}
      </p>
    </div>
  );
}

/**
 * Mini bar chart CSS-only — agrupa documentos por día y dibuja barras.
 * Sin librería de charts para mantener bundle pequeño.
 */
function SimpleBarChart({
  docs,
}: {
  docs: Array<{ fechaEmision: Date; montoTotal: number }>;
}) {
  if (docs.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Sin datos en este rango.</p>;
  }

  // Agrupar por día
  const byDay = new Map<string, number>();
  for (const d of docs) {
    const key = new Date(d.fechaEmision).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + d.montoTotal);
  }

  const entries = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="flex items-end gap-1 h-40 px-2">
      {entries.map(([day, total]) => {
        const heightPct = (total / max) * 100;
        return (
          <div key={day} className="flex-1 flex flex-col items-center gap-1 group min-w-0">
            <div
              className="w-full bg-teal-500 hover:bg-teal-600 rounded-t transition-colors relative"
              style={{ height: `${heightPct}%`, minHeight: '2px' }}
              title={`${day}: ${fmtDOP(total)}`}
            >
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {fmtDOP(total)}
              </span>
            </div>
            <span className="text-[9px] text-gray-400 truncate w-full text-center">
              {day.slice(8, 10)}/{day.slice(5, 7)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
