import { redirect } from 'next/navigation';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { fmtDOP, fechaValidaISO } from '@/lib/utils/format';
import { estadoResultados, type SeccionResultado } from '@/lib/contabilidad/estado-resultados';
import { FiltrosPeriodo } from '../_filtros-periodo';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

export const dynamic = 'force-dynamic';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

/**
 * Estado de resultados — subpaso 4 del Paso 6.
 *
 * Ingresos − costos − gastos = ganancia o pérdida del periodo. Sale de los
 * mismos asientos que el balance; la lógica de agrupación vive en
 * `lib/contabilidad/estado-resultados.ts`.
 *
 * Sin ruta de API para la vista: el periodo va por URL y lo resuelve el
 * servidor, como el resto de los reportes contables.
 */
export default async function EstadoResultadosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission('contabilidad:ver');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const sp = await searchParams;
  const desde = fechaValidaISO(sp.desde);
  const hasta = fechaValidaISO(sp.hasta);

  const er = await estadoResultados(teamId, { desde, hasta });

  const celdaMonto = {
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: '#111827',
  } as const;

  const qs = new URLSearchParams();
  if (desde) qs.set('desde', desde);
  if (hasta) qs.set('hasta', hasta);
  const exportHref = `/api/contabilidad/estado-resultados/export${qs.toString() ? `?${qs}` : ''}`;

  /** Bloque de una sección (Ingresos, Costos, Gastos) con su total. */
  const Seccion = ({ titulo, seccion, signo }: {
    titulo: string; seccion: SeccionResultado; signo: '+' | '−';
  }) => (
    <>
      <TableRow sx={{ bgcolor: '#f9fafb' }}>
        <TableCell sx={{ fontWeight: 600, color: '#374151' }}>{titulo}</TableCell>
        <TableCell align="right" sx={{ ...celdaMonto, fontWeight: 600 }}>
          {seccion.lineas.length > 0 ? `${signo} ${fmtDOP(seccion.totalCents)}` : '—'}
        </TableCell>
      </TableRow>
      {seccion.lineas.map((l) => (
        <TableRow key={l.cuentaId} hover>
          <TableCell sx={{ pl: 4 }}>
            <Box component="a"
              href={`/dashboard/contabilidad/mayor?cuentaId=${l.cuentaId}${desde ? `&desde=${desde}` : ''}${hasta ? `&hasta=${hasta}` : ''}`}
              sx={{ color: '#111827', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              <Box component="span" sx={{ fontFamily: 'monospace', color: '#6b7280' }}>{l.codigo}</Box>{' '}
              {l.nombre}
            </Box>
          </TableCell>
          <TableCell align="right" sx={celdaMonto}>{fmtDOP(l.montoCents)}</TableCell>
        </TableRow>
      ))}
    </>
  );

  const utilidad = er.utilidadNetaCents >= 0;

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1000, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#3658e1', fontWeight: 500 }}>Estado de resultados</Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
            Estado de resultados
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
            Cuánto ganó o perdió el negocio en el periodo: lo que ingresó menos lo
            que costó y lo que se gastó.
          </Typography>
        </Box>
        {er.hayDatos && (
          <Box component="a" href={exportHref}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.8125rem', fontWeight: 500,
              px: 1.75, py: 1, borderRadius: '8px', textDecoration: 'none',
              color: '#2a45c4', bgcolor: '#eef2fe', border: '1px solid #c7d2fc',
              '&:hover': { bgcolor: '#e0e7fd' } }}
          >
            Exportar a Excel
          </Box>
        )}
      </Box>

      <FiltrosPeriodo ruta="/dashboard/contabilidad/estado-resultados" periodo={{ desde, hasta }} />

      <Box sx={{ ...CARD, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 520 }}>
            <TableBody>
              {er.hayDatos ? (
                <>
                  <Seccion titulo="Ingresos" seccion={er.ingresos} signo="+" />

                  {/* Utilidad bruta: se muestra solo si hay costos que la separen
                      de la utilidad neta, para no repetir la misma cifra dos veces. */}
                  {er.costos.lineas.length > 0 && (
                    <>
                      <Seccion titulo="Costos" seccion={er.costos} signo="−" />
                      <TableRow sx={{ borderTop: '1px solid #e5e7eb' }}>
                        <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Utilidad bruta</TableCell>
                        <TableCell align="right" sx={{ ...celdaMonto, fontWeight: 600 }}>
                          {fmtDOP(er.utilidadBrutaCents)}
                        </TableCell>
                      </TableRow>
                    </>
                  )}

                  <Seccion titulo="Gastos" seccion={er.gastos} signo="−" />

                  <TableRow sx={{ borderTop: '2px solid #d1d5db', bgcolor: utilidad ? '#f0fdf4' : '#fef2f2' }}>
                    <TableCell sx={{ fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 1 }}>
                      {utilidad
                        ? <TrendingUp style={{ width: 18, height: 18, color: '#16a34a' }} />
                        : <TrendingDown style={{ width: 18, height: 18, color: '#dc2626' }} />}
                      {utilidad ? 'Utilidad neta del periodo' : 'Pérdida neta del periodo'}
                    </TableCell>
                    <TableCell align="right" sx={{ ...celdaMonto, fontWeight: 700, color: utilidad ? '#15803d' : '#b91c1c' }}>
                      {fmtDOP(er.utilidadNetaCents)}
                    </TableCell>
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableCell colSpan={2} sx={{ py: 6, textAlign: 'center', color: '#9ca3af' }}>
                    {desde || hasta
                      ? 'No hubo ingresos ni gastos en el periodo elegido.'
                      : (
                        <>
                          Todavía no hay ingresos ni gastos registrados.{' '}
                          <Box component="a" href="/dashboard/contabilidad/libro-diario" sx={{ fontWeight: 500, textDecoration: 'underline', color: 'inherit' }}>
                            Genera los asientos
                          </Box>{' '}
                          y vuelve.
                        </>
                      )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
        Los descuentos y devoluciones sobre ventas restan de los ingresos, así que
        aparecen en negativo dentro de esa sección. La utilidad neta es lo que
        queda después de todo.
      </Typography>
    </Box>
  );
}
