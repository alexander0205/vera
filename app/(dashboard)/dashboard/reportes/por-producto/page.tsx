import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { fmtDOP } from '@/lib/utils/format';
import { parseRango } from '@/lib/reportes/shared';
import { getIngresosPorProducto } from '@/lib/reportes/queries';
import { ReportShell, KpiCard, Panel } from '@/components/reportes/report-shell';
import { ParetoChart } from '@/components/reportes/charts';

export default async function PorProductoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  await requirePermission('reportes:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const sp = await searchParams;
  const { desde, hasta } = parseRango(sp.desde, sp.hasta);
  const d0 = desde.toISOString().slice(0, 10);
  const d1 = hasta.toISOString().slice(0, 10);

  const filas = await getIngresosPorProducto(teamId, desde, hasta);
  const totalIngresos = filas.reduce((s, f) => s + f.ingresosCents, 0);
  // Productos que hacen el 80% (regla Pareto A/B/C)
  const nucleoA = filas.filter(f => f.pctAcumulado <= 0.8).length;

  return (
    <ReportShell
      titulo="Ingresos por producto / servicio"
      descripcion="Qué productos generan tus ingresos. Incluye análisis Pareto (80/20)."
      migaja="Por producto"
      desde={d0}
      hasta={d1}
      exportHref={`/api/reportes/export?report=por-producto&desde=${d0}&hasta=${d1}`}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Ingresos (base)" value={fmtDOP(totalIngresos)} sub="sin ITBIS" tone="teal" />
        <KpiCard label="Productos vendidos" value={String(filas.length)} />
        <KpiCard label="Núcleo Pareto (80%)" value={String(nucleoA)} sub="productos clase A" tone="amber" />
        <KpiCard label="Top producto" value={filas[0] ? fmtDOP(filas[0].ingresosCents) : '—'} sub={filas[0]?.nombre} />
      </div>

      <Panel titulo="Pareto — contribución al ingreso (top 12)">
        <ParetoChart data={filas.map(f => ({ nombre: f.nombre, ingresosCents: f.ingresosCents, pctAcumulado: f.pctAcumulado }))} />
      </Panel>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Detalle por producto ({filas.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Producto</th>
                <th className="px-4 py-2.5 text-left">Ref.</th>
                <th className="px-4 py-2.5 text-right">Unidades</th>
                <th className="px-4 py-2.5 text-right">Facturas</th>
                <th className="px-4 py-2.5 text-right">Ingresos</th>
                <th className="px-4 py-2.5 text-right">% acum.</th>
                <th className="px-4 py-2.5 text-center">Clase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin ventas en este rango.</td></tr>
              ) : filas.map(f => {
                const clase = f.pctAcumulado <= 0.8 ? 'A' : f.pctAcumulado <= 0.95 ? 'B' : 'C';
                const claseColor = clase === 'A' ? 'bg-emerald-100 text-emerald-700' : clase === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';
                return (
                  <tr key={f.clave} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{f.nombre}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{f.referencia ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{f.unidades.toLocaleString('es-DO')}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{f.numFacturas}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtDOP(f.ingresosCents)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{Math.round(f.pctAcumulado * 100)}%</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${claseColor}`}>{clase}</span>
                    </td>
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
