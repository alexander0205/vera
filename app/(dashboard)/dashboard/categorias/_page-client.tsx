'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { FolderOpen, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';

interface Categoria {
  id: number;
  nombre: string;
  descripcion: string | null;
  createdAt: string;
}

const EMPTY_FORM = { nombre: '', descripcion: '' };
const cardSx = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' };

export default function CategoriasPage() {
  const [categorias, setCategorias]     = useState<Categoria[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Categoria | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Categoria | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/categorias');
      const data = await res.json();
      setCategorias(data.categorias ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setEditTarget(null); setForm(EMPTY_FORM); setOpError(null); setShowForm(true);
  }

  function abrirEdicion(c: Categoria) {
    setEditTarget(c); setForm({ nombre: c.nombre, descripcion: c.descripcion ?? '' }); setOpError(null); setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setOpError('El nombre es obligatorio'); return; }
    setSaving(true); setOpError(null);
    try {
      const url    = editTarget ? `/api/categorias/${editTarget.id}` : '/api/categorias';
      const method = editTarget ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false); cargar();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error guardando');
    } finally { setSaving(false); }
  }

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true); setOpError(null);
    try {
      const res  = await fetch(`/api/categorias/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null); cargar();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally { setDeleting(false); }
  }

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Categorías de Productos</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>Organiza tu catálogo por categorías</Typography>
        </Box>
        <Button variant="contained" disableElevation startIcon={<Plus size={18} />} onClick={abrirNuevo}
          sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
          Nueva categoría
        </Button>
      </Box>

      <Box sx={cardSx}>
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 }}>
          <FolderOpen size={16} color="#6b7280" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>
            {loading ? 'Cargando…' : `${categorias.length} categoría${categorias.length !== 1 ? 's' : ''}`}
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={36} sx={{ color: '#3658e1' }} />
          </Box>
        ) : categorias.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <FolderOpen size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
            <Typography sx={{ color: '#6b7280', fontWeight: 500 }}>Sin categorías registradas</Typography>
            <Typography variant="body2" sx={{ color: '#9ca3af', mt: 0.5 }}>Crea categorías para organizar mejor tu catálogo de productos</Typography>
            <Button variant="contained" disableElevation size="small" startIcon={<Plus size={16} />} onClick={abrirNuevo}
              sx={{ mt: 2, borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
              Nueva categoría
            </Button>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb', borderBottom: '1px solid #f3f4f6' } }}>
                <TableCell>Nombre</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categorias.map(c => (
                <TableRow key={c.id} sx={{ '&:hover': { bgcolor: '#f9fafb' }, '& td': { borderBottom: '1px solid #f3f4f6' } }}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>{c.nombre}</Typography></TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                      {c.descripcion ?? <span style={{ color: '#d1d5db' }}>—</span>}
                    </Typography>
                  </TableCell>
                  <TableCell><Typography variant="body2" sx={{ color: '#6b7280' }}>{new Date(c.createdAt).toLocaleDateString('es-DO')}</Typography></TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => abrirEdicion(c)} sx={{ color: '#6b7280', '&:hover': { color: '#374151', bgcolor: '#f3f4f6' } }}>
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton size="small" onClick={() => { setDeleteTarget(c); setOpError(null); }} sx={{ color: '#ef4444', '&:hover': { bgcolor: '#fef2f2' } }}>
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
      <Dialog open={showForm} onClose={() => { if (!saving) setShowForm(false); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 440 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          {editTarget ? 'Editar categoría' : 'Nueva categoría'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 1 }}>
          {opError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>}
          <TextField label="Nombre *" size="small" fullWidth placeholder="Ej: Servicios Digitales"
            value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' }, mt: 1 }} />
          <TextField label="Descripción" size="small" fullWidth multiline rows={3}
            placeholder="Descripción opcional de la categoría…"
            value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setShowForm(false)} disabled={saving}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}>Cancelar</Button>
          <Button variant="contained" disableElevation onClick={handleGuardar} disabled={saving}
            startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
            {saving ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onClose={() => { if (!deleting) setDeleteTarget(null); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 360 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>¿Eliminar categoría?</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          {opError && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>{opError}</Alert>}
          <Typography variant="body2" sx={{ color: '#374151', mb: 2 }}>
            Vas a eliminar la categoría <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
          </Typography>
          <Alert severity="warning" icon={<AlertTriangle size={16} />} sx={{ borderRadius: '8px', fontSize: '0.75rem' }}>
            Los productos asignados a esta categoría no se verán afectados.
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
