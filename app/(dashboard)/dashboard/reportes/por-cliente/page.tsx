import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { fmtDOP } from '@/lib/utils/format';
import { parseRango } from '@/lib/reportes/shared';
import { getIngresosPorCliente } from '@/lib/reportes/queries';
import { ReportShell, KpiCard } from '@/components/reportes/report-shell';

const headCellSx = {
  px: 2, py: 1.5, fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', bgcolor: '#f9fafb',
  borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
} as const;
const bodyCellSx = {
  px: 2, py: 1.5, fontSize: '0.875rem', borderBottom: '1px solid #f3f4f6',
} as const;

export default async function PorClientePage({
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

  const filas = await getIngresosPorCliente(teamId, desde, hasta, 200);
  const total = filas.reduce((s, f) => s + f.ingresosCents, 0);
  const totalFacturas = filas.reduce((s, f) => s + f.numFacturas, 0);
  const ticketProm = totalFacturas > 0 ? Math.round(total / totalFacturas) : 0;

  return (
    <ReportShell
      titulo="Ingresos por cliente"
      descripcion="Ranking de clientes por facturación en el período."
      migaja="Por cliente"
      desde={d0}
      hasta={d1}
      exportHref={`/api/reportes/export?report=por-cliente&desde=${d0}&hasta=${d1}`}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1.5, mb: 3 }}>
        <KpiCard label="Total facturado" value={fmtDOP(total)} tone="marca" />
        <KpiCard label="Clientes" value={String(filas.length)} />
        <KpiCard label="Cliente top" value={filas[0]?.cliente ?? '—'} sub={filas[0] ? fmtDOP(filas[0].ingresosCents) : undefined} />
        <KpiCard label="Ticket prom." value={ticketProm > 0 ? fmtDOP(ticketProm) : '—'} />
      </Box>

      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb' }}>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Detalle por cliente ({filas.length})
          </Typography>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="left" sx={headCellSx}>#</TableCell>
                <TableCell align="left" sx={headCellSx}>Cliente</TableCell>
                <TableCell align="left" sx={headCellSx}>RNC</TableCell>
                <TableCell align="right" sx={headCellSx}>Facturas</TableCell>
                <TableCell align="right" sx={headCellSx}>Ingresos</TableCell>
                <TableCell align="right" sx={headCellSx}>%</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ ...bodyCellSx, py: 4, color: '#9ca3af', borderBottom: 0 }}>
                    Sin ventas en este rango.
                  </TableCell>
                </TableRow>
              ) : filas.map((f, i) => (
                <TableRow key={`${f.cliente}-${f.rnc ?? i}`} sx={{ '&:hover': { bgcolor: '#f9fafb' } }}>
                  <TableCell sx={{ ...bodyCellSx, color: '#9ca3af' }}>{i + 1}</TableCell>
                  <TableCell sx={{ ...bodyCellSx, color: '#111827', fontWeight: 500 }}>{f.cliente}</TableCell>
                  <TableCell sx={{ ...bodyCellSx, color: '#9ca3af', fontSize: '0.75rem' }}>{f.rnc ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{f.numFacturas}</TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, fontWeight: 500, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(f.ingresosCents)}</TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? Math.round(f.ingresosCents / total * 100) : 0}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </ReportShell>
  );
}
