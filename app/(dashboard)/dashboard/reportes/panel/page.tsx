import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { fmtDOP } from '@/lib/utils/format';
import { parseRango, METODO_LABEL } from '@/lib/reportes/shared';
import { getKpis, getTendencia, getIngresosPorMetodo } from '@/lib/reportes/queries';
import { ReportShell, KpiCard, Panel } from '@/components/reportes/report-shell';
import { TrendChart, DonutChart } from '@/components/reportes/charts';

export default async function PanelPage({
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

  const [kpis, tendencia, metodos] = await Promise.all([
    getKpis(teamId, desde, hasta),
    getTendencia(teamId, desde, hasta, 'dia'),
    getIngresosPorMetodo(teamId, desde, hasta),
  ]);

  const donut = metodos.map(m => ({ label: METODO_LABEL[m.metodo] ?? m.metodo, valueCents: m.totalCents }));

  return (
    <ReportShell
      titulo="Panel financiero"
      descripcion="Indicadores clave del período: ingresos, ITBIS, cartera y salud fiscal."
      migaja="Panel"
      desde={d0}
      hasta={d1}
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Ingresos netos" value={fmtDOP(kpis.ingresosCents)} sub={`${kpis.numFacturas} facturas`} tone="teal" />
        <KpiCard label="Base imponible" value={fmtDOP(kpis.baseCents)} sub="sin ITBIS" />
        <KpiCard label="ITBIS del período" value={fmtDOP(kpis.itbisCents)} sub="débito fiscal" tone="amber" />
        <KpiCard label="Ticket promedio" value={fmtDOP(kpis.ticketPromedioCents)} />
        <KpiCard label="Por cobrar" value={fmtDOP(kpis.porCobrarCents)} sub="cartera abierta" />
        <KpiCard label="Vencido" value={fmtDOP(kpis.vencidoCents)} sub="cartera en mora" tone={kpis.vencidoCents > 0 ? 'red' : 'default'} />
        <KpiCard label="Aceptación DGII" value={`${Math.round(kpis.tasaAceptacion * 100)}%`} sub="e-CF aceptados" tone="emerald" />
        <KpiCard label="ITBIS a pagar" value={fmtDOP(kpis.itbisCents)} sub="estimado" tone="amber" />
      </div>

      <Panel titulo="Tendencia de ingresos">
        <TrendChart data={tendencia} />
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel titulo="Ingresos por método de pago">
          <DonutChart data={donut} />
        </Panel>
        <Panel titulo="Accesos rápidos">
          <div className="grid gap-2 text-sm">
            <QuickLink href="/dashboard/reportes/tendencia">Tendencia detallada de ingresos</QuickLink>
            <QuickLink href="/dashboard/reportes/por-producto">Ingresos por producto / servicio</QuickLink>
            <QuickLink href="/dashboard/reportes/cuentas-por-cobrar">Cuentas por cobrar (antigüedad)</QuickLink>
            <QuickLink href="/dashboard/reportes/ventas-generales">Ventas generales</QuickLink>
          </div>
        </Panel>
      </div>
    </ReportShell>
  );
}

function QuickLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 hover:border-teal-300 hover:bg-teal-50/40 transition-colors text-gray-700">
      <span>{children}</span>
      <span className="text-teal-600">→</span>
    </a>
  );
}
