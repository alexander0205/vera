import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { getAgingCxC } from '@/lib/reportes/queries';
import { ReportShell, KpiCard, Panel } from '@/components/reportes/report-shell';
import { AgingChart } from '@/components/reportes/charts';

const CUBETA_LABEL: Record<string, { label: string; color: string }> = {
  porVencer: { label: 'Por vencer', color: 'bg-teal-100 text-teal-700' },
  '0-30':    { label: '0-30 días',  color: 'bg-green-100 text-green-700' },
  '31-60':   { label: '31-60 días', color: 'bg-yellow-100 text-yellow-700' },
  '61-90':   { label: '61-90 días', color: 'bg-orange-100 text-orange-700' },
  '90+':     { label: '+90 días',   color: 'bg-red-100 text-red-700' },
};

export default async function CuentasPorCobrarPage() {
  await requirePermission('reportes:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const aging = await getAgingCxC(teamId);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <ReportShell
      titulo="Cuentas por cobrar"
      descripcion="Antigüedad de saldos (aging) de la cartera abierta. Snapshot al día de hoy."
      migaja="Cuentas por cobrar"
      desde={hoy}
      hasta={hoy}
      exportHref={`/api/reportes/export?report=cuentas-por-cobrar`}
    >
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Total por cobrar" value={fmtDOP(aging.totalCents)} tone="teal" />
        <KpiCard label="Por vencer" value={fmtDOP(aging.buckets.porVencer)} />
        <KpiCard label="0-30 días" value={fmtDOP(aging.buckets['0-30'])} />
        <KpiCard label="31-60 días" value={fmtDOP(aging.buckets['31-60'])} tone="amber" />
        <KpiCard label="61-90 días" value={fmtDOP(aging.buckets['61-90'])} tone="amber" />
        <KpiCard label="+90 días" value={fmtDOP(aging.buckets['90+'])} tone={aging.buckets['90+'] > 0 ? 'red' : 'default'} />
      </div>

      <Panel titulo="Distribución de la cartera por antigüedad">
        <AgingChart buckets={aging.buckets} />
      </Panel>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Facturas pendientes ({aging.filas.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Documento</th>
                <th className="px-4 py-2.5 text-left">Cliente</th>
                <th className="px-4 py-2.5 text-left">Vence</th>
                <th className="px-4 py-2.5 text-right">Días</th>
                <th className="px-4 py-2.5 text-center">Antigüedad</th>
                <th className="px-4 py-2.5 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {aging.filas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin cartera pendiente. 🎉</td></tr>
              ) : aging.filas.map(f => {
                const c = CUBETA_LABEL[f.cubeta];
                return (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/facturas/${f.id}`} className="text-teal-600 hover:text-teal-700 font-medium">{f.encf}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{f.cliente}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtFechaCorta(f.fechaLimite)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{f.diasVencido > 0 ? f.diasVencido : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>{c.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtDOP(f.saldoCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
