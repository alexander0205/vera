'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Menu,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowLeft, Download, FileText, Loader2, XCircle, CheckCircle,
  Clock, ChevronDown, Mail, Pencil, FileCheck, MoreVertical,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Cotizacion {
  id:                   number;
  numero:               string;
  estado:               string;
  razonSocialComprador: string | null;
  rncComprador:         string | null;
  emailComprador:       string | null;
  fechaEmision:         string;
  fechaVencimiento:     string | null;
  montoSubtotal:        number;
  montoTotal:           number;
  items:                string | null;
  notas:                string | null;
  terminosCondiciones:  string | null;
}

interface LineItem {
  descripcion: string;
  precio:      number;
  cantidad:    number;
}

// ─── Estado chip config ───────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<string, {
  label: string;
  color: string;
  bg:    string;
  icon:  React.ElementType;
}> = {
  borrador:  { label: 'Pendiente', color: '#4b5563', bg: '#f3f4f6', icon: Clock },
  enviada:   { label: 'Enviada',   color: '#1d4ed8', bg: '#dbeafe', icon: Mail },
  aceptada:  { label: 'Aceptada',  color: '#15803d', bg: '#dcfce7', icon: CheckCircle },
  rechazada: { label: 'Rechazada', color: '#b91c1c', bg: '#fee2e2', icon: XCircle },
  vencida:   { label: 'Vencida',   color: '#92400e', bg: '#fef3c7', icon: Clock },
};

// Transiciones de estado válidas
const NEXT_STATES: Record<string, Array<{ value: string; label: string }>> = {
  borrador:  [{ value: 'enviada',   label: 'Marcar como Enviada' }],
  enviada:   [
    { value: 'aceptada',  label: 'Marcar como Aceptada' },
    { value: 'rechazada', label: 'Marcar como Rechazada' },
  ],
  aceptada:  [],
  rechazada: [],
  vencida:   [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-DO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return iso; }
}

function fmtDOP(centavos: number): string {
  return `RD$ ${(centavos / 100).toLocaleString('es-DO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}

// ─── Card sx shorthand ────────────────────────────────────────────────────────

const cardSx = {
  bgcolor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  overflow: 'hidden',
} as const;

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CotizacionDetallePage() {
  const params = useParams();
  const router = useRouter();
  const cotId  = params.id as string;

  const [cot, setCot]         = useState<Cotizacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [showEmail, setShowEmail]       = useState(false);
  const [emailTo, setEmailTo]           = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const [converting, setConverting]     = useState(false);

  const [changingEstado, setChangingEstado] = useState(false);

  // Dropdown anchors
  const [estadoAnchor, setEstadoAnchor]   = useState<null | HTMLElement>(null);
  const [moreAnchor, setMoreAnchor]       = useState<null | HTMLElement>(null);

  // ─── Carga ──────────────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/cotizaciones/${cotId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando cotización');
      setCot(data.cotizacion);
      setEmailTo(data.cotizacion?.emailComprador ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [cotId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Cambiar estado ──────────────────────────────────────────────────────────

  async function handleCambiarEstado(nuevoEstado: string) {
    setEstadoAnchor(null);
    setChangingEstado(true);
    try {
      const res = await fetch(`/api/cotizaciones/${cotId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ estado: nuevoEstado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cambiando estado');
      toast.success(`Estado cambiado a "${nuevoEstado}"`);
      await cargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cambiando estado');
    } finally {
      setChangingEstado(false);
    }
  }

  // ─── Enviar email ────────────────────────────────────────────────────────────

  async function handleSendEmail() {
    if (!emailTo) { toast.error('Email requerido'); return; }
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/cotizaciones/${cotId}/email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: emailTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error enviando email');
      toast.success('Cotización enviada por correo');
      setShowEmail(false);
      // Marcar como enviada automáticamente si aún es borrador
      if (cot?.estado === 'borrador') {
        await handleCambiarEstado('enviada');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error enviando email');
    } finally {
      setSendingEmail(false);
    }
  }

  // ─── Convertir a factura ─────────────────────────────────────────────────────

  async function handleConvertir() {
    setMoreAnchor(null);
    setConverting(true);
    try {
      const res = await fetch(`/api/cotizaciones/${cotId}/convertir`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error convirtiendo');
      toast.success('Borrador de factura creado');
      router.push(data.redirect);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error convirtiendo');
      setConverting(false);
    }
  }

  // ─── Guards ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <CircularProgress size={32} sx={{ color: '#0d9488' }} />
      </Box>
    );
  }

  if (error || !cot) {
    return (
      <Box sx={{ p: 3 }}>
        <Paper
          sx={{
            bgcolor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            p: 4,
            textAlign: 'center',
          }}
        >
          <XCircle size={48} style={{ color: '#f87171', margin: '0 auto 12px' }} />
          <Typography sx={{ color: '#b91c1c', fontWeight: 500 }}>
            {error ?? 'Cotización no encontrada'}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => router.push('/dashboard/cotizaciones')}
            sx={{ mt: 2, borderRadius: '8px', textTransform: 'none' }}
          >
            Volver a cotizaciones
          </Button>
        </Paper>
      </Box>
    );
  }

  const estadoCfg    = ESTADO_CONFIG[cot.estado] ?? { label: cot.estado, color: '#374151', bg: '#f3f4f6', icon: Clock };
  const EstadoIcon   = estadoCfg.icon;
  const transiciones = NEXT_STATES[cot.estado] ?? [];

  let parsedItems: LineItem[] = [];
  try { if (cot.items) parsedItems = JSON.parse(cot.items); } catch { /* ignore */ }

  return (
    <Box
      component="section"
      sx={{ bgcolor: '#eef0f7', p: { xs: 2, sm: 3 }, minHeight: '100%', display: 'flex', flexDirection: 'column' }}
    >

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          alignItems: { lg: 'flex-start' },
          justifyContent: { lg: 'space-between' },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            component={Link}
            href="/dashboard/cotizaciones"
            variant="text"
            size="small"
            startIcon={<ArrowLeft size={16} />}
            sx={{ textTransform: 'none', color: '#374151', minWidth: 0 }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Cotizaciones</Box>
          </Button>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography
                variant="h5"
                sx={{ fontWeight: 700, color: '#111827', fontFamily: 'monospace', fontSize: { xs: '1.125rem', sm: '1.25rem' } }}
              >
                {cot.numero}
              </Typography>
              <Chip
                icon={<EstadoIcon size={14} />}
                label={estadoCfg.label}
                size="small"
                sx={{
                  bgcolor: estadoCfg.bg,
                  color: estadoCfg.color,
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  height: 24,
                  '& .MuiChip-icon': { color: estadoCfg.color },
                }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: '#6b7280', mt: 0.25, display: 'block' }}>
              Emitida: {fmtDate(cot.fechaEmision)}
              {cot.fechaVencimiento && (
                <> · Válida hasta: <Box component="span" sx={{ color: '#0f766e', fontWeight: 600 }}>{fmtDate(cot.fechaVencimiento)}</Box></>
              )}
            </Typography>
          </Box>
        </Box>

        {/* Acciones */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>

          {/* Cambiar estado */}
          {transiciones.length > 0 && (
            <>
              <Button
                variant="outlined"
                size="small"
                disabled={changingEstado}
                onClick={(e) => setEstadoAnchor(e.currentTarget)}
                startIcon={changingEstado
                  ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  : <CheckCircle size={16} />}
                endIcon={<ChevronDown size={14} style={{ opacity: 0.6 }} />}
                sx={{ borderRadius: '8px', textTransform: 'none' }}
              >
                Cambiar estado
              </Button>
              <Menu
                anchorEl={estadoAnchor}
                open={Boolean(estadoAnchor)}
                onClose={() => setEstadoAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                {transiciones.map(t => (
                  <MenuItem key={t.value} onClick={() => handleCambiarEstado(t.value)}>
                    {t.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}

          {/* Editar */}
          {['borrador', 'enviada'].includes(cot.estado) && (
            <Button
              component={Link}
              href={`/dashboard/cotizaciones/${cot.id}/editar`}
              variant="outlined"
              size="small"
              startIcon={<Pencil size={16} />}
              sx={{ borderRadius: '8px', textTransform: 'none' }}
            >
              Editar
            </Button>
          )}

          {/* Más acciones */}
          <>
            <Button
              variant="outlined"
              size="small"
              onClick={(e) => setMoreAnchor(e.currentTarget)}
              sx={{ borderRadius: '8px', textTransform: 'none', minWidth: 0, px: 1 }}
            >
              <MoreVertical size={16} />
            </Button>
            <Menu
              anchorEl={moreAnchor}
              open={Boolean(moreAnchor)}
              onClose={() => setMoreAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ paper: { sx: { minWidth: 200 } } as object }}
            >
              <MenuItem
                component="a"
                href={`/api/pdf/cotizacion/${cot.id}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMoreAnchor(null)}
              >
                <Download size={16} style={{ color: '#6b7280', marginRight: 8 }} />
                Descargar PDF
              </MenuItem>
              <MenuItem onClick={() => { setMoreAnchor(null); setShowEmail(true); }}>
                <Mail size={16} style={{ color: '#6b7280', marginRight: 8 }} />
                Enviar por correo
              </MenuItem>
              {cot.estado === 'aceptada' && (
                <MenuItem onClick={handleConvertir} disabled={converting}>
                  <FileCheck size={16} style={{ color: '#0d9488', marginRight: 8 }} />
                  {converting ? 'Convirtiendo…' : 'Convertir a factura'}
                </MenuItem>
              )}
            </Menu>
          </>
        </Box>
      </Box>

      {/* ── Layout split ────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 320px' },
          gap: 2.5,
        }}
      >

        {/* ── LEFT: ítems + notas ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Cliente */}
          <Paper sx={{ ...cardSx, p: 2.5 }}>
            <Typography variant="subtitle2" sx={{ color: '#374151', fontWeight: 600, mb: 1.5 }}>
              Datos del cliente
            </Typography>
            {cot.razonSocialComprador ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  columnGap: 3,
                  rowGap: 1,
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>
                    Razón social
                  </Typography>
                  <Typography sx={{ fontWeight: 500, color: '#111827', fontSize: '0.875rem' }}>
                    {cot.razonSocialComprador}
                  </Typography>
                </Box>
                {cot.rncComprador && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>
                      RNC
                    </Typography>
                    <Typography sx={{ color: '#1f2937', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                      {cot.rncComprador}
                    </Typography>
                  </Box>
                )}
                {cot.emailComprador && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af' }}>
                      Email
                    </Typography>
                    <Typography sx={{ color: '#1f2937', wordBreak: 'break-all', fontSize: '0.875rem' }}>
                      {cot.emailComprador}
                    </Typography>
                  </Box>
                )}
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                Sin cliente especificado
              </Typography>
            )}
          </Paper>

          {/* Ítems */}
          <Paper sx={cardSx}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #f3f4f6' }}>
              <Typography variant="subtitle2" sx={{ color: '#374151', fontWeight: 600 }}>
                Ítems / Servicios
              </Typography>
            </Box>
            {parsedItems.length > 0 ? (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', fontWeight: 500, borderBottom: '1px solid #f3f4f6' }}>
                        Descripción
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', fontWeight: 500, borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                        Precio
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', fontWeight: 500, borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                        Cant.
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', fontWeight: 500, borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>
                        Total
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {parsedItems.map((it, idx) => (
                      <TableRow
                        key={idx}
                        sx={{ '&:hover': { bgcolor: 'rgba(249,250,251,0.6)' } }}
                      >
                        <TableCell sx={{ fontWeight: 500, color: '#111827', borderBottom: '1px solid #f9fafb' }}>
                          {it.descripcion}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#374151', borderBottom: '1px solid #f9fafb' }}>
                          {fmtDOP(it.precio * 100)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: '#374151', borderBottom: '1px solid #f9fafb' }}>
                          {it.cantidad}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827', borderBottom: '1px solid #f9fafb' }}>
                          {fmtDOP(it.precio * it.cantidad * 100)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic', px: 2.5, py: 3, textAlign: 'center' }}>
                Sin ítems registrados
              </Typography>
            )}
          </Paper>

          {/* Notas */}
          {cot.notas && (
            <Paper sx={{ ...cardSx, p: 2.5 }}>
              <Typography variant="subtitle2" sx={{ color: '#374151', fontWeight: 600, mb: 1 }}>
                Notas
              </Typography>
              <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                {cot.notas}
              </Typography>
            </Paper>
          )}

          {/* Términos */}
          {cot.terminosCondiciones && (
            <Paper sx={{ ...cardSx, p: 2.5 }}>
              <Typography variant="subtitle2" sx={{ color: '#374151', fontWeight: 600, mb: 1 }}>
                Términos y condiciones
              </Typography>
              <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                {cot.terminosCondiciones}
              </Typography>
            </Paper>
          )}
        </Box>

        {/* ── RIGHT: sidebar ── */}
        <Box
          component="aside"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            position: { lg: 'sticky' },
            top: { lg: '16px' },
            alignSelf: { lg: 'flex-start' },
          }}
        >

          {/* Resumen */}
          <Paper sx={{ ...cardSx, p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <FileText size={16} style={{ color: '#0d9488' }} />
              <Typography variant="subtitle2" sx={{ color: '#374151', fontWeight: 600 }}>
                Resumen
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.875rem', color: '#4b5563' }}>Subtotal</Typography>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{fmtDOP(cot.montoSubtotal)}</Typography>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 0.5 }}>
                <Typography sx={{ fontWeight: 700, color: '#111827' }}>Total</Typography>
                <Typography sx={{ fontWeight: 700, color: '#111827', fontSize: '1rem' }}>{fmtDOP(cot.montoTotal)}</Typography>
              </Box>
            </Box>
          </Paper>

          {/* Info */}
          <Paper sx={{ ...cardSx, px: 2, py: 2 }}>
            <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', mb: 1 }}>
              Información
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Número</Typography>
                <Typography sx={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>{cot.numero}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Estado</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#1f2937', textTransform: 'capitalize' }}>{estadoCfg.label}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Fecha emisión</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#1f2937' }}>{fmtDate(cot.fechaEmision)}</Typography>
              </Box>
              {cot.fechaVencimiento && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Vencimiento</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#0f766e', fontWeight: 600 }}>{fmtDate(cot.fechaVencimiento)}</Typography>
                </Box>
              )}
            </Box>
          </Paper>

          {/* Acciones rápidas */}
          <Paper sx={{ ...cardSx, p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              component="a"
              href={`/api/pdf/cotizacion/${cot.id}`}
              target="_blank"
              rel="noreferrer"
              variant="outlined"
              startIcon={<FileText size={16} />}
              fullWidth
              sx={{
                borderRadius: '8px',
                textTransform: 'none',
                color: '#0f766e',
                borderColor: '#99f6e4',
                '&:hover': { bgcolor: '#f0fdf4', borderColor: '#0d9488' },
              }}
            >
              Ver PDF
            </Button>
            <Button
              variant="outlined"
              startIcon={<Mail size={16} />}
              fullWidth
              onClick={() => setShowEmail(true)}
              sx={{ borderRadius: '8px', textTransform: 'none' }}
            >
              Enviar por correo
            </Button>
            {cot.estado === 'aceptada' && (
              <Button
                variant="contained"
                disableElevation
                fullWidth
                onClick={handleConvertir}
                disabled={converting}
                startIcon={converting
                  ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  : <FileCheck size={16} />}
                sx={{
                  borderRadius: '8px',
                  textTransform: 'none',
                  bgcolor: '#0d9488',
                  '&:hover': { bgcolor: '#0f766e' },
                }}
              >
                {converting ? 'Convirtiendo…' : 'Convertir a factura'}
              </Button>
            )}
          </Paper>
        </Box>
      </Box>

      {/* ── Bottom bar ───────────────────────────────────────────────────────── */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 30,
          mx: { xs: -2, sm: -3 },
          mt: 'auto',
          bgcolor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid #e5e7eb',
          boxShadow: '0 -4px 12px -2px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: { xs: 'column-reverse', sm: 'row' },
          alignItems: { sm: 'center' },
          justifyContent: { sm: 'space-between' },
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          py: 1.5,
        }}
      >
        <Button
          variant="outlined"
          onClick={() => router.push('/dashboard/cotizaciones')}
          sx={{
            borderRadius: '8px',
            textTransform: 'none',
            color: '#4b5563',
            height: { xs: 44, sm: 36 },
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          Volver
        </Button>
        <Box sx={{ display: 'flex', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
          <Button
            component="a"
            href={`/api/pdf/cotizacion/${cot.id}`}
            target="_blank"
            rel="noreferrer"
            variant="outlined"
            startIcon={<FileText size={16} />}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              height: { xs: 44, sm: 36 },
              flex: { xs: 1, sm: 'none' },
            }}
          >
            Ver PDF
          </Button>
          {['borrador', 'enviada'].includes(cot.estado) && (
            <Button
              component={Link}
              href={`/dashboard/cotizaciones/${cot.id}/editar`}
              variant="contained"
              disableElevation
              startIcon={<Pencil size={16} />}
              sx={{
                borderRadius: '8px',
                textTransform: 'none',
                bgcolor: '#0d9488',
                '&:hover': { bgcolor: '#0f766e' },
                height: { xs: 44, sm: 36 },
                flex: { xs: 1, sm: 'none' },
              }}
            >
              Editar
            </Button>
          )}
        </Box>
      </Box>

      {/* ── Modal: Enviar email ──────────────────────────────────────────────── */}
      <Dialog
        open={showEmail}
        onClose={() => setShowEmail(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: '12px' } } as object }}
      >
        <DialogTitle sx={{ pb: 1 }}>Enviar cotización por correo</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              label="Destinatario"
              type="email"
              size="small"
              fullWidth
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="cliente@dominio.com"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <Typography variant="caption" sx={{ color: '#6b7280' }}>
              Se adjuntará el PDF de la cotización. Si el estado es &quot;Borrador&quot;, se cambiará automáticamente a &quot;Enviada&quot;.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            variant="outlined"
            onClick={() => setShowEmail(false)}
            disabled={sendingEmail}
            sx={{ borderRadius: '8px', textTransform: 'none' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={handleSendEmail}
            disabled={sendingEmail || !emailTo}
            startIcon={sendingEmail
              ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              : <Mail size={16} />}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              bgcolor: '#0d9488',
              '&:hover': { bgcolor: '#0f766e' },
            }}
          >
            {sendingEmail ? 'Enviando…' : 'Enviar'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
