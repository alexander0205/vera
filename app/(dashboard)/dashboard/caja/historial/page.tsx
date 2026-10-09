'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, CheckCircle, AlertTriangle, Loader2, Printer } from 'lucide-react';
import { fmtDOP } from '@/lib/utils/format';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import MuiButton from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';

interface TurnoHistorial {
  id: number;
  numeroCierre: string | null;
  cajero: string | null;
  cajeroEmail: string;
  montoAperturaCentavos: number;
  efectivoContadoCentavos: number | null;
  montoEsperadoCentavos: number | null;
  diferenciaCentavos: number | null;
  aperturaAt: string;
  aprobadoAt: string | null;
  cierreObs: string | null;
  aprobacionObs: string | null;
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function duracion(desde: string, hasta: string | null) {
  if (!hasta) return '—';
  const mins = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function HistorialPage() {
  const [loading, setLoading] = useState(true);
  const [turnos, setTurnos]   = useState<TurnoHistorial[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const limit = 20;

  const fetchHistorial = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ limit: String(limit), offset: String((page - 1) * limit) });
    const res = await fetch(`/api/caja/historial?${sp}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setTurnos(data.turnos ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchHistorial(); }, [fetchHistorial]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Historial de caja</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Turnos cerrados y aprobados</Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} color="primary" />
        </Box>
      ) : turnos.length === 0 ? (
        <Box sx={{ bgcolor: 'grey.50', borderRadius: '16px', border: '1px solid #e5e7eb', py: 8, textAlign: 'center' }}>
          <Wallet style={{ width: 40, height: 40, color: '#d1d5db', margin: '0 auto 12px' }} />
          <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.secondary' }}>Sin turnos cerrados aún</Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>Los turnos aparecerán aquí una vez cerrados y aprobados.</Typography>
        </Box>
      ) : (
        <>
          {/* Tabla desktop */}
          <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', display: { xs: 'none', md: 'block' }, mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  {['Cierre', 'Cajero', 'Apertura', 'Duración', 'Esperado', 'Contado', 'Diferencia'].map(h => (
                    <TableCell key={h} align={['Esperado', 'Contado', 'Diferencia'].includes(h) ? 'right' : 'left'}
                      sx={{ fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'text.secondary', letterSpacing: '0.05em', py: 1.5 }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {turnos.map(t => {
                  const diff = t.diferenciaCentavos ?? 0;
                  return (
                    <TableRow key={t.id} sx={{ '&:hover': { bgcolor: 'grey.50' } }}>
                      <TableCell sx={{ py: 1.5 }}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block' }}>
                          {t.numeroCierre ?? `#${t.id}`}
                        </Typography>
                        {t.aprobadoAt && (
                          <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>{fmtDatetime(t.aprobadoAt)}</Typography>
                        )}
                        <MuiButton size="small" variant="text" color="primary"
                          startIcon={<Printer style={{ width: 11, height: 11 }} />}
                          onClick={() => window.open(`/caja/imprimir/${t.id}`, '_blank')}
                          sx={{ textTransform: 'none', fontSize: '0.6875rem', p: '2px 4px', minWidth: 0, mt: 0.25 }}>
                          Imprimir
                        </MuiButton>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                          {t.cajero ?? t.cajeroEmail}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {fmtDatetime(t.aperturaAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {duracion(t.aperturaAt, t.aprobadoAt)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                          {fmtDOP(t.montoEsperadoCentavos ?? 0)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                          {fmtDOP(t.efectivoContadoCentavos ?? 0)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {diff === 0 ? (
                          <Chip label="Cuadra" size="small" icon={<CheckCircle style={{ width: 10, height: 10 }} />}
                            sx={{ bgcolor: '#ecfdf5', color: '#065f46', height: 22, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 0.75 } }} />
                        ) : (
                          <Chip
                            label={`${diff > 0 ? '+' : ''}${fmtDOP(diff)}`}
                            size="small"
                            icon={<AlertTriangle style={{ width: 10, height: 10 }} />}
                            sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 0.75 },
                              ...(diff > 0 ? { bgcolor: '#eff6ff', color: '#1d4ed8' } : { bgcolor: '#fef2f2', color: '#991b1b' }) }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Cards mobile */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1.5, mb: 2 }}>
            {turnos.map(t => {
              const diff = t.diferenciaCentavos ?? 0;
              return (
                <Card key={t.id} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                  <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.cajero ?? t.cajeroEmail}</Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block' }}>{t.numeroCierre ?? `#${t.id}`}</Typography>
                        <MuiButton size="small" variant="text" color="primary" startIcon={<Printer style={{ width: 10, height: 10 }} />}
                          onClick={() => window.open(`/caja/imprimir/${t.id}`, '_blank')}
                          sx={{ textTransform: 'none', fontSize: '0.6875rem', p: '2px 4px', minWidth: 0, mt: 0.25 }}>
                          Imprimir
                        </MuiButton>
                      </Box>
                      {diff === 0
                        ? <CheckCircle style={{ width: 20, height: 20, color: '#34d399' }} />
                        : <AlertTriangle style={{ width: 20, height: 20, color: diff > 0 ? '#3b82f6' : '#ef4444' }} />}
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      {[
                        { label: 'Esperado', value: fmtDOP(t.montoEsperadoCentavos ?? 0) },
                        { label: 'Contado', value: fmtDOP(t.efectivoContadoCentavos ?? 0) },
                        { label: 'Apertura', value: fmtDatetime(t.aperturaAt) },
                        { label: 'Duración', value: duracion(t.aperturaAt, t.aprobadoAt) },
                      ].map(item => (
                        <Box key={item.label}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{item.label}</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>{item.value}</Typography>
                        </Box>
                      ))}
                    </Box>
                    {diff !== 0 && (
                      <Box sx={{ px: 1.5, py: 1, borderRadius: '8px', ...(diff > 0 ? { bgcolor: '#eff6ff', color: '#1d4ed8' } : { bgcolor: '#fef2f2', color: '#991b1b' }) }}>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          Diferencia: {diff > 0 ? '+' : ''}{fmtDOP(diff)}
                          {t.cierreObs && <Box component="span" sx={{ fontWeight: 400, opacity: 0.75 }}> — {t.cierreObs}</Box>}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Card>
              );
            })}
          </Box>

          {/* Paginación */}
          {pages > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{total} turnos en total</Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <MuiButton variant="outlined" size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  sx={{ borderRadius: '8px', textTransform: 'none', borderColor: 'divider' }}>
                  Anterior
                </MuiButton>
                <Typography variant="body2" sx={{ color: 'text.secondary', px: 1 }}>{page} / {pages}</Typography>
                <MuiButton variant="outlined" size="small" disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                  sx={{ borderRadius: '8px', textTransform: 'none', borderColor: 'divider' }}>
                  Siguiente
                </MuiButton>
              </Box>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
