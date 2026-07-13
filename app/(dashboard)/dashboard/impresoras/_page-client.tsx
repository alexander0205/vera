'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Printer, FileText, Ticket, CheckCircle, Plus, Trash2,
  Loader2, Star, AlertTriangle, Info,
} from 'lucide-react';
import { toast } from 'sonner';
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
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Impresora {
  id:        number;
  nombre:    string;
  tipo:      string;
  esDefault: boolean;
  ip:        string | null;
  backend:   string;
  createdAt: string;
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  a4:           'A4 / Carta',
  termica_80mm: 'Térmica 80mm',
  termica_58mm: 'Térmica 58mm',
};

const TIPO_ICONS: Record<string, React.ElementType> = {
  a4:           FileText,
  termica_80mm: Ticket,
  termica_58mm: Ticket,
};

const BACKEND_LABELS: Record<string, string> = {
  browser: 'Navegador (PDF)',
  cups:    'CUPS',
  escpos:  'ESC/POS',
};

// ─── Formulario de nueva impresora ────────────────────────────────────────────

interface FormState {
  nombre:    string;
  tipo:      string;
  esDefault: boolean;
  ip:        string;
  backend:   string;
}

const FORM_EMPTY: FormState = {
  nombre:    '',
  tipo:      'a4',
  esDefault: false,
  ip:        '',
  backend:   'browser',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ImpresorasPage() {
  const [impresoras, setImpresoras]       = useState<Impresora[]>([]);
  const [loading, setLoading]             = useState(true);

  const [showModal, setShowModal]         = useState(false);
  const [form, setForm]                   = useState<FormState>(FORM_EMPTY);
  const [saving, setSaving]               = useState(false);

  const [deleteTarget, setDeleteTarget]   = useState<Impresora | null>(null);
  const [deleting, setDeleting]           = useState(false);

  // ─── Carga ──────────────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/impresoras');
      const data = await res.json();
      setImpresoras(data.impresoras ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Crear ──────────────────────────────────────────────────────────────────

  async function handleCrear() {
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/impresoras', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando');
      toast.success('Impresora agregada');
      setShowModal(false);
      setForm(FORM_EMPTY);
      cargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error creando impresora');
    } finally {
      setSaving(false);
    }
  }

  // ─── Marcar default ─────────────────────────────────────────────────────────

  async function handleMarcarDefault(imp: Impresora) {
    if (imp.esDefault) return;
    try {
      const res = await fetch(`/api/impresoras/${imp.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ esDefault: true }),
      });
      if (!res.ok) throw new Error('Error actualizando');
      toast.success(`"${imp.nombre}" es ahora la impresora predeterminada`);
      cargar();
    } catch {
      toast.error('No se pudo actualizar la impresora');
    }
  }

  // ─── Eliminar ────────────────────────────────────────────────────────────────

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/impresoras/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error eliminando');
      toast.success('Impresora eliminada');
      setDeleteTarget(null);
      cargar();
    } catch {
      toast.error('No se pudo eliminar la impresora');
    } finally {
      setDeleting(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const defaultImp = impresoras.find(i => i.esDefault);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Printer style={{ width: 22, height: 22, color: '#0d9488' }} />
            Impresoras
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Configura las impresoras de tu empresa. La predeterminada se usará al hacer clic en &quot;Imprimir&quot; desde una factura.
          </Typography>
        </Box>
        <MuiButton
          variant="contained"
          color="primary"
          disableElevation
          startIcon={<Plus style={{ width: 16, height: 16 }} />}
          onClick={() => { setForm(FORM_EMPTY); setShowModal(true); }}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}
        >
          Agregar impresora
        </MuiButton>
      </Box>

      {/* Impresora predeterminada activa */}
      {defaultImp && (
        <Card elevation={0} sx={{ border: '1px solid #99f6e4', bgcolor: '#f0fdfa', borderRadius: '12px', mb: 2 }}>
          <CardContent sx={{ p: '16px 20px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: '#ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {(() => {
                  const Icon = TIPO_ICONS[defaultImp.tipo] ?? Printer;
                  return <Icon style={{ width: 20, height: 20, color: '#0d9488' }} />;
                })()}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#134e4a' }}>
                    {defaultImp.nombre}
                  </Typography>
                  <Chip label="Predeterminada" size="small" sx={{ bgcolor: '#0d9488', color: '#fff', height: 20, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 1 } }} />
                </Box>
                <Typography variant="caption" sx={{ color: '#0f766e' }}>
                  {TIPO_LABELS[defaultImp.tipo] ?? defaultImp.tipo}
                  {defaultImp.ip && ` · ${defaultImp.ip}`}
                  {' · '}{BACKEND_LABELS[defaultImp.backend] ?? defaultImp.backend}
                </Typography>
              </Box>
              <CheckCircle style={{ width: 20, height: 20, color: '#0d9488', flexShrink: 0 }} />
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Lista de impresoras */}
      <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', mb: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
            Impresoras configuradas
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Haz clic en &quot;Predeterminar&quot; para que esa impresora se use automáticamente al imprimir facturas
          </Typography>
        </Box>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={24} color="primary" />
          </Box>
        ) : impresoras.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Printer style={{ width: 40, height: 40, color: '#e5e7eb', margin: '0 auto 8px' }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>No hay impresoras configuradas</Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>Agrega una para comenzar</Typography>
          </Box>
        ) : (
          impresoras.map((imp, i) => {
            const Icon = TIPO_ICONS[imp.tipo] ?? Printer;
            return (
              <Box key={imp.id}>
                {i > 0 && <Divider />}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 1.5, '&:hover': { bgcolor: 'grey.50' } }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '8px', bgcolor: imp.esDefault ? '#ccfbf1' : 'grey.100', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon style={{ width: 18, height: 18, color: imp.esDefault ? '#0d9488' : '#6b7280' }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>{imp.nombre}</Typography>
                      {imp.esDefault && (
                        <Chip label="Predeterminada" size="small" sx={{ bgcolor: '#0d9488', color: '#fff', height: 20, fontSize: '0.6875rem', fontWeight: 600, '& .MuiChip-label': { px: 1 } }} />
                      )}
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {TIPO_LABELS[imp.tipo] ?? imp.tipo}
                      {imp.ip && ` · IP: ${imp.ip}`}
                      {' · '}{BACKEND_LABELS[imp.backend] ?? imp.backend}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    {!imp.esDefault && (
                      <MuiButton
                        variant="outlined"
                        size="small"
                        startIcon={<Star style={{ width: 12, height: 12 }} />}
                        onClick={() => handleMarcarDefault(imp)}
                        sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', borderColor: 'divider', color: 'text.secondary', py: '3px' }}
                      >
                        Predeterminar
                      </MuiButton>
                    )}
                    <MuiButton
                      variant="text"
                      size="small"
                      onClick={() => setDeleteTarget(imp)}
                      sx={{ minWidth: 32, width: 32, height: 32, p: 0, color: 'error.light', '&:hover': { color: 'error.main', bgcolor: 'error.lighter' } }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </MuiButton>
                  </Box>
                </Box>
              </Box>
            );
          })
        )}
      </Card>

      {/* Cómo funciona */}
      <Card elevation={0} sx={{ border: '1px solid #bfdbfe', bgcolor: '#eff6ff', borderRadius: '12px' }}>
        <CardContent sx={{ p: '16px 20px !important' }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Info style={{ width: 18, height: 18, color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e40af', mb: 0.75 }}>
                ¿Cómo funciona la impresión?
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2, '& li': { mb: 0.5 } }}>
                {[
                  <><strong>Impresora A4:</strong> Abre el PDF tamaño carta/A4 en nueva pestaña</>,
                  <><strong>Térmica 80mm / 58mm:</strong> Abre el PDF tirilla optimizado para papel térmico</>,
                  <>En ambos casos, el diálogo de impresión del navegador permite seleccionar la impresora física</>,
                  <>Para impresoras térmicas, selecciona &quot;Sin márgenes&quot; y desactiva los encabezados</>,
                ].map((item, i) => (
                  <Typography key={i} component="li" variant="caption" sx={{ color: '#1d4ed8', display: 'list-item' }}>
                    {item}
                  </Typography>
                ))}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ── Modal: Agregar impresora ── */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} maxWidth="sm" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Agregar impresora</DialogTitle>
        <DialogContent sx={{ pb: 1, display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>

          <MuiTextField
            label="Nombre de la impresora *"
            value={form.nombre}
            onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Bematech 80mm recepción"
            size="small"
            fullWidth
            slotProps={{ htmlInput: { maxLength: 100 } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary', display: 'block', mb: 1 }}>
              Tipo de impresora
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              {(['a4', 'termica_80mm', 'termica_58mm'] as const).map(tipo => {
                const TIcon = TIPO_ICONS[tipo] ?? Printer;
                const selected = form.tipo === tipo;
                return (
                  <Box
                    key={tipo}
                    onClick={() => setForm(f => ({ ...f, tipo }))}
                    sx={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                      p: 1.5, borderRadius: '10px', border: '2px solid', cursor: 'pointer', textAlign: 'center',
                      borderColor: selected ? 'primary.main' : '#e5e7eb',
                      bgcolor: selected ? '#f0fdfa' : 'transparent',
                      transition: 'all 0.15s',
                      '&:hover': { borderColor: selected ? 'primary.main' : '#d1d5db' },
                    }}
                  >
                    <TIcon style={{ width: 20, height: 20, color: selected ? '#0d9488' : '#9ca3af' }} />
                    <Typography variant="caption" sx={{ fontWeight: 600, color: selected ? '#0d9488' : 'text.secondary', lineHeight: 1.3 }}>
                      {TIPO_LABELS[tipo]}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          <MuiTextField
            label="IP de red (opcional)"
            value={form.ip}
            onChange={(e) => setForm(f => ({ ...f, ip: e.target.value }))}
            placeholder="192.168.1.100"
            size="small"
            fullWidth
            helperText="Solo como referencia visual. No se conecta directamente."
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />

          <FormControl size="small" fullWidth>
            <InputLabel>Backend</InputLabel>
            <Select
              value={form.backend}
              label="Backend"
              onChange={(e) => setForm(f => ({ ...f, backend: e.target.value }))}
              sx={{ borderRadius: '8px' }}
            >
              <MenuItem value="browser">Navegador (PDF)</MenuItem>
              <MenuItem value="cups">CUPS</MenuItem>
              <MenuItem value="escpos">ESC/POS</MenuItem>
            </Select>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, px: 0.25 }}>
              CUPS y ESC/POS son informativos en esta versión.
            </Typography>
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox
                checked={form.esDefault}
                onChange={(e) => setForm(f => ({ ...f, esDefault: e.target.checked }))}
                color="primary"
                size="small"
              />
            }
            label={<Typography variant="body2" sx={{ color: 'text.primary' }}>Marcar como predeterminada</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton variant="outlined" onClick={() => setShowModal(false)} disabled={saving}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>
            Cancelar
          </MuiButton>
          <MuiButton variant="contained" color="primary" disableElevation onClick={handleCrear}
            disabled={saving || !form.nombre.trim()}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {saving ? <><CircularProgress size={14} color="inherit" sx={{ mr: 1 }} />Guardando…</> : 'Guardar impresora'}
          </MuiButton>
        </DialogActions>
      </Dialog>

      {/* ── Modal: Confirmar eliminación ── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>¿Eliminar impresora?</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.primary', mb: 1.5 }}>
            Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
          </Typography>
          {deleteTarget?.esDefault && (
            <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
              Esta es tu impresora predeterminada. Al eliminarla, ninguna quedará seleccionada
              y el botón &quot;Imprimir&quot; usará A4 como respaldo.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton variant="outlined" onClick={() => setDeleteTarget(null)} disabled={deleting}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>
            Cancelar
          </MuiButton>
          <MuiButton variant="contained" color="error" disableElevation onClick={handleEliminar} disabled={deleting}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {deleting ? <><CircularProgress size={14} color="inherit" sx={{ mr: 1 }} />Eliminando…</> : 'Sí, eliminar'}
          </MuiButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
