import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { fmtDOP } from '@/lib/utils/format';
import { parseRango } from '@/lib/reportes/shared';
import { getVentasPorTipo } from '@/lib/reportes/queries';
import { ReportShell, KpiCard, Panel } from '@/components/reportes/report-shell';
import { DonutChart } from '@/components/reportes/charts';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

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
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1.5, mb: 3 }}>
        <KpiCard label="Total facturado" value={fmtDOP(total)} tone="marca" />
        <KpiCard label="Tipos usados" value={String(filas.length)} />
        <KpiCard label="Tipo principal" value={filas[0]?.nombre ?? '—'} sub={filas[0] ? fmtDOP(filas[0].ingresosCents) : undefined} />
        <KpiCard label="Facturas" value={String(filas.reduce((s, f) => s + f.numFacturas, 0))} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 3 }}>
        <Panel titulo="Distribución por tipo">
          <DonutChart data={filas.map(f => ({ label: `e${f.tipoEcf}`, valueCents: f.ingresosCents }))} />
        </Panel>
        <Panel titulo="Detalle por tipo">
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ width: '100%', '& tbody td': { borderBottom: '1px solid #f3f4f6' }, '& tbody tr:last-child td': { borderBottom: 0 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f9fafb' }}>
                  {([['Tipo', 'left'], ['Facturas', 'right'], ['ITBIS', 'right'], ['Total', 'right'], ['%', 'right']] as const).map(([h, align]) => (
                    <TableCell key={h} align={align} sx={{ px: 1.5, py: 1.25, fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filas.length === 0 ? (
                  <TableRow><TableCell colSpan={5} sx={{ px: 1.5, py: 4, textAlign: 'center', color: '#9ca3af' }}>Sin datos.</TableCell></TableRow>
                ) : filas.map(f => (
                  <TableRow key={f.tipoEcf} sx={{ '&:hover': { bgcolor: '#f9fafb' } }}>
                    <TableCell sx={{ px: 1.5, py: 1.5 }}>
                      <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>e{f.tipoEcf}</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{f.nombre}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ px: 1.5, py: 1.5, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{f.numFacturas}</TableCell>
                    <TableCell align="right" sx={{ px: 1.5, py: 1.5, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(f.itbisCents)}</TableCell>
                    <TableCell align="right" sx={{ px: 1.5, py: 1.5, color: '#111827', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(f.ingresosCents)}</TableCell>
                    <TableCell align="right" sx={{ px: 1.5, py: 1.5, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? Math.round(f.ingresosCents / total * 100) : 0}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Panel>
      </Box>
    </ReportShell>
  );
}
