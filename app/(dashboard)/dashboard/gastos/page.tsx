/**
 * GASTOS — todos los egresos del mes en una sola lista:
 *
 *   - gastos registrados con el comprobante del proveedor (B01, E31…), que
 *     van al 606, adelantan ITBIS y llevan retenciones (compras_locales, clase
 *     'gasto');
 *   - gastos menores (e43) y pagos al exterior (e47), comprobantes que emite la
 *     propia empresa (ecf_documents).
 *
 * Compras de inventario tienen su propia pantalla.
 */
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Receipt, ArrowUpRight } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { requirePermission } from '@/lib/auth/page-guard';
import { getTeamIdForUser } from '@/lib/db/queries';
import { fmtDOP, fmtFechaCorta, hoyRD } from '@/lib/utils/format';
import { rangoDelMes } from '@/lib/nomina/periodos';
import { listarCompras, listarGastosEcf, resumenGastos } from '@/lib/compras/consultas';
import { analizarNcf } from '@/lib/compras/fiscal';
import { NuevoGasto } from './_nuevo-gasto';
import { SelectorMes } from './_selector-mes';
import { EnlaceFotos } from './_enlace-fotos';
import { SubirComprobante } from '@/components/compras/subir-comprobante';
import { BandejaCapturas } from './_bandeja-capturas';
import { PaginadorGastos } from './_paginador';
import { compararGastos, paginaDe } from '@/lib/compras/orden-gastos';
import { listarCapturas } from '@/lib/compras/captura/consultas';

const METODO_LABEL: Record<string, string> = {
  efectivo: 'efectivo', transferencia: 'transferencia', tarjeta: 'tarjeta',
  cheque: 'cheque', deposito: 'depósito', otro: 'otro método',
};

interface Fila {
  key: string;
  /** De qué tabla sale y con qué id: con eso se ordena igual que la consulta. */
  fuente: 'r' | 'e';
  id: number;
  fecha: string;
  proveedor: string;
  rnc: string | null;
  comprobante: string | null;
  tipo: string;
  categoria: string;
  href: string;
  anulado: boolean;
  borrador: boolean;
  pagado: boolean;
  saldoCents: number;
  metodo: string | null;
  cuenta: string | null;
  retencionesCents: number;
  montoCents: number;
}

function Chip({ label, bg, color, icon }: { label: string; bg: string; color: string; icon?: ReactNode }) {
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.25, px: 1, py: '2px', borderRadius: '999px',
      fontSize: '0.6875rem', fontWeight: 600, bgcolor: bg, color, whiteSpace: 'nowrap',
    }}>{icon}{label}</Box>
  );
}

// Un gasto pagado NO va en verde: el verde en la app es dinero que ENTRA. Neutro
// con flecha de salida; lo que falta por pagar, en ámbar.
function EstadoPago({ f }: { f: Fila }) {
  if (f.anulado) return <Chip label="Anulado" bg="#f3f4f6" color="#6b7280" />;
  if (!f.pagado) {
    return (
      <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
        <Chip label="Por pagar" bg="#fffbeb" color="#b45309" />
        {f.saldoCents > 0 && <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{fmtDOP(f.saldoCents)}</Typography>}
      </Box>
    );
  }
  const origen = f.metodo ? `${METODO_LABEL[f.metodo] ?? f.metodo}${f.cuenta ? ` · ${f.cuenta}` : ''}` : null;
  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
      <Chip label="Pagado" bg="#f1f5f9" color="#475569" icon={<ArrowUpRight size={11} />} />
      {origen && <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>Salió de {origen}</Typography>}
    </Box>
  );
}

function Tarjeta({ titulo, valor, sub, destacado }: { titulo: string; valor: string; sub?: string; destacado?: boolean }) {
  return (
    <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', p: 1.75, bgcolor: destacado ? '#eef2fe' : '#fff', minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</Typography>
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: destacado ? '#2a45c4' : '#111827', whiteSpace: 'nowrap' }}>{valor}</Typography>
      {sub && <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{sub}</Typography>}
    </Box>
  );
}

/** Cuántos gastos por página. Lo bastante para una pantalla, no para la base. */
const POR_PAGINA = 50;

export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string; p?: string }> }) {
  await requirePermission('facturas:ver');
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard');

  const hoy = hoyRD();
  const sp = await searchParams;
  // Sin `mes` se enseñan todos. Antes el mes actual era el valor por defecto y
  // un gasto de otro mes no aparecía, como si no se hubiera guardado.
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : null;
  const rango = mes ? rangoDelMes(mes) : null;
  const inicio = rango?.inicio;
  const fin = rango?.fin;
  const pagina = Math.max(1, Number(sp.p) || 1);

  // De cada fuente se piden solo las filas que hacen falta para llegar al final
  // de esta página. Se juntan y se ordenan aquí porque son dos tablas
  // distintas; pedir el rango entero para enseñar cincuenta filas era lo que
  // había que evitar.
  const hastaFila = pagina * POR_PAGINA;
  const [registrados, emitidos, porRevisar, resumen] = await Promise.all([
    listarCompras(teamId, { clase: 'gasto', desde: inicio, hasta: fin, limit: hastaFila }),
    listarGastosEcf(teamId, inicio, fin, hastaFila),
    listarCapturas(teamId, ['procesando', 'por_revisar']),
    resumenGastos(teamId, { desde: inicio, hasta: fin }),
  ]);

  const filas: Fila[] = [
    ...registrados.map((g): Fila => {
      const info = analizarNcf(g.ncf);
      return {
        key: `r${g.id}`, fuente: 'r', id: g.id, fecha: g.fecha, proveedor: g.proveedorNombre ?? 'Sin proveedor', rnc: g.proveedorRnc,
        comprobante: g.ncf, tipo: info.valido ? `${info.nombre}` : 'Comprobante', categoria: g.categoriaLabel ?? '—',
        href: `/dashboard/compras/local/${g.id}`, anulado: g.estado === 'anulada', borrador: false,
        pagado: g.saldoCents === 0, saldoCents: g.saldoCents, metodo: g.formaPago === 'contado' ? g.metodoPago : null, cuenta: null,
        retencionesCents: g.retencionesCents, montoCents: g.montoTotal,
      };
    }),
    ...emitidos.map((g): Fila => ({
      key: `e${g.id}`, fuente: 'e', id: g.id, fecha: g.fecha, proveedor: g.proveedor || 'Sin proveedor', rnc: g.rncProveedor,
      comprobante: g.encf && !g.encf.startsWith('BOR') ? g.encf : g.ncfProveedor,
      tipo: g.tipoEcf === '47' ? 'Pago al exterior (e47)' : 'Gasto menor (e43)', categoria: g.categoriaGasto || '—',
      href: g.estado === 'BORRADOR' ? `/dashboard/facturas/${g.id}/editar` : `/dashboard/facturas/${g.id}`,
      anulado: g.estado === 'ANULADO' || g.estado === 'RECHAZADO', borrador: g.estado === 'BORRADOR',
      pagado: g.saldoCents === 0, saldoCents: g.saldoCents,
      metodo: g.pagoMetodo, cuenta: g.pagoCuenta, retencionesCents: g.totalRetenciones, montoCents: g.montoTotal,
    })),
  ].sort(compararGastos);

  // Lo que toca a esta página, ya mezcladas las dos fuentes.
  const pagadas = paginaDe(filas, pagina, POR_PAGINA);

  // Las tarjetas salen del agregado, no de las filas que se ven: sumar la
  // página daría el gasto de cincuenta filas y lo llamaría el total.
  const { totalCents: total, porPagarCents: porPagar, retencionesCents: retenciones,
    itbisPorAdelantarCents: adelantar, borradores, cantidad, vivas, porCategoria } = resumen;
  const paginas = Math.max(1, Math.ceil(cantidad / POR_PAGINA));

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography component="h1" sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Gastos</Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: '#6b7280', mt: 0.25 }}>
            Todo lo que sale de la empresa que no es inventario: facturas de proveedores, gastos menores y pagos al exterior.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <SelectorMes mes={mes} hoy={hoy} />
          <EnlaceFotos />
          <SubirComprobante />
          <NuevoGasto />
        </Box>
      </Box>

      <BandejaCapturas inicial={porRevisar} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }} data-testid="resumen-gastos">
        <Tarjeta titulo={mes ? 'Gastado en el mes' : 'Gastado en total'} valor={fmtDOP(total)}
          sub={`${vivas} gasto${vivas === 1 ? '' : 's'}`} destacado />
        <Tarjeta titulo="ITBIS por adelantar" valor={fmtDOP(adelantar)} sub="De facturas con crédito fiscal" />
        <Tarjeta titulo="Retenciones" valor={fmtDOP(retenciones)} sub="A pagar a la DGII" />
        <Tarjeta titulo="Por pagar" valor={fmtDOP(porPagar)} sub="Gastos a crédito" />
      </Box>

      {porCategoria.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} data-testid="gastos-por-categoria">
          {porCategoria.map(({ categoria, totalCents }) => (
            <Box key={categoria ?? 'sin'} sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75, px: 1.25, py: 0.5, borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#fff' }}>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>{categoria ?? 'Sin categoría'}</Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827' }}>{fmtDOP(totalCents)}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {borradores > 0 && (
        <Box sx={{ border: '1px solid #fde68a', bgcolor: '#fffbeb', color: '#92400e', borderRadius: '10px', px: 2, py: 1.25, fontSize: '0.8125rem' }}>
          {borradores} gasto{borradores === 1 ? '' : 's'} menor{borradores === 1 ? '' : 'es'} o pago{borradores === 1 ? '' : 's'} al exterior sin emitir: mientras no se emitan a la DGII
          no tienen e-NCF y no cuentan en el 606.
        </Box>
      )}

      <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', bgcolor: '#fff' }}>
        {pagadas.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 6, color: '#9ca3af' }}>
            <Receipt size={28} />
            <Typography sx={{ fontSize: '0.875rem' }}>{mes ? 'No hay gastos en este mes' : 'Todavía no hay gastos'}</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 760 }} data-testid="tabla-gastos">
              <TableHead>
                <TableRow sx={{ '& th': { fontSize: '0.6875rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #e5e7eb', bgcolor: '#f9fafb' } }}>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Proveedor</TableCell>
                  <TableCell>Comprobante</TableCell>
                  <TableCell>Categoría</TableCell>
                  <TableCell align="right">Retenciones</TableCell>
                  <TableCell align="center">Pago</TableCell>
                  <TableCell align="right">Monto</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagadas.map((f) => {
                  const color = f.anulado ? '#9ca3af' : '#374151';
                  return (
                    <TableRow key={f.key} sx={{
                      '&:hover': { bgcolor: '#f9fafb' },
                      '& td': { fontSize: '0.8125rem', color, borderBottom: '1px solid #f3f4f6', py: 1, ...(f.anulado && { textDecoration: 'line-through' }) },
                    }}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtFechaCorta(f.fecha)}</TableCell>
                      <TableCell sx={{ maxWidth: 240 }}>
                        <Link href={f.href} style={{ color: f.anulado ? '#9ca3af' : '#111827', fontWeight: 500, textDecoration: 'none' }}>{f.proveedor}</Link>
                        {f.rnc && <Typography sx={{ fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af' }}>{f.rnc}</Typography>}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{f.comprobante || '—'}</Typography>
                        <Typography sx={{ fontSize: '11px', color: '#9ca3af' }}>{f.borrador ? `${f.tipo} · sin emitir` : f.tipo}</Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{f.categoria}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{f.retencionesCents ? fmtDOP(f.retencionesCents) : '—'}</TableCell>
                      <TableCell align="center"><EstadoPago f={f} /></TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(f.montoCents)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
        <PaginadorGastos pagina={pagina} paginas={paginas} total={cantidad} porPagina={POR_PAGINA} mes={mes} />
      </Box>
    </Box>
  );
}
