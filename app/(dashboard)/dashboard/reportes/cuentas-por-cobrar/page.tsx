import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { getAgingCxC } from '@/lib/reportes/queries';
import { ReportShell, KpiCard, Panel } from '@/components/reportes/report-shell';
import { AgingChart } from '@/components/reportes/charts';

const CUBETA_LABEL: Record<string, { label: string; bgcolor: string; color: string }> = {
  porVencer: { label: 'Por vencer', bgcolor: '#e0e7fd', color: '#2a45c4' },
  '0-30':    { label: '0-30 días',  bgcolor: '#dcfce7', color: '#15803d' },
  '31-60':   { label: '31-60 días', bgcolor: '#fef9c3', color: '#a16207' },
  '61-90':   { label: '61-90 días', bgcolor: '#ffedd5', color: '#c2410c' },
  '90+':     { label: '+90 días',   bgcolor: '#fee2e2', color: '#b91c1c' },
};

const headCellSx = {
  px: 2, py: 1.5, fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', bgcolor: '#f9fafb',
  borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
} as const;
const bodyCellSx = {
  px: 2, py: 1.5, fontSize: '0.875rem', borderBottom: '1px solid #f3f4f6',
} as const;

export default async function CuentasPorCobrarPage() {
  await requirePermission('reportes:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const aging = await getAgingCxC(teamId);
  const hoy = hoyRD();

  return (
    <ReportShell
      titulo="Cuentas por cobrar"
      descripcion="Antigüedad de saldos (aging) de la cartera abierta. Snapshot al día de hoy."
      migaja="Cuentas por cobrar"
      desde={hoy}
      hasta={hoy}
      exportHref={`/api/reportes/export?report=cuentas-por-cobrar`}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 1.5, mb: 3 }}>
        <KpiCard label="Total por cobrar" value={fmtDOP(aging.totalCents)} tone="marca" />
        <KpiCard label="Por vencer" value={fmtDOP(aging.buckets.porVencer)} />
        <KpiCard label="0-30 días" value={fmtDOP(aging.buckets['0-30'])} />
        <KpiCard label="31-60 días" value={fmtDOP(aging.buckets['31-60'])} tone="amber" />
        <KpiCard label="61-90 días" value={fmtDOP(aging.buckets['61-90'])} tone="amber" />
        <KpiCard label="+90 días" value={fmtDOP(aging.buckets['90+'])} tone={aging.buckets['90+'] > 0 ? 'red' : 'default'} />
      </Box>

      <Panel titulo="Distribución de la cartera por antigüedad">
        <AgingChart buckets={aging.buckets} />
      </Panel>

      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb' }}>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Facturas pendientes ({aging.filas.length})
          </Typography>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="left" sx={headCellSx}>Documento</TableCell>
                <TableCell align="left" sx={headCellSx}>Cliente</TableCell>
                <TableCell align="left" sx={headCellSx}>Vence</TableCell>
                <TableCell align="right" sx={headCellSx}>Días</TableCell>
                <TableCell align="center" sx={headCellSx}>Antigüedad</TableCell>
                <TableCell align="right" sx={headCellSx}>Saldo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {aging.filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ ...bodyCellSx, py: 4, color: '#9ca3af', borderBottom: 0 }}>
                    Sin cartera pendiente. 🎉
                  </TableCell>
                </TableRow>
              ) : aging.filas.map(f => {
                const c = CUBETA_LABEL[f.cubeta];
                return (
                  <TableRow key={f.id} sx={{ '&:hover': { bgcolor: '#f9fafb' } }}>
                    <TableCell sx={bodyCellSx}>
                      <Link href={`/dashboard/facturas/${f.id}`} style={{ color: '#3658e1', fontWeight: 500, textDecoration: 'none' }}>{f.encf}</Link>
                    </TableCell>
                    <TableCell sx={{ ...bodyCellSx, color: '#111827' }}>{f.cliente}</TableCell>
                    <TableCell sx={{ ...bodyCellSx, color: '#374151' }}>{fmtFechaCorta(f.fechaLimite)}</TableCell>
                    <TableCell align="right" sx={{ ...bodyCellSx, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{f.diasVencido > 0 ? f.diasVencido : '—'}</TableCell>
                    <TableCell align="center" sx={bodyCellSx}>
                      <Chip label={c.label} size="small" sx={{ bgcolor: c.bgcolor, color: c.color, fontSize: '0.6875rem', fontWeight: 600, height: 20, borderRadius: '9999px' }} />
                    </TableCell>
                    <TableCell align="right" sx={{ ...bodyCellSx, fontWeight: 500, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(f.saldoCents)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </ReportShell>
  );
}
