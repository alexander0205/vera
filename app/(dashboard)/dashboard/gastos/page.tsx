/**
 * Pantalla propia de GASTOS (e43 menores / e47 pagos al exterior).
 * Da a un negocio —tenga o no caja habilitada— dónde ver y sumar sus egresos,
 * sin depender del módulo de Caja. Compras (e41) tiene su propia pantalla.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser, getGastos } from '@/lib/db/queries';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

const TIPO_LABEL: Record<string, string> = {
  '43': 'Gastos menores',
  '47': 'Pagos al exterior',
};

const PAGO_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  PAGADA:    { label: 'Pagado',   bg: '#ecfdf5', color: '#047857' },
  PARCIAL:   { label: 'Parcial',  bg: '#fffbeb', color: '#b45309' },
  PENDIENTE: { label: 'Por pagar', bg: '#fef2f2', color: '#b91c1c' },
};

function PagoBadge({ estado, estadoPago }: { estado: string; estadoPago: string }) {
  if (estado === 'ANULADO' || estado === 'RECHAZADO') {
    return <Chip label="Anulado" bg="#f3f4f6" color="#6b7280" />;
  }
  const s = PAGO_STYLE[estadoPago] ?? PAGO_STYLE.PENDIENTE;
  return <Chip label={s.label} bg={s.bg} color={s.color} />;
}

function Chip({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <Box component="span" sx={{
      display: 'inline-block', px: 1, py: '2px', borderRadius: '999px',
      fontSize: '0.6875rem', fontWeight: 600, bgcolor: bg, color,
    }}>{label}</Box>
  );
}

function fechaGasto(g: { fechaGasto: string | null; createdAt: Date }): string | Date {
  return g.fechaGasto ?? g.createdAt;
}

export default async function GastosPage() {
  await requirePermission('facturas:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard');

  const { docs, totalCents, count, porCategoria } = await getGastos(teamId);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Encabezado */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Gastos</Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mt: 0.25 }}>
            Egresos de la empresa (gastos menores y pagos al exterior). Para reponer inventario, usa Compras.
          </Typography>
        </Box>
        <Link href="/dashboard/gastos/nueva" style={{ textDecoration: 'none' }}>
          <Box component="span" sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.75, bgcolor: '#3658e1', color: '#fff',
            fontSize: '0.875rem', fontWeight: 600, px: 2, py: 1, borderRadius: '8px',
            '&:hover': { bgcolor: '#2a45c4' },
          }}>
            <Plus size={16} /> Nuevo gasto
          </Box>
        </Link>
      </Box>

      {/* Resumen */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        <Card titulo="Total gastado" valor={fmtDOP(totalCents)} destacado />
        <Card titulo="Cantidad de gastos" valor={String(count)} />
        {porCategoria.slice(0, 2).map((c) => (
          <Card key={c.categoria} titulo={c.categoria} valor={fmtDOP(c.totalCents)} sub={`${c.count} gasto${c.count === 1 ? '' : 's'}`} />
        ))}
      </Box>

      {/* Desglose por categoría (si hay más de las que caben en las tarjetas) */}
      {porCategoria.length > 2 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {porCategoria.map((c) => (
            <Box key={c.categoria} sx={{
              display: 'inline-flex', alignItems: 'baseline', gap: 0.75, px: 1.25, py: 0.5,
              borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#fff',
            }}>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{c.categoria}</Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827' }}>{fmtDOP(c.totalCents)}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Tabla */}
      <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', bgcolor: '#fff' }}>
        {docs.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 6, color: '#9ca3af' }}>
            <Receipt size={28} />
            <Typography sx={{ fontSize: '0.875rem' }}>Aún no hay gastos registrados</Typography>
            <Link href="/dashboard/gastos/nueva" style={{ fontSize: '0.8125rem', color: '#3658e1' }}>Registrar el primero</Link>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow sx={{ '& th': { fontSize: '0.6875rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #e5e7eb', bgcolor: '#f9fafb' } }}>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Proveedor</TableCell>
                  <TableCell>NCF</TableCell>
                  <TableCell>Categoría</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell align="center">Pago</TableCell>
                  <TableCell align="right">Monto</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {docs.map((g) => {
                  const href = g.estado === 'BORRADOR'
                    ? `/dashboard/facturas/${g.id}/editar`
                    : `/dashboard/facturas/${g.id}`;
                  const anulado = g.estado === 'ANULADO' || g.estado === 'RECHAZADO';
                  const tdColor = anulado ? '#9ca3af' : '#374151';
                  return (
                    <TableRow key={g.id} sx={{
                      '&:hover': { bgcolor: '#f9fafb' },
                      '& td': { fontSize: '0.8125rem', color: tdColor, borderBottom: '1px solid #f3f4f6', py: 1, ...(anulado && { textDecoration: 'line-through' }) },
                    }}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtFechaCorta(fechaGasto(g))}</TableCell>
                      <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Link href={href} style={{ color: anulado ? '#9ca3af' : '#111827', fontWeight: 500, textDecoration: 'none' }}>
                          {g.proveedor || 'Sin proveedor'}
                        </Link>
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {g.ncfProveedor || '—'}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{g.categoriaGasto || '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', color: '#6b7280' }}>{TIPO_LABEL[g.tipoEcf] ?? g.tipoEcf}</TableCell>
                      <TableCell align="center"><PagoBadge estado={g.estado} estadoPago={g.estadoPago} /></TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: anulado ? '#9ca3af' : '#111827', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtDOP(g.montoTotal)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Card({ titulo, valor, sub, destacado }: { titulo: string; valor: string; sub?: string; destacado?: boolean }) {
  return (
    <Box sx={{
      border: '1px solid #e5e7eb', borderRadius: '12px', p: 1.75, bgcolor: destacado ? '#eef2fe' : '#fff',
      display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0,
    }}>
      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {titulo}
      </Typography>
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: destacado ? '#2a45c4' : '#111827', whiteSpace: 'nowrap' }}>
        {valor}
      </Typography>
      {sub && <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{sub}</Typography>}
    </Box>
  );
}
