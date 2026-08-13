'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet, Clock, ArrowDownCircle, ArrowUpCircle, Plus, CheckCircle,
  AlertTriangle, Loader2, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { METODO_PAGO_LABELS as METODO_LABELS, METODOS_PAGO, esEfectivo } from '@/lib/pagos/metodos';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';

// ─── Types ────────────────────────────────────────────────────────────────────

type EstadoTurno = 'ABIERTO' | 'CIERRE_SOLICITADO' | 'CERRADO';

interface Turno {
  id: number;
  estado: EstadoTurno;
  montoAperturaCentavos: number;
  aperturaAt: string;
  numeroCierre: string | null;
  efectivoContadoCentavos: number | null;
  montoEsperadoCentavos: number | null;
  diferenciaCentavos: number | null;
  cierreObs: string | null;
}

interface Desglose {
  montoApertura: number;
  ventasEfectivo: number;
  entradas: number;
  salidas: number;
  esperado: number;
}

interface VentaPorMetodo {
  metodo: string;
  total: number;
}

interface Movimiento {
  id: number;
  tipo: string;
  montoCentavos: number;
  metodo: string;
  descripcion: string | null;
  motivo: string | null;
  createdAt: string;
}

interface Terminal {
  id: number;
  nombre: string;
}

const TIPO_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada', SALIDA: 'Salida', GASTO: 'Gasto', RETIRO: 'Retiro', AJUSTE: 'Ajuste',
};

const TIPO_CHIP_SX: Record<string, object> = {
  ENTRADA: { bgcolor: '#ecfdf5', color: '#065f46' },
  SALIDA:  { bgcolor: '#fef2f2', color: '#991b1b' },
  GASTO:   { bgcolor: '#fef2f2', color: '#991b1b' },
  RETIRO:  { bgcolor: '#fffbeb', color: '#92400e' },
  AJUSTE:  { bgcolor: '#eff6ff', color: '#1e40af' },
};

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'gray' }: {
  label: string; value: string; sub?: string; color?: 'gray' | 'emerald' | 'red' | 'amber';
}) {
  const sxMap = {
    gray:    { bgcolor: 'background.paper', border: '1px solid #e5e7eb' },
    emerald: { bgcolor: '#ecfdf5', border: '1px solid #a7f3d0' },
    red:     { bgcolor: '#fef2f2', border: '1px solid #fecaca' },
    amber:   { bgcolor: '#fffbeb', border: '1px solid #fde68a' },
  };
  const textColor = {
    gray: 'text.primary', emerald: '#065f46', red: '#991b1b', amber: '#92400e',
  }[color];

  return (
    <Box sx={{ borderRadius: '12px', p: 2, ...sxMap[color] }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: textColor }}>{value}</Typography>
      {sub && <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25 }}>{sub}</Typography>}
    </Box>
  );
}

// ─── Modal de movimiento ──────────────────────────────────────────────────────

function ModalMovimiento({ turnoId, onClose, onCreated }: {
  turnoId: number; onClose: () => void; onCreated: () => void;
}) {
  const [tipo, setTipo]           = useState('ENTRADA');
  const [metodo, setMetodo]       = useState('efectivo');
  const [monto, setMonto]         = useState('');
  const [descripcion, setDesc]    = useState('');
  const [motivo, setMotivo]       = useState('');
  const [loading, setLoading]     = useState(false);

  // Dirección del dinero: ENTRADA/AJUSTE suman, el resto resta (espejo de
  // lib/caja/core → TIPOS_SUMAN / TIPOS_RESTAN).
  const esEntrada = ['ENTRADA', 'AJUSTE'].includes(tipo);
  // Solo el efectivo entra a la gaveta; los demás métodos se registran pero no
  // afectan el efectivo esperado del cierre (el backend ya lo ignora).
  const afectaCaja = esEfectivo(metodo);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const montoNum = parseFloat(monto.replace(',', '.'));
    if (!montoNum || montoNum <= 0) { toast.error('Monto inválido'); return; }

    setLoading(true);
    const res = await fetch('/api/caja/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnoId,
        tipo,
        metodo,
        monto: montoNum,
        descripcion: descripcion || undefined,
        motivo: motivo || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) { toast.success('Movimiento registrado'); onCreated(); onClose(); }
    else toast.error(data.error ?? 'Error al registrar movimiento');
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth
      slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
      <Box component="form" onSubmit={submit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Registrar movimiento</DialogTitle>
        <DialogContent sx={{ pt: '8px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 0.5 }}>
              {/* Dirección del dinero, visible al elegir el tipo. */}
              <Chip
                size="small"
                icon={esEntrada
                  ? <ArrowDownCircle style={{ width: 12, height: 12 }} />
                  : <ArrowUpCircle style={{ width: 12, height: 12 }} />}
                label={esEntrada ? 'Entra dinero' : 'Sale dinero'}
                sx={{
                  height: 22, fontSize: '0.6875rem', fontWeight: 600,
                  '& .MuiChip-label': { px: 0.75 },
                  ...(esEntrada
                    ? { color: '#047857', bgcolor: '#ecfdf5' }
                    : { color: '#b91c1c', bgcolor: '#fef2f2' }),
                }}
              />
            </Box>
            <FormControl size="small" fullWidth>
              <InputLabel>Tipo</InputLabel>
              <Select value={tipo} label="Tipo" onChange={e => setTipo(e.target.value)} sx={{ borderRadius: '8px' }}>
                {Object.entries(TIPO_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          {/* Método del movimiento: solo el efectivo entra a la gaveta. */}
          <Box>
            <FormControl size="small" fullWidth>
              <InputLabel>Método / saldo</InputLabel>
              <Select value={metodo} label="Método / saldo" onChange={e => setMetodo(e.target.value)} sx={{ borderRadius: '8px' }}>
                {METODOS_PAGO.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
              </Select>
            </FormControl>
            {!afectaCaja && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
                No afecta el efectivo en caja — se aplica a {METODO_LABELS[metodo] ?? metodo}.
              </Typography>
            )}
          </Box>
          <MuiTextField
            type="number" label="Monto (RD$)" placeholder="0.00"
            value={monto} onChange={e => setMonto(e.target.value)}
            size="small" fullWidth required
            slotProps={{ htmlInput: { min: '0.01', step: '0.01' } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
          <MuiTextField
            label="Descripción" placeholder="Opcional"
            value={descripcion} onChange={e => setDesc(e.target.value)}
            size="small" fullWidth
            slotProps={{ htmlInput: { maxLength: 200 } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
          {tipo === 'AJUSTE' && (
            <MuiTextField
              label="Motivo *" placeholder="Requerido para ajustes"
              value={motivo} onChange={e => setMotivo(e.target.value)}
              multiline rows={2} size="small" fullWidth required
              slotProps={{ htmlInput: { maxLength: 500 } }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton variant="outlined" onClick={onClose} sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</MuiButton>
          <MuiButton type="submit" variant="contained" color="primary" disableElevation disabled={loading}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {loading ? <CircularProgress size={16} color="inherit" /> : 'Registrar'}
          </MuiButton>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ─── Modal de cierre ──────────────────────────────────────────────────────────

function ModalCierre({ turno, desglose, ventasPorMetodo, onClose, onCerrado }: {
  turno: Turno; desglose: Desglose; ventasPorMetodo: VentaPorMetodo[]; onClose: () => void; onCerrado: () => void;
}) {
  const [contado, setContado] = useState('');
  const [obs, setObs]         = useState('');
  const [loading, setLoading] = useState(false);

  const contadoNum  = parseFloat(contado.replace(',', '.')) || 0;
  const esperadoDOP = desglose.esperado / 100;
  const diferencia  = contadoNum - esperadoDOP;
  const hasDiff     = contado !== '' && Math.abs(Math.round(diferencia * 100)) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (contadoNum < 0) { toast.error('El conteo no puede ser negativo'); return; }
    if (hasDiff && !obs.trim()) { toast.error('Hay una diferencia: ingresa la justificación'); return; }

    setLoading(true);
    const res = await fetch(`/api/caja/turnos/${turno.id}/cierre`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ efectivoContado: contadoNum, observaciones: obs || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) { toast.success('Cuadre firmado — pendiente de aprobación del administrador'); onCerrado(); onClose(); }
    else toast.error(data.error ?? 'Error al cerrar');
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
      <Box component="form" onSubmit={submit}>
        <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
          Cuadre de caja
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 400 }}>
            El administrador recibirá una notificación para aprobar el cierre.
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Desglose esperado */}
          <Box sx={{ bgcolor: 'grey.50', borderRadius: '10px', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              { label: 'Apertura', value: fmtDOP(desglose.montoApertura), color: 'text.secondary' },
              { label: 'Ventas efectivo', value: `+${fmtDOP(desglose.ventasEfectivo)}`, color: '#059669' },
              ...(desglose.entradas > 0 ? [{ label: 'Entradas', value: `+${fmtDOP(desglose.entradas)}`, color: '#059669' }] : []),
              ...(desglose.salidas > 0 ? [{ label: 'Salidas / gastos', value: `−${fmtDOP(desglose.salidas)}`, color: '#dc2626' }] : []),
            ].map((row, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{row.label}</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: row.color }}>{row.value}</Typography>
              </Box>
            ))}
            <Divider sx={{ my: 0.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>Esperado en caja</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>{fmtDOP(desglose.esperado)}</Typography>
            </Box>
          </Box>

          {/* Ventas por método */}
          {ventasPorMetodo.length > 0 && (
            <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '10px' }}>
              <CardContent sx={{ p: '12px 16px !important', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>Ventas del turno por método</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(ventasPorMetodo.reduce((s, v) => s + v.total, 0))}</Typography>
                </Box>
                {ventasPorMetodo.map(v => {
                  const esEfectivo = v.metodo === 'efectivo' || v.metodo === 'cash';
                  return (
                    <Box key={v.metodo} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {METODO_LABELS[v.metodo] ?? v.metodo}
                        {!esEfectivo && <Box component="span" sx={{ opacity: 0.5 }}>(no afecta caja)</Box>}
                      </Typography>
                      <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(v.total)}</Typography>
                    </Box>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <MuiTextField
            type="number" label="Efectivo contado (RD$)" placeholder="0.00"
            value={contado} onChange={e => setContado(e.target.value)}
            size="small" fullWidth required autoFocus
            slotProps={{ htmlInput: { min: '0', step: '0.01' } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          {contado !== '' && (
            <Alert
              severity={hasDiff ? 'error' : 'success'}
              icon={hasDiff ? <AlertTriangle style={{ width: 16, height: 16 }} /> : <CheckCircle style={{ width: 16, height: 16 }} />}
              sx={{ borderRadius: '8px' }}
            >
              {hasDiff
                ? `Diferencia: ${diferencia > 0 ? '+' : ''}${fmtDOP(Math.round(diferencia * 100))} — se requiere justificación`
                : 'Caja cuadrada — el admin revisará el cuadre'}
            </Alert>
          )}

          <MuiTextField
            label={`Observaciones${hasDiff ? ' *' : ''}`}
            placeholder={hasDiff ? 'Explica el descuadre…' : 'Opcional — ej: novedades del turno'}
            value={obs} onChange={e => setObs(e.target.value)}
            multiline rows={3} size="small" fullWidth required={hasDiff}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          {contado !== '' && (
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              Al firmar confirmas que el conteo físico es correcto y que la información
              es veraz. El cuadre quedará pendiente de aprobación del administrador.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton variant="outlined" onClick={onClose} sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</MuiButton>
          <MuiButton type="submit" variant="contained" color="primary" disableElevation disabled={loading || !contado}
            startIcon={<CheckCircle style={{ width: 16, height: 16 }} />}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {loading ? 'Enviando...' : 'Firmar y enviar cierre'}
          </MuiButton>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CajaPage() {
  const [loading, setLoading]         = useState(true);
  const [turno, setTurno]             = useState<Turno | null>(null);
  const [desglose, setDesglose]       = useState<Desglose | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [ventasPorMetodo, setVentasPorMetodo] = useState<VentaPorMetodo[]>([]);
  const [terminalActiva, setTerminalActiva]   = useState<Terminal | null>(null);

  const [montoApertura, setMontoApertura] = useState('');
  const [aperObs, setAperObs]             = useState('');
  const [abriendo, setAbriendo]           = useState(false);
  const [terminales, setTerminales]       = useState<Terminal[]>([]);
  const [terminalId, setTerminalId]       = useState<number | null>(null);

  const [showMovimiento, setShowMovimiento] = useState(false);
  const [showCierre, setShowCierre]         = useState(false);
  const [showMovs, setShowMovs]             = useState(false);

  const prevEstado = useRef<EstadoTurno | null>(null);

  const fetchTurno = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/caja/turnos').catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setTurno(data.turno ?? null);
      setDesglose(data.desglose ?? null);
      setMovimientos(data.movimientos ?? []);
      setVentasPorMetodo(data.ventasPorMetodo ?? []);
      setTerminalActiva(data.terminal ?? null);

      const terms: Terminal[] = data.terminales ?? [];
      setTerminales(terms);
      // Preselecciona la primera terminal por defecto (si hay alguna).
      setTerminalId(prev => prev ?? (terms.length > 0 ? terms[0].id : null));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTurno(); }, [fetchTurno]);

  // Polling mientras hay cierre pendiente — revisa cada 30 s (cada poll dispara
  // ~7 queries; 30s reduce a la mitad la carga sin afectar la espera del cajero).
  useEffect(() => {
    if (turno?.estado !== 'CIERRE_SOLICITADO') return;
    const iv = setInterval(fetchTurno, 30_000);
    return () => clearInterval(iv);
  }, [turno?.estado, fetchTurno]);

  useEffect(() => {
    const prev = prevEstado.current;
    const curr = turno?.estado ?? null;
    if (prev === 'CIERRE_SOLICITADO') {
      if (curr === 'CERRADO') toast.success('✓ Tu cuadre fue aprobado por el administrador', { duration: 6000 });
      else if (curr === 'ABIERTO') toast.error('Tu cuadre fue rechazado — revisa el motivo y vuelve a contar', { duration: 8000 });
    }
    prevEstado.current = curr;
  }, [turno?.estado]);

  async function abrirTurno(e: React.FormEvent) {
    e.preventDefault();
    const monto = parseFloat(montoApertura.replace(',', '.'));
    if (isNaN(monto) || monto < 0) { toast.error('Monto inválido'); return; }

    setAbriendo(true);
    const res = await fetch('/api/caja/turnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        montoApertura: monto,
        observaciones: aperObs || undefined,
        terminalId: terminalId ?? undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setAbriendo(false);

    if (res.ok) { toast.success('Turno de caja abierto'); setMontoApertura(''); setAperObs(''); fetchTurno(); }
    else toast.error(data.error ?? 'Error al abrir caja');
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <CircularProgress size={36} color="primary" />
      </Box>
    );
  }

  // ── Sin turno: apertura ──────────────────────────────────────────────────────
  if (!turno) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 440, mx: 'auto', mt: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: '#e0e7fd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet style={{ width: 20, height: 20, color: '#3658e1' }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Apertura de caja</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>No tienes un turno activo</Typography>
          </Box>
        </Box>

        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '16px' }}>
          <CardContent sx={{ p: '24px !important' }}>
            <Box component="form" onSubmit={abrirTurno} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {terminales.length > 0 && (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>Terminal / Caja</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    {terminales.map(t => (
                      <Box key={t.id} component="button" type="button" onClick={() => setTerminalId(t.id)}
                        sx={{ borderRadius: '10px', border: '1px solid', px: 1.5, py: 1.25, fontSize: '0.875rem', fontWeight: 500, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                          ...(terminalId === t.id
                            ? { borderColor: '#3658e1', bgcolor: '#eef2fe', color: '#065f46', boxShadow: '0 0 0 1px #3658e1' }
                            : { borderColor: '#d1d5db', color: '#374151', bgcolor: 'white', '&:hover': { bgcolor: 'grey.50' } }) }}>
                        {t.nombre}
                      </Box>
                    ))}
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.75 }}>
                    Selecciona la caja física en la que abres el turno.
                  </Typography>
                </Box>
              )}
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>Monto de apertura (RD$)</Typography>
                <MuiTextField
                  type="number" placeholder="0.00"
                  value={montoApertura} onChange={e => setMontoApertura(e.target.value)}
                  size="small" fullWidth required autoFocus
                  slotProps={{ htmlInput: { min: '0', step: '0.01', style: { fontSize: '1.25rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' } } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                />
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.75 }}>
                  Efectivo físico que estás depositando en la caja para iniciar el turno.
                </Typography>
              </Box>
              <MuiTextField
                label="Observaciones (opcional)" placeholder="Ej: Turno de la mañana"
                value={aperObs} onChange={e => setAperObs(e.target.value)}
                multiline rows={2} size="small" fullWidth
                slotProps={{ htmlInput: { maxLength: 500 } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />
              <MuiButton type="submit" variant="contained" color="primary" disableElevation fullWidth
                disabled={abriendo || !montoApertura}
                startIcon={abriendo ? <CircularProgress size={16} color="inherit" /> : <Wallet style={{ width: 16, height: 16 }} />}
                sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700, py: 1.5 }}>
                {abriendo ? 'Abriendo...' : 'Confirmar apertura'}
              </MuiButton>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // ── Turno CIERRE_SOLICITADO ──────────────────────────────────────────────────
  if (turno.estado === 'CIERRE_SOLICITADO') {
    const tieneDiff = turno.diferenciaCentavos !== null && turno.diferenciaCentavos !== 0;
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 520, mx: 'auto', mt: 4 }}>
        <Card elevation={0} sx={{ border: '1px solid #fde68a', bgcolor: '#fffbeb', borderRadius: '16px' }}>
          <CardContent sx={{ p: '24px !important', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: '#fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Clock style={{ width: 20, height: 20, color: '#92400e' }} />
              </Box>
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#78350f' }}>Cuadre enviado — pendiente de aprobación</Typography>
                {turno.numeroCierre && (
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#b45309' }}>{turno.numeroCierre}</Typography>
                )}
              </Box>
            </Box>

            <Typography variant="body2" sx={{ color: '#92400e' }}>
              Tu cuadre fue firmado y enviado al administrador para su revisión. Recibirás una notificación cuando sea aprobado o rechazado.
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              {[
                { label: 'Esperado', value: fmtDOP(turno.montoEsperadoCentavos ?? 0) },
                { label: 'Contado', value: fmtDOP(turno.efectivoContadoCentavos ?? 0) },
              ].map(item => (
                <Box key={item.label} sx={{ bgcolor: 'background.paper', borderRadius: '10px', border: '1px solid #fde68a', p: 1.5 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{item.label}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{item.value}</Typography>
                </Box>
              ))}
            </Box>

            {tieneDiff ? (
              <Alert severity="error" sx={{ borderRadius: '8px' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Descuadre: {turno.diferenciaCentavos! > 0 ? '+' : ''}{fmtDOP(turno.diferenciaCentavos!)}
                </Typography>
                {turno.cierreObs && <Typography variant="caption" sx={{ fontStyle: 'italic' }}>"{turno.cierreObs}"</Typography>}
              </Alert>
            ) : (
              <Alert severity="success" icon={<CheckCircle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Caja cuadrada — sin diferencias</Typography>
              </Alert>
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  // ── Turno ABIERTO ────────────────────────────────────────────────────────────
  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: '#e0e7fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet style={{ width: 20, height: 20, color: '#3658e1' }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{terminalActiva ? terminalActiva.nombre : 'Mi caja'}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Abierta a las {fmtHora(turno.aperturaAt)}</Typography>
          </Box>
        </Box>
        <Chip
          label="Abierta"
          size="small"
          sx={{ bgcolor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontWeight: 700, height: 26, '& .MuiChip-label': { px: 1.5 } }}
        />
      </Box>

      {/* Desglose */}
      {desglose && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          <StatCard label="Apertura" value={fmtDOP(desglose.montoApertura)} />
          <StatCard label="Ventas efect." value={fmtDOP(desglose.ventasEfectivo)} color="emerald" />
          <StatCard label="Entradas netas" value={fmtDOP(desglose.entradas - desglose.salidas)} color={desglose.entradas >= desglose.salidas ? 'gray' : 'red'} />
          <StatCard label="Total esperado" value={fmtDOP(desglose.esperado)} color="emerald" sub="Efectivo estimado en caja" />
        </Box>
      )}

      {/* Ventas por método */}
      {ventasPorMetodo.length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
          <CardContent sx={{ p: '16px 20px !important' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Ventas del turno por método</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {fmtDOP(ventasPorMetodo.reduce((s, v) => s + v.total, 0))}
              </Typography>
            </Box>
            {ventasPorMetodo.map(v => {
              const esEfectivo = v.metodo === 'efectivo' || v.metodo === 'cash';
              return (
                <Box key={v.metodo} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {METODO_LABELS[v.metodo] ?? v.metodo}
                    {!esEfectivo && <Typography variant="caption" sx={{ color: 'text.disabled' }}>(no afecta caja)</Typography>}
                  </Typography>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', color: esEfectivo ? '#059669' : 'text.secondary', fontWeight: esEfectivo ? 600 : 400 }}>
                    {fmtDOP(v.total)}
                  </Typography>
                </Box>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Acciones */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <MuiButton variant="outlined" startIcon={<Plus style={{ width: 16, height: 16 }} />}
          onClick={() => setShowMovimiento(true)}
          sx={{ borderRadius: '8px', textTransform: 'none', borderColor: 'divider', color: 'text.secondary' }}>
          Movimiento
        </MuiButton>
        <MuiButton variant="contained" color="primary" disableElevation
          startIcon={<CheckCircle style={{ width: 16, height: 16 }} />}
          onClick={() => setShowCierre(true)}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
          Solicitar cierre
        </MuiButton>
      </Box>

      {/* Movimientos */}
      {movimientos.length > 0 ? (
        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          <MuiButton
            fullWidth
            onClick={() => setShowMovs(v => !v)}
            endIcon={showMovs ? <ChevronUp style={{ width: 16, height: 16 }} /> : <ChevronDown style={{ width: 16, height: 16 }} />}
            sx={{ px: 2.5, py: 1.75, justifyContent: 'space-between', textTransform: 'none', color: 'text.primary', fontWeight: 600, borderRadius: 0 }}
          >
            Movimientos del turno ({movimientos.length})
          </MuiButton>
          <Collapse in={showMovs}>
            {movimientos.map((m, i) => (
              <Box key={m.id}>
                {i > 0 && <Divider />}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 1.5 }}>
                  <Chip
                    label={TIPO_LABELS[m.tipo] ?? m.tipo}
                    size="small"
                    icon={['ENTRADA'].includes(m.tipo) ? <ArrowDownCircle style={{ width: 12, height: 12 }} /> : <ArrowUpCircle style={{ width: 12, height: 12 }} />}
                    sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 0.75 }, ...(TIPO_CHIP_SX[m.tipo] ?? {}) }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.descripcion ?? m.motivo ?? '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.75 }}>
                      <Box component="span">{fmtHora(m.createdAt)}</Box>
                      <Box component="span" sx={{ color: '#d1d5db' }}>·</Box>
                      {/* Método del movimiento + si toca o no el efectivo en caja */}
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <Box component="span" sx={{ color: '#6b7280', fontWeight: 500 }}>{METODO_LABELS[m.metodo] ?? m.metodo}</Box>
                        {esEfectivo(m.metodo)
                          ? <Box component="span" sx={{ fontSize: 10, color: '#059669' }}>afecta caja</Box>
                          : <Box component="span" sx={{ fontSize: 10, color: '#9ca3af' }}>no afecta caja</Box>}
                      </Box>
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0, color: ['ENTRADA', 'AJUSTE'].includes(m.tipo) ? '#059669' : '#dc2626' }}>
                    {['ENTRADA', 'AJUSTE'].includes(m.tipo) ? '+' : '−'}{fmtDOP(m.montoCentavos)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Collapse>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 2, bgcolor: 'grey.50', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
          <Info style={{ width: 16, height: 16, color: '#9ca3af', flexShrink: 0 }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Sin movimientos en este turno aún.</Typography>
        </Box>
      )}

      {showMovimiento && (
        <ModalMovimiento turnoId={turno.id} onClose={() => setShowMovimiento(false)} onCreated={fetchTurno} />
      )}
      {showCierre && desglose && (
        <ModalCierre turno={turno} desglose={desglose} ventasPorMetodo={ventasPorMetodo}
          onClose={() => setShowCierre(false)} onCerrado={fetchTurno} />
      )}
    </Box>
  );
}
