import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { fmtDOP } from '@/lib/utils/format';
import { parseRango } from '@/lib/reportes/shared';
import { getVentasPorTipo } from '@/lib/reportes/queries';
import { ReportShell, KpiCard, Panel } from '@/components/reportes/report-shell';
import { DonutChart } from '@/components/reportes/charts';

export default async function PorTipoPage({
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

  const filas = await getVentasPorTipo(teamId, desde, hasta);
  const total = filas.reduce((s, f) => s + f.ingresosCents, 0);

  return (
    <ReportShell
      titulo="Ingresos por tipo de comprobante"
      descripcion="Desglose por tipo de e-CF DGII (e31 crédito fiscal, e32 consumo, notas, etc.)."
      migaja="Por tipo DGII"
      desde={d0}
      hasta={d1}
      exportHref={`/api/reportes/export?report=por-tipo&desde=${d0}&hasta=${d1}`}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total facturado" value={fmtDOP(total)} tone="teal" />
        <KpiCard label="Tipos usados" value={String(filas.length)} />
        <KpiCard label="Tipo principal" value={filas[0]?.nombre ?? '—'} sub={filas[0] ? fmtDOP(filas[0].ingresosCents) : undefined} />
        <KpiCard label="Facturas" value={String(filas.reduce((s, f) => s + f.numFacturas, 0))} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel titulo="Distribución por tipo">
          <DonutChart data={filas.map(f => ({ label: `e${f.tipoEcf}`, valueCents: f.ingresosCents }))} />
        </Panel>
        <Panel titulo="Detalle por tipo">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2.5 text-left">Tipo</th>
                  <th className="px-3 py-2.5 text-right">Facturas</th>
                  <th className="px-3 py-2.5 text-right">ITBIS</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Sin datos.</td></tr>
                ) : filas.map(f => (
                  <tr key={f.tipoEcf} className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <span className="font-medium text-gray-900">e{f.tipoEcf}</span>
                      <p className="text-xs text-gray-400">{f.nombre}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">{f.numFacturas}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{fmtDOP(f.itbisCents)}</td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">{fmtDOP(f.ingresosCents)}</td>
                    <td className="px-3 py-3 text-right text-gray-500">{total > 0 ? Math.round(f.ingresosCents / total * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </ReportShell>
  );
}
