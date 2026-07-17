'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, Printer, ChevronDown } from 'lucide-react';
import { DetalleTurno } from '@/components/caja/DetalleTurno';
import { toast } from 'sonner';
import { fmtDOP } from '@/lib/utils/format';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';

interface Pendiente {
  id: number;
  numeroCierre: string | null;
  cajero: string | null;
  cajeroEmail: string;
  montoAperturaCentavos: number;
  efectivoContadoCentavos: number | null;
  montoEsperadoCentavos: number | null;
  diferenciaCentavos: number | null;
  cierreObs: string | null;
  aperturaAt: string;
  cierreSolicitadoAt: string | null;
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function duracion(desde: string, hasta: string | null) {
  if (!hasta) return null;
  const mins = Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${m}m`;
}

function ModalAccion({ tipo, onConfirm, onClose }: {
  tipo: 'aprobar' | 'rechazar'; onConfirm: (obs: string) => void; onClose: () => void;
}) {
  const [obs, setObs] = useState('');

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth
      slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        {tipo === 'aprobar' ? 'Aprobar cierre' : 'Rechazar cierre'}
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <MuiTextField
          label={`Observaciones${tipo === 'rechazar' ? ' *' : ''}`}
          placeholder={tipo === 'rechazar' ? 'Motivo del rechazo…' : 'Opcional'}
          value={obs} onChange={e => setObs(e.target.value)}
          multiline rows={3} size="small" fullWidth autoFocus
          required={tipo === 'rechazar'}
          slotProps={{ htmlInput: { maxLength: 500 } }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <MuiButton variant="outlined" onClick={onClose} sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</MuiButton>
        <MuiButton
          variant="contained"
          color={tipo === 'aprobar' ? 'success' : 'error'}
          disableElevation
          onClick={() => {
            if (tipo === 'rechazar' && !obs.trim()) { toast.error('Ingresa el motivo del rechazo'); return; }
            onConfirm(obs);
          }}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}
        >
          {tipo === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
        </MuiButton>
      </DialogActions>
    </Dialog>
  );
}

export default function AprobacionesPage() {
  const [loading, setLoading]       = useState(true);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [modal, setModal]           = useState<{ id: number; tipo: 'aprobar' | 'rechazar' } | null>(null);
  /** Qué turnos tienen el detalle desplegado, por id. */
  const [abierto, setAbierto]       = useState<Record<number, boolean>>({});
  const [procesando, setProcesando] = useState<number | null>(null);

  const fetchPendientes = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/caja/aprobaciones').catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setPendientes(data.pendientes ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPendientes(); }, [fetchPendientes]);

  async function handleAccion(turnoId: number, tipo: 'aprobar' | 'rechazar', obs: string) {
    setProcesando(turnoId);
    setModal(null);
    const endpoint = tipo === 'aprobar' ? 'aprobar' : 'rechazar';
    const body = tipo === 'aprobar' ? { observaciones: obs || undefined } : { motivo: obs };

    const res = await fetch(`/api/caja/turnos/${turnoId}/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setProcesando(null);

    if (res.ok) { toast.success(tipo === 'aprobar' ? 'Cierre aprobado' : 'Cierre rechazado — turno reabierto'); fetchPendientes(); }
    else toast.error(data.error ?? `Error al ${tipo}`);
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Aprobaciones de cierre</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Cierres con descuadre pendientes de revisión</Typography>
        </Box>
        <MuiButton variant="text" color="primary" onClick={fetchPendientes}
          sx={{ textTransform: 'none', fontSize: '0.875rem' }}>
          Actualizar
        </MuiButton>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} color="primary" />
        </Box>
      ) : pendientes.length === 0 ? (
        <Box sx={{ bgcolor: 'grey.50', borderRadius: '16px', border: '1px solid #e5e7eb', py: 8, textAlign: 'center' }}>
          <CheckCircle style={{ width: 40, height: 40, color: '#34d399', margin: '0 auto 12px' }} />
          <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>Sin cierres pendientes</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Todos los turnos están al día.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {pendientes.map(p => {
            const diferencia = p.diferenciaCentavos ?? 0;
            // Tres casos, no dos: sin el caso "cuadra" un cierre exacto caía en
            // el else y se pintaba "Faltante: RD$0.00" en rojo con alerta. Un
            // rojo que miente cuando todo está bien enseña a ignorar el rojo.
            const isSobrante = diferencia > 0;
            const cuadra     = diferencia === 0;
            const dur        = duracion(p.aperturaAt, p.cierreSolicitadoAt);

            return (
              <Card key={p.id} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                <CardContent sx={{ p: '20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Header */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                          {p.cajero ?? p.cajeroEmail}
                        </Typography>
                        <Chip
                          label="Pendiente"
                          size="small"
                          icon={<Clock style={{ width: 10, height: 10 }} />}
                          sx={{ bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', height: 22, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 0.75 } }}
                        />
                      </Box>
                      {p.numeroCierre && (
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block', mt: 0.25 }}>
                          {p.numeroCierre}
                        </Typography>
                      )}
                    </Box>
                    {dur && <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>{dur}</Typography>}
                  </Box>

                  {/* Montos */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                    {[
                      { label: 'Apertura', value: fmtDOP(p.montoAperturaCentavos) },
                      { label: 'Esperado', value: fmtDOP(p.montoEsperadoCentavos ?? 0) },
                      { label: 'Contado', value: fmtDOP(p.efectivoContadoCentavos ?? 0) },
                    ].map(item => (
                      <Box key={item.label} sx={{ bgcolor: 'grey.50', borderRadius: '10px', p: 1.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{item.label}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{item.value}</Typography>
                      </Box>
                    ))}
                  </Box>

                  {/* Diferencia */}
                  <Alert
                    severity={cuadra ? 'success' : isSobrante ? 'info' : 'error'}
                    icon={cuadra
                      ? <CheckCircle2 style={{ width: 16, height: 16 }} />
                      : <AlertTriangle style={{ width: 16, height: 16 }} />}
                    sx={{ borderRadius: '8px' }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {cuadra
                        ? 'Cuadra exacto'
                        : `${isSobrante ? 'Sobrante' : 'Faltante'}: ${isSobrante ? '+' : ''}${fmtDOP(diferencia)}`}
                    </Typography>
                    {p.cierreObs && (
                      <Typography variant="caption" sx={{ fontStyle: 'italic', display: 'block', mt: 0.25 }}>"{p.cierreObs}"</Typography>
                    )}
                  </Alert>

                  {/* Detalle — lo que se hizo en el turno. Colapsado por defecto:
                      quien solo mira la diferencia no paga las consultas. */}
                  <Box>
                    <MuiButton
                      type="button"
                      size="small"
                      onClick={() => setAbierto(a => ({ ...a, [p.id]: !a[p.id] }))}
                      aria-expanded={!!abierto[p.id]}
                      startIcon={
                        <ChevronDown
                          style={{
                            width: 16,
                            height: 16,
                            transition: 'transform 0.2s',
                            transform: abierto[p.id] ? 'rotate(180deg)' : 'none',
                          }}
                        />
                      }
                      sx={{ textTransform: 'none', fontWeight: 500, color: '#0f766e', '&:hover': { color: '#115e59', bgcolor: 'transparent' } }}
                    >
                      {abierto[p.id] ? 'Ocultar detalle' : 'Ver qué se hizo en el turno'}
                    </MuiButton>
                    {abierto[p.id] && <DetalleTurno turnoId={p.id} />}
                  </Box>

                  {/* Acciones */}
                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                    <MuiButton variant="outlined" size="small"
                      startIcon={<Printer style={{ width: 14, height: 14 }} />}
                      onClick={() => window.open(`/caja/imprimir/${p.id}`, '_blank')}
                      sx={{ borderRadius: '8px', textTransform: 'none', borderColor: 'divider', color: 'text.secondary' }}>
                      Imprimir
                    </MuiButton>
                    <MuiButton variant="outlined" size="small" color="error"
                      startIcon={<XCircle style={{ width: 14, height: 14 }} />}
                      disabled={procesando === p.id}
                      onClick={() => setModal({ id: p.id, tipo: 'rechazar' })}
                      sx={{ borderRadius: '8px', textTransform: 'none' }}>
                      Rechazar
                    </MuiButton>
                    <MuiButton variant="contained" size="small" color="success" disableElevation
                      startIcon={procesando === p.id ? <CircularProgress size={14} color="inherit" /> : <CheckCircle style={{ width: 14, height: 14 }} />}
                      disabled={procesando === p.id}
                      onClick={() => setModal({ id: p.id, tipo: 'aprobar' })}
                      sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                      Aprobar
                    </MuiButton>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {modal && (
        <ModalAccion
          tipo={modal.tipo}
          onConfirm={obs => handleAccion(modal.id, modal.tipo, obs)}
          onClose={() => setModal(null)}
        />
      )}
    </Box>
  );
}
