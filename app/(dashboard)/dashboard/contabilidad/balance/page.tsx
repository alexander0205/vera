import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { fmtDOP, fechaValidaISO } from '@/lib/utils/format';
import { balanceComprobacion } from '@/lib/contabilidad/reportes';
import { FiltrosPeriodo } from '../_filtros-periodo';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

export const dynamic = 'force-dynamic';

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

/**
 * Balance de comprobación — subpaso 3 del Paso 6.
 *
 * Todas las cuentas con movimientos, sus sumas y sus saldos, más la validación
 * de cuadre que pide el plan. Es el reporte con el que un contador comprueba de
 * un vistazo que la contabilidad no se rompió.
 *
 * Sin ruta de API, por lo mismo que el mayor: el filtrado va por URL y lo
 * resuelve el servidor.
 */
export default async function BalancePage({
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

  const balance = await balanceComprobacion(teamId, { desde, hasta });
  const anomalas = balance.filas.filter((f) => f.anomala);

  const celdaMonto = {
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: '#111827',
  } as const;

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#6b7280' }}>Contabilidad</Typography>
        <ChevronRight style={{ width: 14, height: 14, color: '#6b7280' }} />
        <Typography component="span" sx={{ fontSize: '0.875rem', color: '#0d9488', fontWeight: 500 }}>Balance de comprobación</Typography>
      </Box>

      <Box>
        <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
          Balance de comprobación
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.5 }}>
          Todas las cuentas con movimientos, con lo que entró y lo que salió por
          cada una. Si la contabilidad está bien, las dos columnas de abajo dan
          exactamente lo mismo.
        </Typography>
      </Box>

      <FiltrosPeriodo ruta="/dashboard/contabilidad/balance" periodo={{ desde, hasta }} />

      {/* El cuadre es el punto del reporte, así que se dice arriba y en grande,
          no como una nota al pie que nadie lee. */}
      {balance.filas.length > 0 && (
        balance.cuadra ? (
          <Alert severity="success" icon={<CheckCircle2 style={{ width: 16, height: 16 }} />}>
            <strong>El balance cuadra.</strong> Débitos y créditos suman lo
            mismo: {fmtDOP(balance.totales.debeCents)}.
          </Alert>
        ) : (
          <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
            <AlertTitle sx={{ fontSize: '0.875rem', fontWeight: 600 }}>El balance NO cuadra</AlertTitle>
            <Typography sx={{ fontSize: '0.75rem' }}>
              Débitos {fmtDOP(balance.totales.debeCents)} contra créditos{' '}
              {fmtDOP(balance.totales.haberCents)} · diferencia{' '}
              {fmtDOP(Math.abs(balance.totales.debeCents - balance.totales.haberCents))}.
              Esto no debería poder pasar: la aplicación impide guardar asientos
              descuadrados. Repórtalo antes de usar estos números para declarar.
            </Typography>
          </Alert>
        )
      )}

      {anomalas.length > 0 && (
        <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
          <AlertTitle sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
            {anomalas.length} cuenta(s) con saldo del lado contrario al esperado
          </AlertTitle>
          <Typography sx={{ fontSize: '0.75rem' }}>
            No es necesariamente un error —una cuenta de banco puede quedar en
            descubierto— pero conviene mirarlas:{' '}
            {anomalas.map((f) => `${f.codigo} ${f.nombre}`).join(', ')}.
          </Typography>
        </Alert>
      )}

      <Box sx={{ ...CARD, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 860 }}>
            <TableHead>
              <TableRow>
                <TableCell>Cuenta</TableCell>
                <TableCell align="right">Debe</TableCell>
                <TableCell align="right">Haber</TableCell>
                <TableCell align="right">Saldo deudor</TableCell>
                <TableCell align="right">Saldo acreedor</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {balance.filas.map((f) => (
                <TableRow key={f.cuentaId} hover>
                  <TableCell>
                    <Box
                      component="a"
                      href={`/dashboard/contabilidad/mayor?cuentaId=${f.cuentaId}${
                        desde ? `&desde=${desde}` : ''}${hasta ? `&hasta=${hasta}` : ''}`}
                      sx={{ color: '#111827', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                      <Box component="span" sx={{ fontFamily: 'monospace', color: '#6b7280' }}>{f.codigo}</Box>{' '}
                      {f.nombre}
                    </Box>
                    {f.anomala && (
                      <Box component="span" sx={{
                        ml: 1, display: 'inline-block', fontSize: '0.75rem', fontWeight: 500,
                        px: 1, py: 0.25, borderRadius: '4px', whiteSpace: 'nowrap',
                        bgcolor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a',
                      }}>
                        saldo invertido
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={celdaMonto}>
                    {f.debeCents > 0 ? fmtDOP(f.debeCents) : ''}
                  </TableCell>
                  <TableCell align="right" sx={celdaMonto}>
                    {f.haberCents > 0 ? fmtDOP(f.haberCents) : ''}
                  </TableCell>
                  <TableCell align="right" sx={celdaMonto}>
                    {f.saldoDeudorCents > 0 ? fmtDOP(f.saldoDeudorCents) : ''}
                  </TableCell>
                  <TableCell align="right" sx={celdaMonto}>
                    {f.saldoAcreedorCents > 0 ? fmtDOP(f.saldoAcreedorCents) : ''}
                  </TableCell>
                </TableRow>
              ))}

              {balance.filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 6, textAlign: 'center', color: '#9ca3af' }}>
                    {desde || hasta ? (
                      'Ninguna cuenta tuvo movimientos en el periodo elegido.'
                    ) : (
                      <>
                        Todavía no hay movimientos que balancear.{' '}
                        <Box component="a" href="/dashboard/contabilidad/libro-diario" sx={{ fontWeight: 500, textDecoration: 'underline', color: 'inherit' }}>
                          Genera los asientos en el libro diario
                        </Box>{' '}
                        y vuelve.
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )}

              {balance.filas.length > 0 && (
                <TableRow sx={{ borderTop: '2px solid #d1d5db', bgcolor: '#f9fafb', '& td': { fontWeight: 600 } }}>
                  <TableCell sx={{ color: '#374151' }}>Totales</TableCell>
                  <TableCell align="right" sx={celdaMonto}>{fmtDOP(balance.totales.debeCents)}</TableCell>
                  <TableCell align="right" sx={celdaMonto}>{fmtDOP(balance.totales.haberCents)}</TableCell>
                  <TableCell align="right" sx={celdaMonto}>{fmtDOP(balance.totales.saldoDeudorCents)}</TableCell>
                  <TableCell align="right" sx={celdaMonto}>{fmtDOP(balance.totales.saldoAcreedorCents)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
        Solo aparecen las cuentas que tuvieron movimientos. Las columnas de saldo
        son la resta de las dos anteriores: cada cuenta cae en una sola de ellas.
        Pulsa una cuenta para ver su mayor.
      </Typography>
    </Box>
  );
}
