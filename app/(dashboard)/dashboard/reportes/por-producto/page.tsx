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
import Chip from '@mui/material/Chip';
import { fmtDOP } from '@/lib/utils/format';
import { parseRango } from '@/lib/reportes/shared';
import { getIngresosPorProducto } from '@/lib/reportes/queries';
import { ReportShell, KpiCard, Panel } from '@/components/reportes/report-shell';
import { ParetoChart } from '@/components/reportes/charts';

const headCellSx = {
  px: 2, py: 1.5, fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', bgcolor: '#f9fafb',
  borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
} as const;
const bodyCellSx = {
  px: 2, py: 1.5, fontSize: '0.875rem', borderBottom: '1px solid #f3f4f6',
} as const;

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
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1.5, mb: 3 }}>
        <KpiCard label="Ingresos (base)" value={fmtDOP(totalIngresos)} sub="sin ITBIS" tone="marca" />
        <KpiCard label="Productos vendidos" value={String(filas.length)} />
        <KpiCard label="Núcleo Pareto (80%)" value={String(nucleoA)} sub="productos clase A" tone="amber" />
        <KpiCard label="Top producto" value={filas[0] ? fmtDOP(filas[0].ingresosCents) : '—'} sub={filas[0]?.nombre} />
      </Box>

      <Panel titulo="Pareto — contribución al ingreso (top 12)">
        <ParetoChart data={filas.map(f => ({ nombre: f.nombre, ingresosCents: f.ingresosCents, pctAcumulado: f.pctAcumulado }))} />
      </Panel>

      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb' }}>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Detalle por producto ({filas.length})
          </Typography>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="left" sx={headCellSx}>Producto</TableCell>
                <TableCell align="left" sx={headCellSx}>Ref.</TableCell>
                <TableCell align="right" sx={headCellSx}>Unidades</TableCell>
                <TableCell align="right" sx={headCellSx}>Facturas</TableCell>
                <TableCell align="right" sx={headCellSx}>Ingresos</TableCell>
                <TableCell align="right" sx={headCellSx}>% acum.</TableCell>
                <TableCell align="center" sx={headCellSx}>Clase</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ ...bodyCellSx, py: 4, color: '#9ca3af', borderBottom: 0 }}>
                    Sin ventas en este rango.
                  </TableCell>
                </TableRow>
              ) : filas.map(f => {
                const clase = f.pctAcumulado <= 0.8 ? 'A' : f.pctAcumulado <= 0.95 ? 'B' : 'C';
                const claseColor = clase === 'A'
                  ? { bgcolor: '#d1fae5', color: '#047857' }
                  : clase === 'B'
                  ? { bgcolor: '#fef3c7', color: '#b45309' }
                  : { bgcolor: '#f3f4f6', color: '#6b7280' };
                return (
                  <TableRow key={f.clave} sx={{ '&:hover': { bgcolor: '#f9fafb' } }}>
                    <TableCell sx={{ ...bodyCellSx, color: '#111827', fontWeight: 500 }}>{f.nombre}</TableCell>
                    <TableCell sx={{ ...bodyCellSx, color: '#9ca3af', fontSize: '0.75rem' }}>{f.referencia ?? '—'}</TableCell>
                    <TableCell align="right" sx={{ ...bodyCellSx, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{f.unidades.toLocaleString('es-DO')}</TableCell>
                    <TableCell align="right" sx={{ ...bodyCellSx, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{f.numFacturas}</TableCell>
                    <TableCell align="right" sx={{ ...bodyCellSx, fontWeight: 500, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(f.ingresosCents)}</TableCell>
                    <TableCell align="right" sx={{ ...bodyCellSx, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{Math.round(f.pctAcumulado * 100)}%</TableCell>
                    <TableCell align="center" sx={bodyCellSx}>
                      <Chip label={clase} size="small" sx={{ ...claseColor, fontSize: '0.6875rem', fontWeight: 600, height: 20, borderRadius: '9999px' }} />
                    </TableCell>
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
