import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { fmtDOP } from '@/lib/utils/format';
import { parseRango } from '@/lib/reportes/shared';
import { getPagosPorUsuario } from '@/lib/reportes/queries';
import { ReportShell, KpiCard } from '@/components/reportes/report-shell';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

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
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5, mb: 3 }}>
        <KpiCard label="Total cobrado" value={fmtDOP(total)} tone="marca" />
        <KpiCard label="Usuarios" value={String(filas.length)} />
        <KpiCard label="Top cobrador" value={filas[0]?.nombre ?? '—'} sub={filas[0] ? fmtDOP(filas[0].totalCents) : undefined} />
      </Box>

      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb' }}>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Detalle por usuario ({filas.length})</Typography>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ width: '100%', '& tbody td': { borderBottom: '1px solid #f3f4f6' }, '& tbody tr:last-child td': { borderBottom: 0 } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f9fafb' }}>
                {([['#', 'left'], ['Usuario', 'left'], ['Pagos', 'right'], ['Cobrado', 'right'], ['%', 'right']] as const).map(([h, align]) => (
                  <TableCell key={h} align={align} sx={{ px: 2, py: 1.25, fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.length === 0 ? (
                <TableRow><TableCell colSpan={5} sx={{ px: 2, py: 4, textAlign: 'center', color: '#9ca3af' }}>Sin cobros en este rango.</TableCell></TableRow>
              ) : filas.map((f, i) => (
                <TableRow key={f.usuarioId ?? `nn-${i}`} sx={{ '&:hover': { bgcolor: '#f9fafb' } }}>
                  <TableCell sx={{ px: 2, py: 1.5, color: '#9ca3af' }}>{i + 1}</TableCell>
                  <TableCell sx={{ px: 2, py: 1.5, color: '#111827', fontWeight: 500 }}>{f.nombre}</TableCell>
                  <TableCell align="right" sx={{ px: 2, py: 1.5, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{f.numPagos}</TableCell>
                  <TableCell align="right" sx={{ px: 2, py: 1.5, color: '#111827', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(f.totalCents)}</TableCell>
                  <TableCell align="right" sx={{ px: 2, py: 1.5, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? Math.round(f.totalCents / total * 100) : 0}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </ReportShell>
  );
}
