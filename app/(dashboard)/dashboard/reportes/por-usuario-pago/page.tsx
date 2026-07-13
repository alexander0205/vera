import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { fmtDOP } from '@/lib/utils/format';
import { parseRango } from '@/lib/reportes/shared';
import { getPagosPorUsuario } from '@/lib/reportes/queries';
import { ReportShell, KpiCard } from '@/components/reportes/report-shell';

export default async function PorUsuarioPagoPage({
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

  const filas = await getPagosPorUsuario(teamId, desde, hasta);
  const total = filas.reduce((s, f) => s + f.totalCents, 0);

  return (
    <ReportShell
      titulo="Cobros por usuario"
      descripcion="Quién registró cada pago recibido. Ranking por monto cobrado en el período."
      migaja="Cobros por usuario"
      desde={d0}
      hasta={d1}
      exportHref={`/api/reportes/export?report=por-usuario-pago&desde=${d0}&hasta=${d1}`}
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiCard label="Total cobrado" value={fmtDOP(total)} tone="teal" />
        <KpiCard label="Usuarios" value={String(filas.length)} />
        <KpiCard label="Top cobrador" value={filas[0]?.nombre ?? '—'} sub={filas[0] ? fmtDOP(filas[0].totalCents) : undefined} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Detalle por usuario ({filas.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">#</th>
                <th className="px-4 py-2.5 text-left">Usuario</th>
                <th className="px-4 py-2.5 text-right">Pagos</th>
                <th className="px-4 py-2.5 text-right">Cobrado</th>
                <th className="px-4 py-2.5 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin cobros en este rango.</td></tr>
              ) : filas.map((f, i) => (
                <tr key={f.usuarioId ?? `nn-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{f.nombre}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{f.numPagos}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtDOP(f.totalCents)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{total > 0 ? Math.round(f.totalCents / total * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
