'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight, ChevronDown, RefreshCw, AlertTriangle,
  FileText, Banknote, Undo2, Ban, X, PenLine, ShoppingCart, Wallet, TrendingDown, Landmark, Lock,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import type { AsientoResumen, LineaDetalle, OrigenTipo } from '@/lib/contabilidad/libro-diario';

export interface FiltrosUI {
  origenTipo?: OrigenTipo;
  desde?:      string;
  hasta?:      string;
  cuentaId?:   number;
  pagina:      number;
}

const CARD = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px' } as const;

function dop(cents: number) {
  return (cents / 100).toLocaleString('es-DO', {
    style: 'currency', currency: 'DOP', minimumFractionDigits: 2,
  });
}

function fecha(f: string) {
  // `f` ya viene 'YYYY-MM-DD' desde SQL, sin componente horario: se parte a mano
  // en vez de pasar por Date, que lo interpretaría como UTC y podría restar un
  // día al mostrarlo en hora RD.
  const [a, m, d] = f.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d} ${meses[Number(m) - 1]} ${a}`;
}

/**
 * Los cuatro orígenes de un asiento. La nota de crédito y la anulación se
 * colorean distinto a propósito: son los que RESTAN, y conviene distinguirlos de
 * un vistazo al leer el libro.
 */
const ORIGEN: Record<string, { label: string; icono: React.ReactNode; bg: string; fg: string; border: string }> = {
  factura:   { label: 'Factura', icono: <FileText style={{ width: 12, height: 12 }} />,
               bg: '#f9fafb', fg: '#4b5563', border: '#e5e7eb' },
  pago:      { label: 'Cobro', icono: <Banknote style={{ width: 12, height: 12 }} />,
               bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  nota:      { label: 'Nota de crédito', icono: <Undo2 style={{ width: 12, height: 12 }} />,
               bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
  anulacion: { label: 'Anulación', icono: <Ban style={{ width: 12, height: 12 }} />,
               bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
  manual:    { label: 'Manual', icono: <PenLine style={{ width: 12, height: 12 }} />,
               bg: '#eef2ff', fg: '#4338ca', border: '#c7d2fe' },
  compra:    { label: 'Compra', icono: <ShoppingCart style={{ width: 12, height: 12 }} />,
               bg: '#f0f9ff', fg: '#0369a1', border: '#bae6fd' },
  gasto_caja:{ label: 'Gasto de caja', icono: <Wallet style={{ width: 12, height: 12 }} />,
               bg: '#fdf4ff', fg: '#a21caf', border: '#f5d0fe' },
  gasto_doc: { label: 'Gasto', icono: <Wallet style={{ width: 12, height: 12 }} />,
               bg: '#faf5ff', fg: '#7e22ce', border: '#e9d5ff' },
  depreciacion:{ label: 'Depreciación', icono: <TrendingDown style={{ width: 12, height: 12 }} />,
               bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' },
  pago_proveedor:{ label: 'Pago a proveedor', icono: <Landmark style={{ width: 12, height: 12 }} />,
               bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
  cierre:    { label: 'Cierre de ejercicio', icono: <Lock style={{ width: 12, height: 12 }} />,
               bg: '#f5f3ff', fg: '#6d28d9', border: '#ddd6fe' },
};
const ORIGEN_FALLBACK = { bg: '#f9fafb', fg: '#4b5563', border: '#e5e7eb' };

/** Los motivos que devuelve el barrido, en lenguaje de usuario. */
const MOTIVO_TEXTO: Record<string, string> = {
  'contabilidad-apagada':    'la contabilidad automática está apagada',
  'ya-tiene-asiento':        'ya tenían asiento',
  'no-es-venta':             'no son ventas emitidas',
  'sin-monto':               'no tienen monto',
  'sin-cuenta-por-cobrar':   'falta configurar la cuenta por cobrar',
  'sin-cuenta-itbis':        'falta configurar la cuenta de ITBIS',
  'sin-cuenta-ingresos':     'falta configurar la cuenta de ingresos',
  'sin-cuenta-cobro':        'falta configurar la cuenta de esa forma de cobro',
  'sin-cuenta-mora':         'falta configurar la cuenta de ingresos por mora',
  'sin-cuenta-descuentos':   'falta configurar la cuenta de descuentos',
  'sin-cuenta-saldos-favor': 'falta configurar la cuenta de saldos a favor',
  'sin-cuenta-retenciones':  'falta configurar la cuenta de retenciones por cobrar',
  'sin-asiento-que-reversar':'se anularon antes de tener asiento, así que no hay nada que reversar',
  'no-esta-anulado':         'no están anulados',
  'nc-solo-texto':           'solo corrigen texto, sin efecto monetario',
  'sin-cuenta-inventario':   'falta configurar la cuenta de inventario',
  'sin-cuenta-itbis-adelantado': 'falta la cuenta 1104 de ITBIS adelantado',
  'sin-cuenta-por-pagar':    'falta configurar la cuenta por pagar',
  'sin-cuenta-gastos':       'falta configurar la cuenta de gastos de caja',
  'sin-cuenta-caja':         'falta configurar la cuenta de caja/efectivo',
  'no-es-gasto':             'no son compras ni gastos de caja',
};

export function LibroDiarioClient({
  asientosIniciales, total, sumaCents, pendientes, descuadrados, activa, puedeGenerar,
  cuentas, filtros, pageSize,
}: {
  asientosIniciales: AsientoResumen[];
  total:        number;
  sumaCents:    number;
  pendientes:   number;
  descuadrados: { id: number; concepto: string; debe: number; haber: number }[];
  activa:       boolean;
  puedeGenerar: boolean;
  cuentas:      { id: number; codigo: string; nombre: string }[];
  filtros:      FiltrosUI;
  pageSize:     number;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  const [abierto, setAbierto] = useState<number | null>(null);
  const [lineas, setLineas] = useState<Record<number, LineaDetalle[]>>({});
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hayFiltro = Boolean(
    filtros.origenTipo || filtros.desde || filtros.hasta || filtros.cuentaId,
  );
  const paginas = Math.max(1, Math.ceil(total / pageSize));

  /**
   * Reescribe la URL con los filtros nuevos.
   *
   * **Cambiar un filtro vuelve a la página 1 en el mismo paso**, salvo cuando lo
   * que se cambia es la página. Separarlo en un efecto aparte fue justo el bug
   * del Paso 1: disparaba dos consultas, y con suerte dejaba al usuario en una
   * página 3 que ya no existía tras filtrar.
   */
  function navegar(cambios: Partial<FiltrosUI>) {
    const siguiente = { ...filtros, ...cambios };
    if (cambios.pagina === undefined) siguiente.pagina = 1;

    const qs = new URLSearchParams();
    if (siguiente.origenTipo) qs.set('origenTipo', siguiente.origenTipo);
    if (siguiente.desde)      qs.set('desde', siguiente.desde);
    if (siguiente.hasta)      qs.set('hasta', siguiente.hasta);
    if (siguiente.cuentaId)   qs.set('cuentaId', String(siguiente.cuentaId));
    if (siguiente.pagina > 1) qs.set('pagina', String(siguiente.pagina));

    // Se cierra el detalle abierto: tras filtrar, ese asiento puede no estar en
    // la lista nueva y quedaría un desplegable colgando de una fila que ya no es.
    setAbierto(null);

    const url = qs.toString()
      ? `/dashboard/contabilidad/libro-diario?${qs}`
      : '/dashboard/contabilidad/libro-diario';
    startTransition(() => router.push(url));
  }

  async function alternar(id: number) {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    if (lineas[id]) return;

    const res = await fetch(`/api/contabilidad/libro-diario/${id}`);
    if (!res.ok) { setError('No se pudieron cargar los apuntes.'); return; }
    const { lineas: ls } = await res.json();
    setLineas((prev) => ({ ...prev, [id]: ls }));
  }

  async function generar() {
    setGenerando(true);
    setError(null);
    setAviso(null);

    const res = await fetch('/api/contabilidad/libro-diario', { method: 'POST' });
    setGenerando(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? 'No se pudieron generar los asientos.');
      return;
    }

    const r = await res.json();
    const partes: string[] = [];
    if (r.creados > 0) partes.push(`Se generaron ${r.creados} asiento(s).`);
    else partes.push('No había nada nuevo que asentar.');

    // Los motivos importan: "saltó 8" sin decir por qué no sirve de nada.
    const motivos = Object.entries(r.motivos ?? {}) as [string, number][];
    if (motivos.length > 0) {
      partes.push(
        'Se saltaron: ' +
        motivos.map(([m, n]) => `${n} porque ${MOTIVO_TEXTO[m] ?? m}`).join('; ') + '.',
      );
    }
    if (r.hayMas) partes.push('Quedan más pendientes: vuelve a pulsar para seguir.');

    // Un fallo no es un salto: el resto del barrido siguió, pero esos
    // documentos se quedaron sin asiento y alguien tiene que ir a mirarlos.
    const fallidos = (r.fallidos ?? []) as { origenTipo: string; origenId: number }[];
    if (fallidos.length > 0) {
      partes.push(
        `${fallidos.length} dieron error y no se asentaron: ` +
        fallidos.slice(0, 5).map((f) => `${f.origenTipo} #${f.origenId}`).join(', ') +
        (fallidos.length > 5 ? '…' : '') + '.',
      );
    }

    setAviso(partes.join(' '));
    startTransition(() => router.refresh());
  }

  const celdaMonto = {
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
  } as const;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {aviso && <Alert severity="info">{aviso}</Alert>}

      {/* Si esto aparece alguna vez, hay un bug: la aplicación impide guardar
          asientos descuadrados. Se muestra para que se vea antes de que
          contamine un reporte, no para que el usuario lo arregle. */}
      {descuadrados.length > 0 && (
        <Alert severity="error" icon={<AlertTriangle style={{ width: 16, height: 16 }} />}>
          <AlertTitle sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
            {descuadrados.length} asiento(s) descuadrado(s)
          </AlertTitle>
          <Typography sx={{ fontSize: '0.75rem' }}>
            Esto no debería poder pasar. Repórtalo antes de usar estos números
            para declarar.
          </Typography>
          <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {descuadrados.slice(0, 5).map((d) => (
              <Box component="li" key={d.id} sx={{ fontSize: '0.75rem' }}>
                #{d.id} {d.concepto}: debe {dop(d.debe)} · haber {dop(d.haber)}
              </Box>
            ))}
          </Box>
        </Alert>
      )}

      {/* Filtros. Los tres que pide el plan: fecha, origen y cuenta. */}
      <Box sx={{ ...CARD, p: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 1.5 }}>
        <TextField
          label="Desde" type="date"
          value={filtros.desde ?? ''}
          onChange={(e) => navegar({ desde: e.target.value || undefined })}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label="Hasta" type="date"
          value={filtros.hasta ?? ''}
          onChange={(e) => navegar({ hasta: e.target.value || undefined })}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label="Origen" select
          value={filtros.origenTipo ?? ''}
          onChange={(e) =>
            navegar({ origenTipo: (e.target.value || undefined) as OrigenTipo | undefined })
          }
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(ORIGEN).map(([clave, o]) => (
            <MenuItem key={clave} value={clave}>{o.label}</MenuItem>
          ))}
        </TextField>

        <TextField
          label="Cuenta" select
          value={filtros.cuentaId ?? ''}
          onChange={(e) => navegar({ cuentaId: Number(e.target.value) || undefined })}
          disabled={cuentas.length === 0}
          sx={{ minWidth: 220, maxWidth: 320 }}
        >
          <MenuItem value="">Todas</MenuItem>
          {cuentas.map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.codigo} · {c.nombre}</MenuItem>
          ))}
        </TextField>

        {hayFiltro && (
          <Button
            type="button" color="inherit"
            onClick={() => navegar({
              desde: undefined, hasta: undefined,
              origenTipo: undefined, cuentaId: undefined,
            })}
            startIcon={<X style={{ width: 16, height: 16 }} />}
            sx={{ color: '#6b7280', '&:hover': { color: '#374151' }, pb: 1 }}
          >
            Quitar filtros
          </Button>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>
          {/* El total y la suma son de TODO lo filtrado, no de esta página. */}
          {total} asiento(s){hayFiltro && ' con estos filtros'}
          {total > 0 && <> · {dop(sumaCents)}</>}
          {pendientes > 0 && (
            <Box component="span" sx={{
              ml: 1, display: 'inline-block', fontSize: '0.75rem', fontWeight: 500,
              px: 1, py: 0.25, borderRadius: '4px',
              bgcolor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a',
            }}>
              {pendientes} sin asentar
            </Box>
          )}
        </Typography>

        {puedeGenerar && (
          <Button
            variant="contained" size="small"
            onClick={generar} disabled={generando || !activa}
            startIcon={
              <RefreshCw
                style={{ width: 16, height: 16 }}
                className={generando ? 'animate-spin' : undefined}
              />
            }
            sx={{ px: 2 }}
          >
            {generando ? 'Generando…' : 'Generar asientos pendientes'}
          </Button>
        )}
      </Box>

      <Box sx={{ ...CARD, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow>
                <TableCell>Fecha</TableCell>
                <TableCell>Concepto</TableCell>
                <TableCell>Origen</TableCell>
                <TableCell align="right">Importe</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {asientosIniciales.map((a) => {
                const o = ORIGEN[a.origenTipo];
                const tono = o ?? ORIGEN_FALLBACK;
                return (
                  // Fragment con key: el elemento externo del map es el que React
                  // necesita identificar, no los <tr> de dentro.
                  <Fragment key={a.id}>
                    <TableRow
                      hover
                      onClick={() => alternar(a.id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap', color: '#4b5563' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          {abierto === a.id
                            ? <ChevronDown style={{ width: 16, height: 16, color: '#9ca3af' }} />
                            : <ChevronRight style={{ width: 16, height: 16, color: '#9ca3af' }} />}
                          {fecha(a.fecha)}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: '#111827' }}>{a.concepto}</TableCell>
                      <TableCell>
                        <Box component="span" sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.75,
                          fontSize: '0.75rem', fontWeight: 500, px: 1, py: 0.25,
                          borderRadius: '4px', whiteSpace: 'nowrap',
                          bgcolor: tono.bg, color: tono.fg, border: `1px solid ${tono.border}`,
                        }}>
                          {o?.icono}
                          {o?.label ?? a.origenTipo}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ ...celdaMonto, fontWeight: 500, color: '#111827' }}>
                        {dop(a.totalCents)}
                      </TableCell>
                    </TableRow>

                    {abierto === a.id && (
                      <TableRow sx={{ bgcolor: '#f9fafb' }}>
                        <TableCell colSpan={4} sx={{ px: 2, py: 1.5 }}>
                          {!lineas[a.id] ? (
                            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              Cargando apuntes…
                            </Typography>
                          ) : (
                            <Table size="small" sx={{ '& td, & th': { fontSize: '0.75rem', border: 0, py: 0.5 } }}>
                              <TableHead>
                                <TableRow>
                                  <TableCell sx={{ color: '#6b7280' }}>Cuenta</TableCell>
                                  <TableCell sx={{ color: '#6b7280' }}>Descripción</TableCell>
                                  <TableCell align="right" sx={{ color: '#6b7280' }}>Debe</TableCell>
                                  <TableCell align="right" sx={{ color: '#6b7280' }}>Haber</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {lineas[a.id].map((l, i) => (
                                  <TableRow key={i} sx={{ borderTop: '1px solid #e5e7eb' }}>
                                    <TableCell sx={{ color: '#374151' }}>
                                      <Box component="span" sx={{ fontFamily: 'monospace', color: '#6b7280' }}>{l.cuentaCodigo}</Box>
                                      {' '}{l.cuentaNombre}
                                    </TableCell>
                                    <TableCell sx={{ color: '#6b7280' }}>{l.descripcion}</TableCell>
                                    <TableCell align="right" sx={{ ...celdaMonto, color: '#111827' }}>
                                      {l.debeCents > 0 ? dop(l.debeCents) : ''}
                                    </TableCell>
                                    <TableCell align="right" sx={{ ...celdaMonto, color: '#111827' }}>
                                      {l.haberCents > 0 ? dop(l.haberCents) : ''}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow sx={{ borderTop: '2px solid #d1d5db', '& td': { fontWeight: 500 } }}>
                                  <TableCell />
                                  <TableCell sx={{ color: '#6b7280' }}>Totales</TableCell>
                                  <TableCell align="right" sx={celdaMonto}>
                                    {dop(lineas[a.id].reduce((s, l) => s + l.debeCents, 0))}
                                  </TableCell>
                                  <TableCell align="right" sx={celdaMonto}>
                                    {dop(lineas[a.id].reduce((s, l) => s + l.haberCents, 0))}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}

              {asientosIniciales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ py: 6, textAlign: 'center', color: '#9ca3af' }}>
                    {/* Distinguir "no hay nada" de "no hay nada que case" evita que
                        el usuario crea que perdió sus asientos por filtrar. */}
                    {hayFiltro ? (
                      <>
                        Ningún asiento coincide con estos filtros.
                        <Box
                          component="button"
                          onClick={() => navegar({
                            desde: undefined, hasta: undefined,
                            origenTipo: undefined, cuentaId: undefined,
                          })}
                          sx={{
                            ml: 0.5, fontWeight: 500, color: '#374151',
                            textDecoration: 'underline', bgcolor: 'transparent',
                            border: 0, cursor: 'pointer', font: 'inherit',
                          }}
                        >
                          Quitar filtros
                        </Box>
                      </>
                    ) : (
                      <>
                        Todavía no hay asientos.
                        {activa && pendientes > 0 && ' Pulsa "Generar asientos pendientes".'}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>

        {/* Paginación. Antes no existía: la pantalla pedía 50 asientos y los
            pintaba, así que a partir del 51 el resto era inalcanzable desde la UI
            aunque la consulta ya soportara offset. */}
        {paginas > 1 && (
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Página {filtros.pagina} de {paginas} · mostrando{' '}
              {(filtros.pagina - 1) * pageSize + 1}–
              {Math.min(filtros.pagina * pageSize, total)} de {total}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined" color="inherit" size="small"
                disabled={filtros.pagina <= 1 || pendiente}
                onClick={() => navegar({ pagina: filtros.pagina - 1 })}
                sx={{ color: '#374151', borderColor: '#d1d5db' }}
              >
                Anterior
              </Button>
              <Button
                variant="outlined" color="inherit" size="small"
                disabled={filtros.pagina >= paginas || pendiente}
                onClick={() => navegar({ pagina: filtros.pagina + 1 })}
                sx={{ color: '#374151', borderColor: '#d1d5db' }}
              >
                Siguiente
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
        Los asientos se generan cuando pulsas el botón, no automáticamente al
        facturar. Se asientan facturas, cobros, notas de crédito, recargos por mora
        y retenciones. Un documento anulado no borra su asiento: genera uno reverso,
        para que el historial contable quede completo.
      </Typography>
    </Box>
  );
}
