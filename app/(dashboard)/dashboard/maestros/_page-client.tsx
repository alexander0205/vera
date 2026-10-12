'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import {
  ListTree, Plus, Pencil, Trash2, AlertTriangle, X,
} from 'lucide-react';

type AplicaA = 'bien' | 'servicio' | 'ambos' | 'manual';
type Entidad = 'producto' | 'factura';

interface MaestroValor {
  id: number;
  maestroId: number;
  valor: string;
  orden: number;
}

interface Maestro {
  id: number;
  nombre: string;
  descripcion: string | null;
  aplicaA: AplicaA;
  multiple: boolean;
  targets: Entidad[];
  valores: MaestroValor[];
  createdAt: string;
}

const APLICA_LABEL: Record<AplicaA, string> = {
  bien:     'Todos los bienes',
  servicio: 'Todos los servicios',
  ambos:    'Bienes y servicios',
  manual:   'Manual (por producto)',
};

const TARGET_LABEL: Record<Entidad, string> = {
  producto: 'Productos',
  factura:  'Facturas',
};

const EMPTY_FORM = {
  nombre: '', descripcion: '', aplicaA: 'manual' as AplicaA, multiple: false,
  targets: ['producto'] as Entidad[],
};

const cardSx = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' };
const labelSx = { fontWeight: 500, color: '#374151' } as const;
const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } } as const;
const chipOutlineSx = { height: 22, fontSize: '0.6875rem', borderColor: '#e5e7eb', color: '#6b7280', '& .MuiChip-label': { px: 1 } } as const;
const chipSecondarySx = { height: 22, fontSize: '0.6875rem', fontWeight: 600, bgcolor: '#f1f5f9', color: '#475569', '& .MuiChip-label': { px: 1 } } as const;

export default function MaestrosPage() {
  const [maestros, setMaestros]         = useState<Maestro[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Maestro | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Maestro | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

  // Gestión de valores dentro del modal de edición
  const [nuevoValor, setNuevoValor]     = useState('');
  const [valorBusy, setValorBusy]       = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/maestros');
      const data = await res.json();
      setMaestros(data.maestros ?? []);
      return data.maestros as Maestro[] ?? [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setNuevoValor('');
    setOpError(null);
    setShowForm(true);
  }

  function abrirEdicion(m: Maestro) {
    setEditTarget(m);
    setForm({
      nombre: m.nombre, descripcion: m.descripcion ?? '', aplicaA: m.aplicaA, multiple: m.multiple,
      targets: m.targets?.length ? m.targets : ['producto'],
    });
    setNuevoValor('');
    setOpError(null);
    setShowForm(true);
  }

  function toggleTarget(t: Entidad) {
    setForm((f) => {
      const has = f.targets.includes(t);
      const next = has ? f.targets.filter(x => x !== t) : [...f.targets, t];
      return { ...f, targets: next };
    });
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setOpError('El nombre es obligatorio'); return; }
    if (form.targets.length === 0) { setOpError('Selecciona al menos dónde aplica (Productos o Facturas)'); return; }
    setSaving(true);
    setOpError(null);
    try {
      const url    = editTarget ? `/api/maestros/${editTarget.id}` : '/api/maestros';
      const method = editTarget ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      const lista = await cargar();
      if (editTarget) {
        // Mantener modal abierto para seguir gestionando valores
        const actualizado = lista.find(x => x.id === editTarget.id) ?? null;
        setEditTarget(actualizado);
      } else {
        setShowForm(false);
      }
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true);
    setOpError(null);
    try {
      const res  = await fetch(`/api/maestros/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
  }

  async function agregarValor() {
    if (!editTarget || !nuevoValor.trim()) return;
    setValorBusy(true);
    setOpError(null);
    try {
      const res = await fetch(`/api/maestros/${editTarget.id}/valores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: nuevoValor.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error agregando valor');
      setNuevoValor('');
      const lista = await cargar();
      setEditTarget(lista.find(x => x.id === editTarget.id) ?? null);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error agregando valor');
    } finally {
      setValorBusy(false);
    }
  }

  async function eliminarValor(v: MaestroValor) {
    if (!editTarget) return;
    setValorBusy(true);
    setOpError(null);
    try {
      const res = await fetch(`/api/maestros/${editTarget.id}/valores/${v.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando valor');
      const lista = await cargar();
      setEditTarget(lista.find(x => x.id === editTarget.id) ?? null);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando valor');
    } finally {
      setValorBusy(false);
    }
  }

  return (
    <Box component="section" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Maestros</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            Listas de atributos (marca, color…) que se aplican a tus productos y servicios
          </Typography>
        </Box>
        <Button variant="contained" disableElevation startIcon={<Plus size={16} />} onClick={abrirNuevo}
          sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
          Nuevo maestro
        </Button>
      </Box>

      {/* Tabla */}
      <Box sx={cardSx}>
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ListTree size={16} color="#6b7280" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>
            {loading ? 'Cargando…' : `${maestros.length} maestro${maestros.length !== 1 ? 's' : ''}`}
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: '#3658e1' }} />
          </Box>
        ) : maestros.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <ListTree size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
            <Typography sx={{ color: '#6b7280', fontWeight: 500 }}>Sin maestros registrados</Typography>
            <Typography variant="body2" sx={{ color: '#9ca3af', mt: 0.5 }}>
              Crea un maestro (ej. Marca, Color) y agrégale valores
            </Typography>
            <Button variant="contained" disableElevation size="small" startIcon={<Plus size={16} />} onClick={abrirNuevo}
              sx={{ mt: 2, borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
              Nuevo maestro
            </Button>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb', borderBottom: '1px solid #f3f4f6' } }}>
                <TableCell>Nombre</TableCell>
                <TableCell>Aplica a</TableCell>
                <TableCell>Selección</TableCell>
                <TableCell>Valores</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {maestros.map((m) => (
                <TableRow key={m.id} hover onClick={() => abrirEdicion(m)}
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#f9fafb' }, '& td': { borderBottom: '1px solid #f3f4f6' } }}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>{m.nombre}</Typography></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
                      {(m.targets ?? []).map((t) => (
                        <Chip key={t} label={TARGET_LABEL[t]} variant="outlined" size="small" sx={chipOutlineSx} />
                      ))}
                      {m.targets?.includes('producto') && (
                        <Typography component="span" sx={{ fontSize: '11px', color: '#9ca3af' }}>· {APLICA_LABEL[m.aplicaA]}</Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={m.multiple ? 'Múltiple' : 'Único'} size="small"
                      variant={m.multiple ? 'filled' : 'outlined'} sx={m.multiple ? chipSecondarySx : chipOutlineSx} />
                  </TableCell>
                  <TableCell><Typography variant="body2" sx={{ color: '#6b7280' }}>{m.valores.length}</Typography></TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => abrirEdicion(m)} sx={{ color: '#6b7280', '&:hover': { color: '#374151', bgcolor: '#f3f4f6' } }}>
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton size="small" onClick={() => { setDeleteTarget(m); setOpError(null); }} sx={{ color: '#ef4444', '&:hover': { bgcolor: '#fef2f2' } }}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* Modal: Crear / Editar */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 512 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>{editTarget ? 'Editar maestro' : 'Nuevo maestro'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
          {opError && (
            <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
            <Typography variant="body2" sx={labelSx}>Nombre *</Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Ej: Marca"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              sx={fieldSx}
            />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Typography variant="body2" sx={labelSx}>Descripción</Typography>
            <TextField
              size="small"
              fullWidth
              multiline
              placeholder="Descripción opcional…"
              rows={2}
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              sx={fieldSx}
            />
          </Box>
          {/* Dónde aplica el maestro */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Typography variant="body2" sx={labelSx}>Aplica a</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {(['producto', 'factura'] as Entidad[]).map((t) => (
                <Box key={t} component="label"
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 40, px: 1.5, border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', flex: 1 }}>
                  <Checkbox
                    size="small"
                    checked={form.targets.includes(t)}
                    onChange={() => toggleTarget(t)}
                    sx={{ p: 0, color: '#d1d5db', '&.Mui-checked': { color: '#3658e1' } }}
                  />
                  <Typography variant="body2" sx={{ color: '#374151' }}>{TARGET_LABEL[t]}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            {/* aplicaA solo aplica del lado producto */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: form.targets.includes('producto') ? '#374151' : '#d1d5db' }}>
                En productos, mostrar en
              </Typography>
              <FormControl size="small" fullWidth disabled={!form.targets.includes('producto')}>
                <Select
                  value={form.aplicaA}
                  onChange={(e) => setForm((f) => ({ ...f, aplicaA: e.target.value as AplicaA }))}
                  sx={{ borderRadius: '8px', fontSize: '0.875rem' }}
                >
                  <MenuItem value="manual">Manual (por producto)</MenuItem>
                  <MenuItem value="bien">Todos los bienes</MenuItem>
                  <MenuItem value="servicio">Todos los servicios</MenuItem>
                  <MenuItem value="ambos">Bienes y servicios</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography variant="body2" sx={labelSx}>Selección</Typography>
              <Box component="label"
                sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 40, px: 1.5, border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>
                <Checkbox
                  size="small"
                  checked={form.multiple}
                  onChange={(e) => setForm((f) => ({ ...f, multiple: e.target.checked }))}
                  sx={{ p: 0, color: '#d1d5db', '&.Mui-checked': { color: '#3658e1' } }}
                />
                <Typography variant="body2" sx={{ color: '#374151' }}>Permite varios valores</Typography>
              </Box>
            </Box>
          </Box>

          {/* Gestión de valores — solo en edición (el maestro ya existe) */}
          {editTarget ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 2, borderTop: '1px solid #e5e7eb' }}>
              <Typography variant="body2" sx={labelSx}>Valores del dropdown</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Ej: Toyota"
                  value={nuevoValor}
                  onChange={(e) => setNuevoValor(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarValor(); } }}
                  sx={fieldSx}
                />
                <Button type="button" variant="outlined" onClick={agregarValor} disabled={valorBusy || !nuevoValor.trim()}
                  sx={{ borderRadius: '8px', textTransform: 'none', minWidth: 44, px: 1.5, borderColor: '#d1d5db', color: '#374151' }}>
                  {valorBusy ? <CircularProgress size={16} /> : <Plus size={16} />}
                </Button>
              </Box>
              {editTarget.valores.length === 0 ? (
                <Typography variant="caption" sx={{ color: '#9ca3af' }}>Aún no hay valores. Agrega al menos uno.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {editTarget.valores.map((v) => (
                    <Box key={v.id}
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#f3f4f6', color: '#374151', fontSize: '0.875rem', borderRadius: '9999px', pl: 1.5, pr: 0.5, py: 0.5 }}>
                      {v.valor}
                      <IconButton
                        type="button"
                        size="small"
                        onClick={() => eliminarValor(v)}
                        disabled={valorBusy}
                        sx={{ p: 0.25, color: 'inherit', '&:hover': { bgcolor: '#d1d5db' } }}
                      >
                        <X size={12} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ) : (
            <Typography variant="caption" sx={{ color: '#9ca3af', pt: 0.5 }}>
              Podrás agregar los valores del dropdown después de crear el maestro.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setShowForm(false)} disabled={saving}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}>
            {editTarget ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button variant="contained" disableElevation onClick={handleGuardar} disabled={saving}
            startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
            {saving
              ? 'Guardando…'
              : (editTarget ? 'Guardar cambios' : 'Crear maestro')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px', maxWidth: 384 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>¿Eliminar maestro?</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 1 }}>
          {opError && (
            <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>
          )}
          <Typography variant="body2" sx={{ color: '#374151' }}>
            Vas a eliminar el maestro <strong>{deleteTarget?.nombre}</strong>, sus valores y las
            asignaciones a productos. Esta acción no se puede deshacer.
          </Typography>
          <Alert severity="warning" icon={<AlertTriangle size={16} />} sx={{ borderRadius: '8px', fontSize: '0.75rem' }}>
            Los productos no se eliminan, solo pierden este atributo.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setDeleteTarget(null)} disabled={deleting}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}>Cancelar</Button>
          <Button variant="contained" disableElevation color="error" onClick={handleEliminar} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
