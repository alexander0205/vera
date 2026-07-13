'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { Warehouse, Plus, Pencil, Trash2 } from 'lucide-react';

interface Almacen {
  id: number;
  teamId: number;
  nombre: string;
  direccion: string | null;
  observacion: string | null;
  esDefault: string;
  createdAt: string;
}

const EMPTY_FORM = { nombre: '', direccion: '', observacion: '', esDefault: false };

const cardSx = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' };

export default function AlmacenesPage() {
  const [almacenes, setAlmacenes]       = useState<Almacen[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Almacen | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Almacen | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/almacenes');
      const data = await res.json();
      setAlmacenes(data.almacenes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpError(null);
    setShowForm(true);
  }

  function abrirEdicion(a: Almacen) {
    setEditTarget(a);
    setForm({ nombre: a.nombre, direccion: a.direccion ?? '', observacion: a.observacion ?? '', esDefault: a.esDefault === 'true' });
    setOpError(null);
    setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setOpError('El nombre es obligatorio'); return; }
    setSaving(true);
    setOpError(null);
    try {
      const url    = editTarget ? `/api/almacenes/${editTarget.id}` : '/api/almacenes';
      const method = editTarget ? 'PATCH' : 'POST';
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:      form.nombre.trim(),
          direccion:   form.direccion.trim() || null,
          observacion: form.observacion.trim() || null,
          esDefault:   form.esDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false);
      cargar();
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
      const res  = await fetch(`/api/almacenes/${deleteTarget.id}`, { method: 'DELETE' });
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

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warehouse size={22} color="#0d9488" />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Almacenes</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            Gestiona los almacenes donde guardas tu inventario
          </Typography>
        </Box>
        <Button
          variant="contained"
          disableElevation
          startIcon={<Plus size={18} />}
          onClick={abrirNuevo}
          sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
        >
          Nuevo Almacén
        </Button>
      </Box>

      {/* Table card */}
      <Box sx={cardSx}>
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warehouse size={16} color="#6b7280" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>
            {loading ? 'Cargando…' : `${almacenes.length} almacén${almacenes.length !== 1 ? 'es' : ''}`}
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={36} sx={{ color: '#0d9488' }} />
          </Box>
        ) : almacenes.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Warehouse size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
            <Typography sx={{ color: '#6b7280', fontWeight: 500 }}>Sin almacenes registrados</Typography>
            <Typography variant="body2" sx={{ color: '#9ca3af', mt: 0.5 }}>Crea tu primer almacén para organizar tu inventario</Typography>
            <Button
              variant="contained"
              disableElevation
              size="small"
              startIcon={<Plus size={16} />}
              onClick={abrirNuevo}
              sx={{ mt: 2, borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
            >
              Nuevo Almacén
            </Button>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb', borderBottom: '1px solid #f3f4f6' } }}>
                <TableCell>Nombre</TableCell>
                <TableCell>Dirección</TableCell>
                <TableCell>Por defecto</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {almacenes.map(a => (
                <TableRow key={a.id} sx={{ '&:hover': { bgcolor: '#f9fafb' }, '& td': { borderBottom: '1px solid #f3f4f6' } }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>{a.nombre}</Typography>
                    {a.observacion && (
                      <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                        {a.observacion}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: '#4b5563' }}>
                      {a.direccion ?? <span style={{ color: '#d1d5db' }}>—</span>}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {a.esDefault === 'true'
                      ? <Chip label="Por defecto" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', fontSize: '0.6875rem' }} />
                      : <Typography sx={{ color: '#d1d5db' }}>—</Typography>
                    }
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => abrirEdicion(a)} sx={{ color: '#6b7280', '&:hover': { color: '#374151', bgcolor: '#f3f4f6' } }}>
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton size="small" onClick={() => { setDeleteTarget(a); setOpError(null); }} sx={{ color: '#ef4444', '&:hover': { bgcolor: '#fef2f2' } }}>
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
      <Dialog
        open={showForm}
        onClose={() => { if (!saving) setShowForm(false); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 480 } } as object }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          {editTarget ? 'Editar almacén' : 'Nuevo almacén'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 1 }}>
          {opError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>}
          <TextField
            label="Nombre *"
            size="small"
            fullWidth
            placeholder="Ej: Almacén Principal"
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' }, mt: 1 }}
          />
          <TextField
            label="Dirección"
            size="small"
            fullWidth
            placeholder="Ej: Calle Principal #1, Santiago"
            value={form.direccion}
            onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
          <TextField
            label="Observación"
            size="small"
            fullWidth
            multiline
            rows={3}
            placeholder="Notas internas sobre este almacén…"
            value={form.observacion}
            onChange={e => setForm(f => ({ ...f, observacion: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={form.esDefault}
                onChange={(_, v) => setForm(f => ({ ...f, esDefault: v }))}
                size="small"
                sx={{ color: '#0d9488', '&.Mui-checked': { color: '#0d9488' } }}
              />
            }
            label={<Typography variant="body2" sx={{ color: '#374151' }}>Establecer como almacén por defecto</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setShowForm(false)}
            disabled={saving}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={handleGuardar}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
          >
            {saving ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear almacén'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Confirmar eliminación */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 360 } } as object }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>¿Eliminar almacén?</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          {opError && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>{opError}</Alert>}
          <Typography variant="body2" sx={{ color: '#374151' }}>
            Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            disableElevation
            color="error"
            onClick={handleEliminar}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none' }}
          >
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
