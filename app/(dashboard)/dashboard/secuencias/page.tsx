'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, Pencil, Trash2, AlertTriangle, Loader2, RefreshCw, ExternalLink,
  Hash, Calendar, CheckCircle2, XCircle, AlertCircle, Star, Infinity,
} from 'lucide-react';
import { CATEGORIAS_ECF } from '@/lib/ecf/categorias';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';

interface Secuencia {
  id:                   number;
  tipoEcf:              string;
  nombre:               string;
  secuenciaDesde:       string;
  secuenciaActual:      string;
  secuenciaHasta:       string;
  disponibles:          number;
  fechaVencimiento:     string | null;
  preferida:            boolean;
  numeracionAutomatica: boolean;
  prefijo:              string | null;
  pieDeFactura:         string | null;
  sucursal:             string | null;
  estado:               'activa' | 'vencida' | 'agotada';
}

const TIPOS_PLANO: Record<string, { corto: string }> = {};
for (const cat of CATEGORIAS_ECF) {
  for (const t of cat.tipos) {
    TIPOS_PLANO[t.codigo] = { corto: t.etiqueta };
  }
}

function getLabelTipo(s: Secuencia): string {
  if (s.tipoEcf === 'sin-ncf') return 'Sin NCF';
  return TIPOS_PLANO[s.tipoEcf]?.corto ?? `e${s.tipoEcf}`;
}

function formatEncf(tipo: string, numero: number | string): string {
  return `E${tipo}${String(numero).padStart(10, '0')}`;
}

function today(): string { return new Date().toISOString().slice(0, 10); }

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Timestamp UTC → YYYY-MM-DD en hora LOCAL, para inputs date. Evita el off-by-one
 *  de `iso.slice(0,10)` (que toma la parte UTC) vs lo que muestra fmtFecha (local). */
function toLocalDateInput(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Badge de estado ──────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: Secuencia['estado'] }) {
  if (estado === 'activa') {
    return (
      <Chip size="small" label="Activa"
        icon={<CheckCircle2 style={{ width: 10, height: 10 }} />}
        sx={{ bgcolor: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', height: 20, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 0.75 }, '& .MuiChip-icon': { color: 'inherit', ml: '4px' } }}
      />
    );
  }
  if (estado === 'vencida') {
    return (
      <Chip size="small" label="Vencida"
        icon={<XCircle style={{ width: 10, height: 10 }} />}
        sx={{ bgcolor: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', height: 20, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 0.75 }, '& .MuiChip-icon': { color: 'inherit', ml: '4px' } }}
      />
    );
  }
  return (
    <Chip size="small" label="Agotada"
      icon={<AlertCircle style={{ width: 10, height: 10 }} />}
      sx={{ bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', height: 20, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 0.75 }, '& .MuiChip-icon': { color: 'inherit', ml: '4px' } }}
    />
  );
}

export default function SecuenciasPage() {
  const [secuencias, setSecuencias] = useState<Secuencia[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const [editTarget, setEditTarget]     = useState<Secuencia | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Secuencia | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

  const [editNombre, setEditNombre]         = useState('');
  const [editHasta, setEditHasta]           = useState('');
  const [editSiguiente, setEditSiguiente]   = useState('');
  const [editVenc, setEditVenc]             = useState('');
  const [editPreferida, setEditPreferida]   = useState(false);
  const [editAutomatica, setEditAutomatica] = useState(false);
  const [editSucursal, setEditSucursal]     = useState('');
  const [editPie, setEditPie]               = useState('');

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/secuencias');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando numeraciones');
      setSecuencias(data.sequences);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirEdicion(s: Secuencia) {
    setEditTarget(s);
    setEditNombre(s.nombre);
    setEditHasta(s.secuenciaHasta);
    setEditSiguiente(s.secuenciaActual);
    setEditVenc(toLocalDateInput(s.fechaVencimiento));
    setEditPreferida(s.preferida);
    setEditAutomatica(s.numeracionAutomatica);
    setEditSucursal(s.sucursal ?? '');
    setEditPie(s.pieDeFactura ?? '');
    setOpError(null);
  }

  async function handleEditar() {
    if (!editTarget) return;
    if (!editNombre.trim()) { setOpError('El nombre es obligatorio.'); return; }
    setSaving(true); setOpError(null);
    try {
      const esSinNcf = editTarget.tipoEcf === 'sin-ncf';
      const payload: Record<string, unknown> = {
        nombre: editNombre.trim(),
        preferida: editPreferida,
        numeracionAutomatica: editAutomatica,
        sucursal: editSucursal.trim() || null,
        pieDeFactura: editPie.trim() || null,
      };
      if (!esSinNcf && editHasta) payload.hasta = parseInt(editHasta);
      if (!esSinNcf && editSiguiente) payload.siguiente = parseInt(editSiguiente);
      if (editVenc) payload.fechaVencimiento = editVenc;

      const res  = await fetch(`/api/secuencias/${editTarget.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error actualizando');
      setEditTarget(null); await cargar();
    } catch (e: unknown) { setOpError(e instanceof Error ? e.message : 'Error actualizando'); }
    finally { setSaving(false); }
  }

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true); setOpError(null);
    try {
      const res  = await fetch(`/api/secuencias/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null); await cargar();
    } catch (e: unknown) { setOpError(e instanceof Error ? e.message : 'Error eliminando'); }
    finally { setDeleting(false); }
  }

  const filtradas = filtroTipo === 'todos'
    ? secuencias
    : secuencias.filter((s) => s.tipoEcf === filtroTipo);

  const tiposPresentes = Array.from(new Set(secuencias.map(s => s.tipoEcf)));

  // Edit modal derived values
  const editEsSinNcf = editTarget?.tipoEcf === 'sin-ncf';
  const editShowFechaVenc = editTarget && !editEsSinNcf && editTarget.tipoEcf !== '32' && editTarget.tipoEcf !== '34';
  const editShowPie = editTarget && CATEGORIAS_ECF
    .filter(c => c.id === 'factura-venta' || c.id === 'nota-credito')
    .some(c => c.tipos.some(t => t.codigo === editTarget.tipoEcf));

  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'flex-start' }, justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>Numeraciones de comprobantes</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Registra aquí los rangos de e-NCF autorizados por la DGII para tu empresa.{' '}
              <Box component="a" href="https://ofv.dgii.gov.do" target="_blank" rel="noopener noreferrer"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}>
                Solicitar rangos en OFV <ExternalLink style={{ width: 12, height: 12 }} />
              </Box>
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <IconButton size="small" onClick={cargar} disabled={loading}
              sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', color: 'text.secondary' }}>
              <RefreshCw style={{ width: 16, height: 16, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </IconButton>
            <Link href="/dashboard/secuencias/nueva" style={{ textDecoration: 'none' }}>
              <MuiButton variant="contained" disableElevation
                startIcon={<Plus style={{ width: 14, height: 14 }} />}
                sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                Nueva numeración
              </MuiButton>
            </Link>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" icon={<AlertTriangle style={{ width: 18, height: 18 }} />} sx={{ borderRadius: '12px' }}>
            {error}
          </Alert>
        )}

        {/* Card principal */}
        <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '16px', overflow: 'hidden' }}>

          {/* Filtro */}
          <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControl size="small" sx={{ width: 280 }}>
              <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="todos">Todos los tipos</MenuItem>
                {tiposPresentes.map((code) => (
                  <MenuItem key={code} value={code}>
                    {code === 'sin-ncf' ? 'Sin NCF' : (TIPOS_PLANO[code]?.corto ?? `e${code}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {!loading && (
              <Typography variant="body2" sx={{ color: 'text.disabled', ml: 'auto' }}>
                {filtradas.length} {filtradas.length === 1 ? 'numeración' : 'numeraciones'}
              </Typography>
            )}
          </Box>

          {/* Contenido */}
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 10 }}>
              <CircularProgress size={36} color="primary" />
            </Box>
          ) : filtradas.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 10, px: 3 }}>
              <Box sx={{ width: 48, height: 48, bgcolor: '#f0fdfa', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
                <Hash style={{ width: 22, height: 22, color: '#0d9488' }} />
              </Box>
              <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                Sin numeraciones registradas
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, maxWidth: 360, mx: 'auto' }}>
                Solicita tus rangos de e-NCF en la Oficina Virtual de la DGII y regístralos aquí.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Box component="a" href="https://ofv.dgii.gov.do" target="_blank" rel="noopener noreferrer"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.875rem', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}>
                  <ExternalLink style={{ width: 14, height: 14 }} />
                  Ir a OFV DGII
                </Box>
                <Link href="/dashboard/secuencias/nueva" style={{ textDecoration: 'none' }}>
                  <MuiButton variant="contained" size="small" disableElevation
                    startIcon={<Plus style={{ width: 14, height: 14 }} />}
                    sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
                    Nueva numeración
                  </MuiButton>
                </Link>
              </Box>
            </Box>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 820 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(249,250,251,0.6)' }}>
                    {['Tipo / Nombre', 'Próximo e-NCF', 'Rango', 'Disponibles', 'Vencimiento', ''].map((h, i) => (
                      <TableCell key={h + i}
                        align={['Rango', 'Disponibles'].includes(h) ? 'center' : h === '' ? 'right' : 'left'}
                        sx={{ fontWeight: 700, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'text.secondary', letterSpacing: '0.05em', py: 1.5, borderBottom: '1px solid #f3f4f6' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtradas.map((s) => {
                    const esSinNcf = s.tipoEcf === 'sin-ncf';
                    const encf     = (!esSinNcf && s.estado === 'activa')
                      ? formatEncf(s.tipoEcf, s.secuenciaActual) : null;
                    const pct = (!esSinNcf && Number(s.secuenciaHasta) > 0)
                      ? Math.round((Number(s.secuenciaActual) / Number(s.secuenciaHasta)) * 100) : 0;

                    return (
                      <TableRow key={s.id} sx={{ '&:hover': { bgcolor: 'rgba(249,250,251,0.6)' }, '&:last-child td': { border: 0 } }}>
                        {/* Tipo / Nombre */}
                        <TableCell sx={{ py: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
                            <Box component="span" sx={{
                              fontFamily: 'monospace', fontSize: '0.625rem', fontWeight: 700, px: 0.75, py: 0.25, borderRadius: '4px', border: '1px solid', flexShrink: 0,
                              ...(esSinNcf
                                ? { color: '#4b5563', bgcolor: '#f9fafb', borderColor: '#e5e7eb' }
                                : { color: '#0d9488', bgcolor: '#f0fdfa', borderColor: '#99f6e4' }),
                            }}>
                              {esSinNcf ? 'Sin NCF' : `e${s.tipoEcf}`}
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                              {s.nombre}
                            </Typography>
                            {s.preferida && (
                              <Chip size="small" label="Preferida"
                                icon={<Star style={{ width: 8, height: 8, fill: '#d97706' }} />}
                                sx={{ height: 18, fontSize: '0.625rem', fontWeight: 600, bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', '& .MuiChip-label': { px: 0.5 }, '& .MuiChip-icon': { color: 'inherit', ml: '2px' } }}
                              />
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <EstadoBadge estado={s.estado} />
                            {s.sucursal && (
                              <Typography variant="caption" sx={{ color: 'text.disabled' }}>{s.sucursal}</Typography>
                            )}
                            {!esSinNcf && s.disponibles < 50 && s.estado === 'activa' && (
                              <Typography variant="caption" sx={{ color: '#d97706', fontWeight: 600 }}>¡Pocos disponibles!</Typography>
                            )}
                          </Box>
                        </TableCell>

                        {/* Próximo e-NCF */}
                        <TableCell>
                          {esSinNcf ? (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>Numeración automática</Typography>
                          ) : encf ? (
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'text.primary', letterSpacing: '-0.01em' }}>{encf}</Typography>
                          ) : (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>—</Typography>
                          )}
                        </TableCell>

                        {/* Rango */}
                        <TableCell align="center">
                          {esSinNcf ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                              <Infinity style={{ width: 16, height: 16, color: '#d1d5db' }} />
                              {s.prefijo && <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace' }}>{s.prefijo}…</Typography>}
                            </Box>
                          ) : (
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block' }}>
                                {Number(s.secuenciaActual).toLocaleString('es-DO')} – {Number(s.secuenciaHasta).toLocaleString('es-DO')}
                              </Typography>
                              <LinearProgress variant="determinate" value={Math.min(pct, 100)}
                                sx={{ mt: 0.75, height: 4, borderRadius: 2, width: 80, mx: 'auto', bgcolor: '#f3f4f6',
                                  '& .MuiLinearProgress-bar': { bgcolor: pct > 80 ? '#f87171' : pct > 50 ? '#fbbf24' : '#2dd4bf' } }} />
                            </Box>
                          )}
                        </TableCell>

                        {/* Disponibles */}
                        <TableCell align="center">
                          {esSinNcf ? (
                            <Infinity style={{ width: 16, height: 16, color: '#0d9488', margin: '0 auto' }} />
                          ) : (
                            <Typography variant="body2" sx={{ fontWeight: 700, color: s.disponibles < 10 ? '#dc2626' : s.disponibles < 50 ? '#d97706' : '#059669' }}>
                              {s.disponibles.toLocaleString('es-DO')}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Vencimiento */}
                        <TableCell>
                          {esSinNcf ? (
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>Sin vencimiento</Typography>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Calendar style={{ width: 13, height: 13, color: s.estado === 'vencida' ? '#ef4444' : '#d1d5db', flexShrink: 0 }} />
                              <Typography variant="body2" sx={{ color: s.estado === 'vencida' ? 'error.main' : 'text.secondary', fontWeight: s.estado === 'vencida' ? 700 : 400 }}>
                                {fmtFecha(s.fechaVencimiento)}
                              </Typography>
                            </Box>
                          )}
                        </TableCell>

                        {/* Acciones */}
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'flex-end' }}>
                            <IconButton size="small" onClick={() => abrirEdicion(s)} title="Editar numeración"
                              sx={{ color: 'text.disabled', '&:hover': { color: 'primary.main', bgcolor: '#f0fdfa' }, borderRadius: '6px' }}>
                              <Pencil style={{ width: 14, height: 14 }} />
                            </IconButton>
                            <IconButton size="small" onClick={() => { setDeleteTarget(s); setOpError(null); }} title="Eliminar numeración"
                              sx={{ color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: '#fef2f2' }, borderRadius: '6px' }}>
                              <Trash2 style={{ width: 14, height: 14 }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Card>
      </Box>

      {/* Modal: Editar numeración */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Editar numeración</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {editTarget && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {opError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>}

              {/* Info badge */}
              <Box sx={{ bgcolor: 'grey.50', border: '1px solid #f3f4f6', borderRadius: '12px', p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box component="span" sx={{
                  fontFamily: 'monospace', fontSize: '0.6875rem', fontWeight: 700, px: 1, py: 0.5, borderRadius: '4px', border: '1px solid',
                  ...(editEsSinNcf ? { color: '#4b5563', bgcolor: '#f3f4f6', borderColor: '#e5e7eb' } : { color: '#0d9488', bgcolor: '#f0fdfa', borderColor: '#99f6e4' }),
                }}>
                  {editEsSinNcf ? 'Sin NCF' : `e${editTarget.tipoEcf}`}
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{getLabelTipo(editTarget)}</Typography>
              </Box>

              <MuiTextField
                label="Nombre *" value={editNombre} size="small" fullWidth autoFocus
                onChange={e => setEditNombre(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Numeración preferida</Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>Se usará por defecto al emitir este tipo</Typography>
                </Box>
                <Switch checked={editPreferida} onChange={(_, v) => setEditPreferida(v)} color="primary" />
              </Box>

              <Divider />

              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Numeración automática</Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>Si está activa, el sistema asigna el siguiente número al emitir.</Typography>
                </Box>
                <Switch checked={editAutomatica} onChange={(_, v) => setEditAutomatica(v)} color="primary" />
              </Box>

              {!editEsSinNcf && (
                <MuiTextField
                  label={`Número final del rango *`} type="number" value={editHasta} size="small" fullWidth
                  slotProps={{ htmlInput: { min: 1 } }}
                  helperText={`Actual: ${editTarget.secuenciaHasta}`}
                  onChange={(e) => setEditHasta(e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              )}

              {!editEsSinNcf && (
                <MuiTextField
                  label="Siguiente número" type="number" value={editSiguiente} size="small" fullWidth
                  slotProps={{ htmlInput: { min: 1, max: Number(editTarget.secuenciaHasta) } }}
                  helperText={`Actual: ${editTarget.secuenciaActual} — próximo: ${formatEncf(editTarget.tipoEcf, editTarget.secuenciaActual)}`}
                  onChange={(e) => setEditSiguiente(e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              )}

              {editShowFechaVenc && (
                <MuiTextField
                  label="Fecha de vencimiento" type="date" value={editVenc} size="small" fullWidth
                  slotProps={{ htmlInput: { min: today() } }}
                  onChange={(e) => setEditVenc(e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              )}

              <MuiTextField
                label="Sucursal" placeholder="Opcional" value={editSucursal} size="small" fullWidth
                onChange={e => setEditSucursal(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />

              {editShowPie && (
                <MuiTextField
                  label="Pie de factura" placeholder="Texto al pie del comprobante..."
                  value={editPie} size="small" fullWidth multiline rows={3}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                  helperText={`${editPie.length}/2000 caracteres`}
                  onChange={e => setEditPie(e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton variant="outlined" onClick={() => setEditTarget(null)} disabled={saving}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</MuiButton>
          <MuiButton variant="contained" disableElevation onClick={handleEditar} disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </MuiButton>
        </DialogActions>
      </Dialog>

      {/* Modal: Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700 }}>¿Eliminar numeración?</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {opError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Vas a eliminar <strong>{deleteTarget?.nombre}</strong>{' '}
              {deleteTarget?.tipoEcf !== 'sin-ncf' && (
                <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.disabled' }}>
                  (e{deleteTarget?.tipoEcf})
                </Box>
              )}.
            </Typography>
            <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
              <Typography variant="caption">
                Los comprobantes ya emitidos no se verán afectados. Para volver a emitir este tipo deberás registrar un nuevo rango.
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton variant="outlined" onClick={() => setDeleteTarget(null)} disabled={deleting}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</MuiButton>
          <MuiButton variant="contained" color="error" disableElevation onClick={handleEliminar} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {deleting ? 'Eliminando…' : 'Eliminar'}
          </MuiButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
