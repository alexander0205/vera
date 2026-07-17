'use client';

/**
 * /caja/imprimir/[id] — Hoja de cuadre de caja imprimible.
 *
 * - Sin sidebar (usa el layout (print) minimalista).
 * - Abre el diálogo de impresión automáticamente al cargar.
 * - Muestra desglose de cobros por método (efectivo, tarjeta, transferencia, etc.)
 *   más el cuadre de efectivo y los movimientos del turno.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Printer, ArrowLeft, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableFooter from '@mui/material/TableFooter';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Turno {
  id: number;
  numeroCierre:            string | null;
  estado:                  string;
  montoAperturaCentavos:   number;
  efectivoContadoCentavos: number | null;
  montoEsperadoCentavos:   number | null;
  diferenciaCentavos:      number | null;
  cierreObs:               string | null;
  aprobacionObs:           string | null;
  aperturaObs:             string | null;
  aperturaAt:              string;
  cierreSolicitadoAt:      string | null;
  aprobadoAt:              string | null;
}
interface Persona { name: string | null; email: string }
/** `esEfectivo`: sólo ese método llega a la gaveta y entra al cuadre. */
interface PagoMetodo { metodo: string; totalCentavos: number; esEfectivo: boolean }
interface Movimiento {
  id: number;
  tipo: string;
  montoCentavos: number;
  metodo: string;
  descripcion: string | null;
  motivo: string | null;
  createdAt: string;
}
/** Comprobante que amerita revisión: anulado, o con saldo sin cobrar. */
interface Excepcion {
  id:                number;
  codigo:            string | null;
  encf:              string | null;
  estado:            string;
  cliente:           string | null;
  totalCentavos:     number;
  pagadoCentavos:    number;
  pendienteCentavos: number;
}
interface Resumen {
  cantidadCobros:       number;
  cantidadComprobantes: number;
  cantidadAnulados:     number;
  cantidadConPendiente: number;
}
interface Detalle {
  turno:                Turno;
  cajero:               Persona | null;
  aprobador:            Persona | null;
  teamName:             string;
  pagos:                PagoMetodo[];
  totalCobrosCentavos:  number;
  movimientos:          Movimiento[];
  resumen:              Resumen;
  excepciones:          Excepcion[];
  hayMasExcepciones:    boolean;
  totalFacturadoCentavos: number;
  totalPendienteCentavos: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(centavos: number) {
  return (centavos / 100).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function duracion(desde: string, hasta: string | null) {
  if (!hasta) return '—';
  const mins = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const TIPO_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada', SALIDA: 'Salida', GASTO: 'Gasto',
  RETIRO: 'Retiro', AJUSTE: 'Ajuste',
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ImprimirCajaPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData]       = useState<Detalle | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    fetch(`/api/caja/turnos/${id}/detalle`)
      .then(r => {
        if (!r.ok) throw new Error('No autorizado o turno no encontrado');
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message));
  }, [id]);

  // Auto-print una sola vez cuando los datos están listos
  useEffect(() => {
    if (data && !printed) {
      setPrinted(true);
      setTimeout(() => window.print(), 400);
    }
  }, [data, printed]);

  if (error) {
    return (
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: '#f9fafb',
      }}>
        <Box sx={{ textAlign: 'center', p: 4, '& > * + *': { mt: 1.5 } }}>
          <AlertTriangle style={{ width: 40, height: 40, color: '#ef4444', display: 'block', margin: '0 auto' }} />
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 600, color: '#1f2937' }}>
            {error}
          </Typography>
          <Box
            component="button"
            onClick={() => window.close()}
            sx={{
              fontSize: '0.875rem',
              color: '#0d9488',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            Cerrar ventana
          </Box>
        </Box>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: '#f9fafb',
      }}>
        <Loader2 style={{ width: 32, height: 32, color: '#0d9488', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </Box>
    );
  }

  const {
    turno, cajero, aprobador, teamName, pagos, totalCobrosCentavos, movimientos,
    excepciones = [], hayMasExcepciones = false,
    totalFacturadoCentavos = 0, totalPendienteCentavos = 0,
  } = data;
  const resumen = data.resumen ?? {
    cantidadCobros: 0, cantidadComprobantes: 0, cantidadAnulados: 0, cantidadConPendiente: 0,
  };
  const diff = turno.diferenciaCentavos ?? 0;
  const cuadra = diff === 0;

  // Ventas efectivo = total cobros en efectivo
  const ventasEfectivoTotal = pagos
    .filter(p => p.metodo.toLowerCase().includes('efectivo'))
    .reduce((s, p) => s + p.totalCentavos, 0);

  // Movimientos: sumas / restas
  const SUMAN  = new Set(['ENTRADA', 'AJUSTE']);
  const RESTAN = new Set(['SALIDA', 'GASTO', 'RETIRO']);
  const entradas = movimientos.filter(m => SUMAN.has(m.tipo)).reduce((s, m) => s + m.montoCentavos, 0);
  const salidas  = movimientos.filter(m => RESTAN.has(m.tipo)).reduce((s, m) => s + m.montoCentavos, 0);

  // Diferencia row colors
  const diffBgColor   = cuadra ? '#ecfdf5' : diff > 0 ? '#f0f9ff' : '#fef2f2';
  const diffTextColor = cuadra ? '#047857' : diff > 0 ? '#075985' : '#b91c1c';

  return (
    <>
      {/* ── Estilos de impresión ── */}
      <style>{`
        @page { size: A4; margin: 18mm 15mm; }
        @media print {
          body { font-size: 11pt; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* ── Barra de acciones (solo pantalla) ── */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          bgcolor: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          px: 2,
          py: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
          '@media print': { display: 'none' },
        }}
      >
        <Box
          component="button"
          onClick={() => window.history.back()}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            fontSize: '0.875rem',
            color: '#4b5563',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            '&:hover': { color: '#111827' },
          }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} /> Volver
        </Box>
        <Box
          component="button"
          onClick={() => window.print()}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            fontSize: '0.875rem',
            bgcolor: '#0d9488',
            color: '#ffffff',
            px: 2,
            py: '6px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            '&:hover': { bgcolor: '#0f766e' },
          }}
        >
          <Printer style={{ width: 16, height: 16 }} /> Imprimir
        </Box>
      </Box>

      {/* ── Contenido imprimible ── */}
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: '#ffffff',
          pt: '56px',
          '@media print': { pt: 0 },
        }}
      >
        <Box sx={{ maxWidth: '672px', mx: 'auto', p: 3, '& > * + *': { mt: 2.5 }, '@media print': { p: 0 } }}>

          {/* ENCABEZADO */}
          <Box sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            borderBottom: '2px solid #1f2937',
            pb: 2,
          }}>
            <Box>
              <Typography sx={{
                fontSize: '0.75rem',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}>
                Zero
              </Typography>
              <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', mt: 0.25 }}>
                {teamName}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{
                fontSize: '0.75rem',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}>
                Cuadre de Caja
              </Typography>
              <Typography sx={{
                fontSize: '1.125rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#111827',
                mt: 0.25,
              }}>
                {turno.numeroCierre ?? `Turno #${turno.id}`}
              </Typography>
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  mt: 0.5,
                  px: 1,
                  py: '2px',
                  borderRadius: '9999px',
                  bgcolor: turno.estado === 'CERRADO' ? '#d1fae5' : '#fffbeb',
                  color: turno.estado === 'CERRADO' ? '#047857' : '#d97706',
                }}
              >
                {turno.estado === 'CERRADO'
                  ? <><CheckCircle style={{ width: 12, height: 12 }} /> Aprobado</>
                  : 'Pendiente'}
              </Box>
            </Box>
          </Box>

          {/* DATOS DEL TURNO */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            columnGap: 4,
            rowGap: 0.75,
            fontSize: '0.875rem',
          }}>
            <Box>
              <Typography component="span" sx={{ color: '#6b7280', fontSize: 'inherit' }}>Cajero:</Typography>{' '}
              <Typography component="span" sx={{ fontWeight: 500, fontSize: 'inherit' }}>
                {cajero?.name ?? cajero?.email ?? '—'}
              </Typography>
            </Box>
            <Box>
              <Typography component="span" sx={{ color: '#6b7280', fontSize: 'inherit' }}>Apertura:</Typography>{' '}
              <Typography component="span" sx={{ fontWeight: 500, fontSize: 'inherit' }}>
                {fmtDatetime(turno.aperturaAt)}
              </Typography>
            </Box>
            {cajero?.email && (
              <Box>
                <Typography component="span" sx={{ color: '#6b7280', fontSize: 'inherit' }}>Email:</Typography>{' '}
                <Typography component="span" sx={{ color: '#374151', fontSize: 'inherit' }}>
                  {cajero.email}
                </Typography>
              </Box>
            )}
            {turno.cierreSolicitadoAt && (
              <Box>
                <Typography component="span" sx={{ color: '#6b7280', fontSize: 'inherit' }}>Cierre enviado:</Typography>{' '}
                <Typography component="span" sx={{ fontWeight: 500, fontSize: 'inherit' }}>
                  {fmtDatetime(turno.cierreSolicitadoAt)}
                </Typography>
              </Box>
            )}
            {turno.aprobadoAt && (
              <>
                <Box>
                  <Typography component="span" sx={{ color: '#6b7280', fontSize: 'inherit' }}>Aprobado por:</Typography>{' '}
                  <Typography component="span" sx={{ fontWeight: 500, fontSize: 'inherit' }}>
                    {aprobador?.name ?? aprobador?.email ?? '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography component="span" sx={{ color: '#6b7280', fontSize: 'inherit' }}>Aprobado el:</Typography>{' '}
                  <Typography component="span" sx={{ fontWeight: 500, fontSize: 'inherit' }}>
                    {fmtDatetime(turno.aprobadoAt)}
                  </Typography>
                </Box>
              </>
            )}
            <Box>
              <Typography component="span" sx={{ color: '#6b7280', fontSize: 'inherit' }}>Duración:</Typography>{' '}
              <Typography component="span" sx={{ fontWeight: 500, fontSize: 'inherit' }}>
                {duracion(turno.aperturaAt, turno.aprobadoAt ?? turno.cierreSolicitadoAt)}
              </Typography>
            </Box>
          </Box>

          {/* COBROS POR MÉTODO */}
          <Box>
            <Typography sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              mb: 1,
            }}>
              Cobros del turno por método
            </Typography>
            {pagos.length === 0 ? (
              <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                Sin cobros registrados en este turno.
              </Typography>
            ) : (
              <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                <Table size="small" sx={{ fontSize: '0.875rem' }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <TableCell sx={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        py: 1,
                        px: 2,
                      }}>
                        Método
                      </TableCell>
                      <TableCell align="right" sx={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        py: 1,
                        px: 2,
                      }}>
                        Total
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagos.map(p => (
                      <TableRow key={p.metodo} sx={{ borderBottom: '1px solid #f3f4f6' }}>
                        <TableCell sx={{ color: '#374151', py: 1, px: 2, border: 'none' }}>
                          {p.metodo}
                          {/* Sólo el efectivo llega a la gaveta: marcarlo evita
                              cuadrar contra un total que incluye tarjeta. */}
                          {p.esEfectivo && (
                            <Box component="span" sx={{ ml: 0.75, fontSize: '0.75rem', color: '#9ca3af' }}>
                              · entra al cuadre
                            </Box>
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{
                          fontWeight: 600,
                          fontVariantNumeric: 'tabular-nums',
                          color: '#111827',
                          py: 1,
                          px: 2,
                          border: 'none',
                        }}>
                          DOP {fmt(p.totalCentavos)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow sx={{ bgcolor: '#f9fafb', borderTop: '2px solid #d1d5db' }}>
                      <TableCell sx={{
                        fontWeight: 700,
                        color: '#111827',
                        fontSize: '0.875rem',
                        py: 1.25,
                        px: 2,
                        border: 'none',
                      }}>
                        Total cobros
                      </TableCell>
                      <TableCell align="right" sx={{
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        color: '#111827',
                        fontSize: '0.875rem',
                        py: 1.25,
                        px: 2,
                        border: 'none',
                      }}>
                        DOP {fmt(totalCobrosCentavos)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </Box>
            )}
          </Box>

          {/* COMPROBANTES — en números. Un turno puede tener cientos; volcarlos
              haría una hoja de decenas de páginas que nadie revisa. */}
          <Box sx={{ breakInside: 'avoid' }}>
            <Typography sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              mb: 1,
            }}>
              Comprobantes del turno ({resumen.cantidadComprobantes})
            </Typography>
            <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
              <Table size="small" sx={{ fontSize: '0.875rem' }}>
                <TableBody>
                  {[
                    { label: 'Facturado', value: `DOP ${fmt(totalFacturadoCentavos)}`, alerta: false },
                    { label: 'Anulados', value: String(resumen.cantidadAnulados), alerta: false },
                    {
                      label: `Facturado sin cobrar (${resumen.cantidadConPendiente})`,
                      value: `DOP ${fmt(totalPendienteCentavos)}`,
                      alerta: totalPendienteCentavos > 0,
                    },
                  ].map(row => (
                    <TableRow key={row.label} sx={{ borderBottom: '1px solid #f3f4f6' }}>
                      <TableCell sx={{ color: '#374151', py: 1, px: 2, border: 'none' }}>
                        {row.label}
                      </TableCell>
                      <TableCell align="right" sx={{
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                        color: row.alerta ? '#b45309' : '#111827',
                        py: 1,
                        px: 2,
                        border: 'none',
                      }}>
                        {row.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            {totalPendienteCentavos > 0 && (
              <Typography sx={{ mt: 0.75, fontSize: '0.75rem', color: '#6b7280' }}>
                DOP {fmt(totalPendienteCentavos)} se facturaron y no se cobraron. No afectan el
                cuadre de efectivo de abajo — ahí solo entra el dinero que se recibió.
              </Typography>
            )}
          </Box>

          {/* REQUIEREN REVISIÓN — sólo anulados y saldos sin cobrar. El resto
              son ventas cobradas completas: ya están sumadas arriba. */}
          {excepciones.length > 0 && (
            <Box sx={{ breakInside: 'avoid' }}>
              <Typography sx={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                mb: 1,
              }}>
                Requieren revisión ({resumen.cantidadAnulados + resumen.cantidadConPendiente})
              </Typography>
              <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                <Table size="small" sx={{ fontSize: '0.875rem' }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      {[
                        { label: 'Comprobante', align: 'left' as const },
                        { label: 'Cliente', align: 'left' as const },
                        { label: 'Total', align: 'right' as const },
                        { label: 'Cobrado', align: 'right' as const },
                        { label: 'Sin cobrar', align: 'right' as const },
                      ].map(h => (
                        <TableCell key={h.label} align={h.align} sx={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          py: 1,
                          px: 1.5,
                        }}>
                          {h.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {excepciones.map(d => {
                      const anulado = d.estado === 'ANULADO';
                      const cellSx = {
                        py: 0.75, px: 1.5, border: 'none',
                        color: anulado ? '#9ca3af' : 'inherit',
                        borderBottom: '1px solid #f3f4f6',
                      };
                      return (
                        <TableRow key={d.id}>
                          <TableCell sx={{ ...cellSx, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            <Box component="span" sx={{
                              textDecoration: anulado ? 'line-through' : 'none',
                              color: anulado ? 'inherit' : '#374151',
                            }}>
                              {d.encf || d.codigo || '—'}
                            </Box>
                            {anulado && (
                              <Box component="span" sx={{
                                ml: 0.5, borderRadius: '4px', bgcolor: '#fef2f2',
                                px: 0.5, py: '2px', fontSize: '10px',
                                fontFamily: 'inherit', color: '#b91c1c',
                              }}>
                                anulado
                              </Box>
                            )}
                          </TableCell>
                          <TableCell sx={cellSx}>{d.cliente || '—'}</TableCell>
                          <TableCell align="right" sx={{ ...cellSx, fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(d.totalCentavos)}
                          </TableCell>
                          <TableCell align="right" sx={{ ...cellSx, fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(d.pagadoCentavos)}
                          </TableCell>
                          <TableCell align="right" sx={{
                            ...cellSx,
                            fontVariantNumeric: 'tabular-nums',
                            ...(!anulado && d.pendienteCentavos > 0
                              ? { fontWeight: 600, color: '#b45309' }
                              : {}),
                          }}>
                            {d.pendienteCentavos > 0 ? fmt(d.pendienteCentavos) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
              {hayMasExcepciones && (
                <Typography sx={{ mt: 0.75, fontSize: '0.75rem', color: '#6b7280' }}>
                  Se muestran las {excepciones.length} de mayor monto. Hay más — revísalas en Facturas.
                </Typography>
              )}
            </Box>
          )}

          {/* CUADRE DE EFECTIVO */}
          <Box>
            <Typography sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              mb: 1,
            }}>
              Cuadre de efectivo
            </Typography>
            <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', fontSize: '0.875rem' }}>

              {/* Apertura */}
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                px: 2,
                py: 1,
                bgcolor: '#f9fafb',
                borderBottom: '1px solid #f3f4f6',
              }}>
                <Typography component="span" sx={{ color: '#4b5563', fontSize: 'inherit' }}>
                  Monto de apertura
                </Typography>
                <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 'inherit' }}>
                  DOP {fmt(turno.montoAperturaCentavos)}
                </Typography>
              </Box>

              {/* Ventas efectivo */}
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                px: 2,
                py: 1,
                borderBottom: '1px solid #f3f4f6',
              }}>
                <Typography component="span" sx={{ color: '#4b5563', fontSize: 'inherit' }}>
                  + Ventas en efectivo
                </Typography>
                <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: '#047857', fontSize: 'inherit' }}>
                  DOP {fmt(ventasEfectivoTotal)}
                </Typography>
              </Box>

              {/* Entradas */}
              {entradas > 0 && (
                <Box sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1,
                  borderBottom: '1px solid #f3f4f6',
                }}>
                  <Typography component="span" sx={{ color: '#4b5563', fontSize: 'inherit' }}>
                    + Entradas / ajustes
                  </Typography>
                  <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: '#047857', fontSize: 'inherit' }}>
                    DOP {fmt(entradas)}
                  </Typography>
                </Box>
              )}

              {/* Salidas */}
              {salidas > 0 && (
                <Box sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1,
                  borderBottom: '1px solid #f3f4f6',
                }}>
                  <Typography component="span" sx={{ color: '#4b5563', fontSize: 'inherit' }}>
                    − Salidas / gastos
                  </Typography>
                  <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: '#b91c1c', fontSize: 'inherit' }}>
                    DOP {fmt(salidas)}
                  </Typography>
                </Box>
              )}

              {/* Efectivo esperado */}
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                px: 2,
                py: 1.25,
                bgcolor: '#f9fafb',
                fontWeight: 700,
                borderTop: '2px solid #d1d5db',
                borderBottom: '1px solid #f3f4f6',
              }}>
                <Typography component="span" sx={{ fontWeight: 700, fontSize: 'inherit' }}>
                  Efectivo esperado
                </Typography>
                <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'inherit' }}>
                  DOP {fmt(turno.montoEsperadoCentavos ?? 0)}
                </Typography>
              </Box>

              {/* Efectivo contado */}
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                px: 2,
                py: 1,
                borderBottom: '1px solid #f3f4f6',
              }}>
                <Typography component="span" sx={{ color: '#4b5563', fontSize: 'inherit' }}>
                  Efectivo contado
                </Typography>
                <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 'inherit' }}>
                  DOP {fmt(turno.efectivoContadoCentavos ?? 0)}
                </Typography>
              </Box>

              {/* Diferencia */}
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                px: 2,
                py: 1.25,
                fontWeight: 700,
                bgcolor: diffBgColor,
              }}>
                <Typography component="span" sx={{ fontWeight: 700, color: diffTextColor, fontSize: 'inherit' }}>
                  {cuadra ? '✓ Diferencia (cuadra)' : diff > 0 ? 'Sobrante' : 'Faltante'}
                </Typography>
                <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: diffTextColor, fontSize: 'inherit' }}>
                  {diff > 0 ? '+' : ''} DOP {fmt(diff)}
                </Typography>
              </Box>
            </Box>

            {/* Justificación del cajero */}
            {turno.cierreObs && (
              <Box sx={{
                mt: 1,
                border: '1px solid #fde68a',
                bgcolor: '#fffbeb',
                borderRadius: '8px',
                px: 2,
                py: 1.25,
                fontSize: '0.875rem',
              }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 500, mb: 0.25 }}>
                  Justificación del cajero
                </Typography>
                <Typography sx={{ color: '#1f2937', fontStyle: 'italic', fontSize: 'inherit' }}>
                  &ldquo;{turno.cierreObs}&rdquo;
                </Typography>
              </Box>
            )}

            {/* Nota del aprobador */}
            {turno.aprobacionObs && (
              <Box sx={{
                mt: 1,
                border: '1px solid #e5e7eb',
                bgcolor: '#f9fafb',
                borderRadius: '8px',
                px: 2,
                py: 1.25,
                fontSize: '0.875rem',
              }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, mb: 0.25 }}>
                  Nota del aprobador
                </Typography>
                <Typography sx={{ color: '#1f2937', fontStyle: 'italic', fontSize: 'inherit' }}>
                  &ldquo;{turno.aprobacionObs}&rdquo;
                </Typography>
              </Box>
            )}
          </Box>

          {/* MOVIMIENTOS */}
          {movimientos.length > 0 && (
            <Box>
              <Typography sx={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                mb: 1,
              }}>
                Movimientos del turno ({movimientos.length})
              </Typography>
              <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                <Table size="small" sx={{ fontSize: '0.875rem' }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', py: 1, px: 1.5 }}>
                        Hora
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', py: 1, px: 1.5 }}>
                        Tipo
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', py: 1, px: 1.5 }}>
                        Descripción
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', py: 1, px: 1.5 }}>
                        Monto
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {movimientos.map(m => {
                      const suma = SUMAN.has(m.tipo);
                      return (
                        <TableRow key={m.id} sx={{ borderBottom: '1px solid #f3f4f6' }}>
                          <TableCell sx={{
                            color: '#6b7280',
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap',
                            py: 1,
                            px: 1.5,
                            border: 'none',
                          }}>
                            {new Date(m.createdAt).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell sx={{ color: '#374151', py: 1, px: 1.5, border: 'none' }}>
                            {TIPO_LABEL[m.tipo] ?? m.tipo}
                          </TableCell>
                          <TableCell sx={{ color: '#4b5563', fontSize: '0.75rem', py: 1, px: 1.5, border: 'none' }}>
                            {m.descripcion ?? m.motivo ?? '—'}
                          </TableCell>
                          <TableCell align="right" sx={{
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight: 500,
                            color: suma ? '#047857' : '#b91c1c',
                            py: 1,
                            px: 1.5,
                            border: 'none',
                          }}>
                            {suma ? '+' : '−'} DOP {fmt(m.montoCentavos)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            </Box>
          )}

          {/* FIRMAS */}
          <Box sx={{ borderTop: '2px solid #1f2937', pt: 2.5, mt: 2 }}>
            <Typography sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              mb: 2.5,
            }}>
              Firmas y conformidad
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              <Box sx={{ '& > * + *': { mt: 1.5 } }}>
                <Box sx={{ borderBottom: '1px solid #9ca3af', pb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>
                    {cajero?.name ?? '___________________________'}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Cajero — firma y fecha
                </Typography>
              </Box>
              <Box sx={{ '& > * + *': { mt: 1.5 } }}>
                <Box sx={{ borderBottom: '1px solid #9ca3af', pb: 0.5 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>
                    {aprobador?.name ?? '___________________________'}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Administrador — firma y fecha
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Pie de página */}
          <Typography sx={{
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#9ca3af',
            borderTop: '1px solid #f3f4f6',
            pt: 1.5,
            mt: 2,
          }}>
            Zero · Cuadre generado el {fmtDatetime(new Date().toISOString())}
          </Typography>

        </Box>
      </Box>
    </>
  );
}
