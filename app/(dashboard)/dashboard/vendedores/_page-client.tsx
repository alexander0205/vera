'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
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
import { UserCheck, Plus, Pencil, Trash2, Search, AlertTriangle, X } from 'lucide-react';

interface Vendedor {
  id: number;
  teamId: number;
  nombre: string;
  identificacion: string | null;
  observacion: string | null;
  activo: string;
  createdAt: string;
}

const EMPTY_FORM = { nombre: '', identificacion: '', observacion: '' };
const cardSx = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' };

export default function VendedoresPage() {
  const [vendedores, setVendedores]     = useState<Vendedor[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Vendedor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vendedor | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);
  const searchTimer                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const res  = await fetch(`/api/vendedores?${params}`);
      const data = await res.json();
      setVendedores(data.vendedores ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function handleSearch(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => cargar(v), 300);
  }

  function abrirNuevo() {
    setEditTarget(null); setForm(EMPTY_FORM); setOpError(null); setShowForm(true);
  }

  function abrirEdicion(v: Vendedor) {
    setEditTarget(v);
    setForm({ nombre: v.nombre, identificacion: v.identificacion ?? '', observacion: v.observacion ?? '' });
    setOpError(null); setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setOpError('El nombre es obligatorio'); return; }
    setSaving(true); setOpError(null);
    try {
      const url    = editTarget ? `/api/vendedores/${editTarget.id}` : '/api/vendedores';
      const method = editTarget ? 'PATCH' : 'POST';
      const body: Record<string, string> = { nombre: form.nombre.trim() };
      if (form.identificacion.trim()) body.identificacion = form.identificacion.trim();
      if (form.observacion.trim())    body.observacion    = form.observacion.trim();
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false); cargar(search);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error guardando');
    } finally { setSaving(false); }
  }

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true); setOpError(null);
    try {
      const res  = await fetch(`/api/vendedores/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null); cargar(search);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally { setDeleting(false); }
  }

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <UserCheck size={22} color="#0d9488" />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Vendedores</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>Administra los vendedores y asígnalos a facturas</Typography>
        </Box>
        <Button variant="contained" disableElevation startIcon={<Plus size={18} />} onClick={abrirNuevo}
          sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}>
          Nuevo Vendedor
        </Button>
      </Box>

      {/* Search bar */}
      <Box sx={{ maxWidth: 360 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Buscar por nombre o identificación…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><Search size={16} color="#9ca3af" /></InputAdornment>,
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => { setSearch(''); cargar(''); }}>
                    <X size={14} color="#9ca3af" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
      </Box>

      <Box sx={cardSx}>
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 }}>
          <UserCheck size={16} color="#6b7280" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>
            {loading ? 'Cargando…' : `${vendedores.length} vendedor${vendedores.length !== 1 ? 'es' : ''}`}
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={36} sx={{ color: '#0d9488' }} />
          </Box>
        ) : vendedores.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <UserCheck size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
            <Typography sx={{ color: '#6b7280', fontWeight: 500 }}>
              {search ? 'Sin resultados para esa búsqueda' : 'No hay vendedores registrados'}
            </Typography>
            {!search && (
              <>
                <Typography variant="body2" sx={{ color: '#9ca3af', mt: 0.5 }}>Agrega vendedores para asignarlos en tus facturas</Typography>
                <Button variant="contained" disableElevation size="small" startIcon={<Plus size={16} />} onClick={abrirNuevo}
                  sx={{ mt: 2, borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}>
                  Nuevo Vendedor
                </Button>
              </>
            )}
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb', borderBottom: '1px solid #f3f4f6' } }}>
                <TableCell>Nombre</TableCell>
                <TableCell>Identificación</TableCell>
                <TableCell>Observación</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vendedores.map(v => (
                <TableRow key={v.id} sx={{ '&:hover': { bgcolor: '#f9fafb' }, '& td': { borderBottom: '1px solid #f3f4f6' } }}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>{v.nombre}</Typography></TableCell>
                  <TableCell><Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#6b7280' }}>{v.identificacion ?? '—'}</Typography></TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                      {v.observacion ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => abrirEdicion(v)} sx={{ color: '#6b7280', '&:hover': { color: '#374151', bgcolor: '#f3f4f6' } }}>
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton size="small" onClick={() => { setDeleteTarget(v); setOpError(null); }} sx={{ color: '#ef4444', '&:hover': { bgcolor: '#fef2f2' } }}>
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
          {editTarget ? 'Editar vendedor' : 'Nuevo vendedor'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 1 }}>
          {opError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>}
          <TextField label="Nombre *" size="small" fullWidth placeholder="Ej. Juan Pérez"
            value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' }, mt: 1 }} />
          <TextField label="Identificación" size="small" fullWidth placeholder="Cédula o RNC del vendedor"
            value={form.identificacion} onChange={e => setForm(f => ({ ...f, identificacion: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
          <TextField label="Observación" size="small" fullWidth multiline rows={3}
            placeholder="Notas internas opcionales sobre este vendedor"
            value={form.observacion} onChange={e => setForm(f => ({ ...f, observacion: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setShowForm(false)} disabled={saving}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}>Cancelar</Button>
          <Button variant="contained" disableElevation onClick={handleGuardar} disabled={saving}
            startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}>
            {saving ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear vendedor'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onClose={() => { if (!deleting) setDeleteTarget(null); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 360 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>¿Eliminar vendedor?</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          {opError && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>{opError}</Alert>}
          <Typography variant="body2" sx={{ color: '#374151', mb: 2 }}>
            Vas a eliminar al vendedor <strong>{deleteTarget?.nombre}</strong>. Esta acción es reversible desde la base de datos.
          </Typography>
          <Alert severity="warning" icon={<AlertTriangle size={16} />} sx={{ borderRadius: '8px', fontSize: '0.75rem' }}>
            Este vendedor dejará de estar disponible en el selector de facturas.
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
