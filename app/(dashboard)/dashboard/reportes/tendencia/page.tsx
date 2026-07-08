import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { parseRango, type Granularidad } from '@/lib/reportes/shared';
import { getTendencia } from '@/lib/reportes/queries';
import { ReportShell, Panel } from '@/components/reportes/report-shell';
import { TrendChart } from '@/components/reportes/charts';

const GRANS: [Granularidad, string][] = [['dia', 'Diario'], ['semana', 'Semanal'], ['mes', 'Mensual']];

export default async function TendenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; g?: string }>;
}) {
  await requirePermission('reportes:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const sp = await searchParams;
  const { desde, hasta } = parseRango(sp.desde, sp.hasta);
  const g: Granularidad = sp.g === 'semana' || sp.g === 'mes' ? sp.g : 'dia';
  const d0 = desde.toISOString().slice(0, 10);
  const d1 = hasta.toISOString().slice(0, 10);

  const serie = await getTendencia(teamId, desde, hasta, g);
  const totalIngresos = serie.reduce((s, p) => s + p.ingresosCents, 0);
  const totalFacturas = serie.reduce((s, p) => s + p.numFacturas, 0);

  return (
    <ReportShell
      titulo="Tendencia de ingresos"
      descripcion="Evolución de las ventas en el tiempo. Cambia la granularidad y el rango."
      migaja="Tendencia"
      desde={d0}
      hasta={d1}
      exportHref={`/api/reportes/export?report=tendencia&desde=${d0}&hasta=${d1}&g=${g}`}
    >
      <Panel
        titulo={`Ingresos — ${fmtDOP(totalIngresos)} · ${totalFacturas} facturas`}
        right={
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {GRANS.map(([v, label]) => (
              <Link
                key={v}
                href={`?desde=${d0}&hasta=${d1}&g=${v}`}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${g === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
              >
                {label}
              </Link>
            ))}
          </div>
        }
      >
        <TrendChart data={serie} />
      </Panel>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Detalle por período ({serie.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Período</th>
                <th className="px-4 py-2.5 text-right">Facturas</th>
                <th className="px-4 py-2.5 text-right">ITBIS</th>
                <th className="px-4 py-2.5 text-right">Ingresos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {serie.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Sin datos en este rango.</td></tr>
              ) : serie.map(p => (
                <tr key={p.periodo} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{fmtFechaCorta(p.periodo)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{p.numFacturas}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtDOP(p.itbisCents)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtDOP(p.ingresosCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
