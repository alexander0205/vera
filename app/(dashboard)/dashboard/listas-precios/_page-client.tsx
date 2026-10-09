'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
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
import { Tag, Plus, Pencil, Trash2, Eye } from 'lucide-react';

interface ListaPrecio {
  id: number;
  teamId: string;
  nombre: string;
  tipo: 'valor' | 'porcentaje';
  porcentaje: number;
  esDescuento: string;
  descripcion: string | null;
  esDefault: string;
  createdAt: string;
}

interface ItemLista {
  id: number;
  productoId: number;
  precio: number;
  nombre: string;
  precioBase: number;
}

function formatDOP(centavos: number) {
  return `RD$ ${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

function formatPorcentaje(lista: ListaPrecio) {
  if (lista.tipo !== 'porcentaje') return 'Precios fijos';
  const pct  = lista.porcentaje / 100;
  const sign = lista.esDescuento === 'true' ? '-' : '+';
  return `${sign}${pct.toFixed(2)}%`;
}

const EMPTY_FORM = {
  nombre: '',
  tipo: 'valor' as 'valor' | 'porcentaje',
  porcentaje: '',
  esDescuento: false,
  descripcion: '',
  esDefault: false,
};

const cardSx = { bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' };

export default function ListasPreciosPage() {
  const [listas, setListas]             = useState<ListaPrecio[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<ListaPrecio | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [formError, setFormError]       = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListaPrecio | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [deleteError, setDeleteError]   = useState<string | null>(null);
  const [itemsTarget, setItemsTarget]   = useState<ListaPrecio | null>(null);
  const [items, setItems]               = useState<ItemLista[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsError, setItemsError]     = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/listas-precios');
      const data = await res.json();
      setListas(data.listasPrecios ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setEditTarget(null); setForm(EMPTY_FORM); setFormError(null); setShowForm(true);
  }

  function abrirEdicion(lista: ListaPrecio) {
    setEditTarget(lista);
    setForm({
      nombre:      lista.nombre,
      tipo:        lista.tipo,
      porcentaje:  lista.tipo === 'porcentaje' ? (lista.porcentaje / 100).toString() : '',
      esDescuento: lista.esDescuento === 'true',
      descripcion: lista.descripcion ?? '',
      esDefault:   lista.esDefault === 'true',
    });
    setFormError(null); setShowForm(true);
  }

  async function abrirItems(lista: ListaPrecio) {
    setItemsTarget(lista); setItems([]); setItemsError(null);
    if (lista.tipo === 'porcentaje') return;
    setLoadingItems(true);
    try {
      const res  = await fetch(`/api/listas-precios/${lista.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando items');
      setItems(data.items ?? []);
    } catch (e: unknown) {
      setItemsError(e instanceof Error ? e.message : 'Error cargando items');
    } finally { setLoadingItems(false); }
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio'); return; }
    let porcentajeInt: number | undefined;
    if (form.tipo === 'porcentaje') {
      const parsed = parseFloat(form.porcentaje);
      if (isNaN(parsed) || parsed < 0) { setFormError('El porcentaje debe ser un número positivo'); return; }
      porcentajeInt = Math.round(parsed * 100);
    }
    setSaving(true); setFormError(null);
    try {
      const url    = editTarget ? `/api/listas-precios/${editTarget.id}` : '/api/listas-precios';
      const method = editTarget ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = {
        nombre: form.nombre.trim(), tipo: form.tipo,
        esDescuento: form.esDescuento, esDefault: form.esDefault,
      };
      if (form.descripcion.trim()) body.descripcion = form.descripcion.trim();
      if (form.tipo === 'porcentaje') body.porcentaje = porcentajeInt;
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false); cargar();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error guardando');
    } finally { setSaving(false); }
  }

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError(null);
    try {
      const res  = await fetch(`/api/listas-precios/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null); cargar();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : 'Error eliminando');
    } finally { setDeleting(false); }
  }

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tag size={22} color="#3658e1" />
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>Listas de precios</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            Configura precios especiales o descuentos para diferentes clientes o grupos
          </Typography>
        </Box>
        <Button variant="contained" disableElevation startIcon={<Plus size={18} />} onClick={abrirNuevo}
          sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
          Nueva lista
        </Button>
      </Box>

      <Box sx={cardSx}>
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tag size={16} color="#6b7280" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#374151' }}>
            {loading ? 'Cargando…' : `${listas.length} lista${listas.length !== 1 ? 's' : ''}`}
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={36} sx={{ color: '#3658e1' }} />
          </Box>
        ) : listas.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Tag size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
            <Typography sx={{ color: '#6b7280', fontWeight: 500 }}>Sin listas de precios registradas</Typography>
            <Typography variant="body2" sx={{ color: '#9ca3af', mt: 0.5 }}>Crea listas para aplicar descuentos o recargos a grupos de clientes</Typography>
            <Button variant="contained" disableElevation size="small" startIcon={<Plus size={16} />} onClick={abrirNuevo}
              sx={{ mt: 2, borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
              Nueva lista
            </Button>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb', borderBottom: '1px solid #f3f4f6' } }}>
                <TableCell>Nombre</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Ajuste</TableCell>
                <TableCell>Por defecto</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {listas.map(lista => {
                const ajusteColor = lista.tipo === 'porcentaje'
                  ? (lista.esDescuento === 'true' ? '#dc2626' : '#16a34a')
                  : '#6b7280';
                return (
                  <TableRow key={lista.id} sx={{ '&:hover': { bgcolor: '#f9fafb' }, '& td': { borderBottom: '1px solid #f3f4f6' } }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>{lista.nombre}</Typography>
                      {lista.descripcion && (
                        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                          {lista.descripcion}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {lista.tipo === 'valor'
                        ? <Chip label="Fijo" size="small" sx={{ bgcolor: '#eef2fe', color: '#2a45c4', border: '1px solid #c7d2fc', fontSize: '0.6875rem' }} />
                        : <Chip label="% Porcentaje" size="small" sx={{ bgcolor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.6875rem' }} />
                      }
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: ajusteColor }}>{formatPorcentaje(lista)}</Typography>
                    </TableCell>
                    <TableCell>
                      {lista.esDefault === 'true' && (
                        <Chip label="Por defecto" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', fontSize: '0.6875rem' }} />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <IconButton size="small" title="Ver items" onClick={() => abrirItems(lista)} sx={{ color: '#6b7280', '&:hover': { color: '#374151', bgcolor: '#f3f4f6' } }}>
                          <Eye size={16} />
                        </IconButton>
                        <IconButton size="small" title="Editar" onClick={() => abrirEdicion(lista)} sx={{ color: '#6b7280', '&:hover': { color: '#374151', bgcolor: '#f3f4f6' } }}>
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton size="small" title="Eliminar" onClick={() => { setDeleteTarget(lista); setDeleteError(null); }} sx={{ color: '#ef4444', '&:hover': { bgcolor: '#fef2f2' } }}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Box>

      {/* Modal: Crear / Editar */}
      <Dialog open={showForm} onClose={() => { if (!saving) setShowForm(false); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 480 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          {editTarget ? 'Editar lista de precios' : 'Nueva lista de precios'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 1 }}>
          {formError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{formError}</Alert>}
          <TextField label="Nombre *" size="small" fullWidth placeholder="Ej. Clientes VIP, Mayoristas…"
            value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' }, mt: 1 }} />

          <FormControl size="small" fullWidth>
            <InputLabel>Tipo de lista</InputLabel>
            <Select value={form.tipo} label="Tipo de lista"
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'valor' | 'porcentaje', porcentaje: '', esDescuento: false }))}
              sx={{ borderRadius: '8px' }}>
              <MenuItem value="valor">Precio fijo por producto</MenuItem>
              <MenuItem value="porcentaje">Porcentaje sobre precio base</MenuItem>
            </Select>
          </FormControl>

          {form.tipo === 'porcentaje' && (
            <>
              <TextField label="Porcentaje *" size="small" fullWidth type="number"
                slotProps={{ htmlInput: { min: 0, step: 0.01 }, input: { endAdornment: <Typography sx={{ color: '#9ca3af', mr: 1 }}>%</Typography> } }}
                placeholder="Ej: 10 para 10%"
                value={form.porcentaje} onChange={e => setForm(f => ({ ...f, porcentaje: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />

              <Box>
                <Typography variant="caption" sx={{ color: '#374151', fontWeight: 500, mb: 1, display: 'block' }}>Tipo de ajuste</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Box component="button" type="button" onClick={() => setForm(f => ({ ...f, esDescuento: true }))}
                    sx={{
                      flex: 1, py: 1, px: 1.5, borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, transition: 'all 0.15s',
                      ...(form.esDescuento
                        ? { bgcolor: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }
                        : { bgcolor: '#fff', borderColor: '#e5e7eb', color: '#4b5563', '&:hover': { bgcolor: '#f9fafb', borderColor: '#d1d5db' } }),
                    }}>
                    Descuento (reduce el precio)
                  </Box>
                  <Box component="button" type="button" onClick={() => setForm(f => ({ ...f, esDescuento: false }))}
                    sx={{
                      flex: 1, py: 1, px: 1.5, borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, transition: 'all 0.15s',
                      ...(!form.esDescuento
                        ? { bgcolor: '#f0fdf4', borderColor: '#86efac', color: '#166534' }
                        : { bgcolor: '#fff', borderColor: '#e5e7eb', color: '#4b5563', '&:hover': { bgcolor: '#f9fafb', borderColor: '#d1d5db' } }),
                    }}>
                    Recargo (aumenta el precio)
                  </Box>
                </Box>
              </Box>
            </>
          )}

          <TextField label="Descripción (opcional)" size="small" fullWidth multiline rows={3}
            placeholder="Notas internas sobre esta lista…"
            value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />

          <FormControlLabel
            control={<Checkbox checked={form.esDefault} onChange={(_, v) => setForm(f => ({ ...f, esDefault: v }))} size="small"
              sx={{ color: '#3658e1', '&.Mui-checked': { color: '#3658e1' } }} />}
            label={<Typography variant="body2" sx={{ color: '#374151' }}>Establecer como lista por defecto</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setShowForm(false)} disabled={saving}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}>Cancelar</Button>
          <Button variant="contained" disableElevation onClick={handleGuardar} disabled={saving}
            startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#3658e1', '&:hover': { bgcolor: '#2a45c4' } }}>
            {saving ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear lista'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Ver items */}
      <Dialog open={!!itemsTarget} onClose={() => setItemsTarget(null)}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 560 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          {itemsTarget?.nombre} — Items de precio
        </DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          {itemsTarget?.tipo === 'porcentaje' ? (
            <Alert severity="info" sx={{ borderRadius: '8px' }}>
              Esta lista aplica un <strong>{itemsTarget.porcentaje / 100}% de {itemsTarget.esDescuento === 'true' ? 'descuento' : 'recargo'}</strong> sobre el precio base de cada producto.
            </Alert>
          ) : loadingItems ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
              <CircularProgress size={32} sx={{ color: '#3658e1' }} />
            </Box>
          ) : itemsError ? (
            <Alert severity="error" sx={{ borderRadius: '8px' }}>{itemsError}</Alert>
          ) : items.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5 }}>
              <Tag size={40} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
              <Typography variant="body2" sx={{ color: '#6b7280' }}>Esta lista aún no tiene precios individuales configurados.</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600, color: '#6b7280', fontSize: '0.75rem', bgcolor: '#f9fafb' } }}>
                  <TableCell>Producto</TableCell>
                  <TableCell align="right">Precio base</TableCell>
                  <TableCell align="right">Precio lista</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id} sx={{ '& td': { borderBottom: '1px solid #f3f4f6' } }}>
                    <TableCell><Typography variant="body2" sx={{ fontWeight: 600 }}>{item.nombre}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" sx={{ color: '#6b7280' }}>{formatDOP(item.precioBase)}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" sx={{ fontWeight: 700, color: '#2a45c4' }}>{formatDOP(item.precio)}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button variant="outlined" onClick={() => setItemsTarget(null)}
            sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151' }}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onClose={() => { if (!deleting) setDeleteTarget(null); }}
        slotProps={{ paper: { sx: { borderRadius: '16px', minWidth: 360 } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>¿Eliminar lista?</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          {deleteError && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>{deleteError}</Alert>}
          <Typography variant="body2" sx={{ color: '#374151' }}>
            Vas a eliminar la lista <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
          </Typography>
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
