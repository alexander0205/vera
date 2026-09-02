'use client';

/**
 * Artículos de compra — página de gestión del catálogo de COMPRAS
 * (`catalogo_compras`). Es lo que el negocio COMPRA, el simétrico de
 * "Productos y servicios" (venta). Nombre distinto a propósito de "Compras"
 * (las transacciones: recibidas / comprobantes / registradas).
 */
import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { PackageSearch, Plus, Pencil, Trash2, Search } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import CircularProgress from '@mui/material/CircularProgress';
import { toast } from 'sonner';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { fmtDOP } from '@/lib/utils/format';

interface Articulo {
  id:              number;
  nombre:          string;
  descripcion:     string | null;
  referencia:      string | null;
  costoDOP:        number;
  tasaItbis:       string;
  proveedorNombre: string | null;
  proveedorRnc:    string | null;
}

const TASAS = [
  { value: '0.18', label: 'ITBIS 18%' },
  { value: '0.16', label: 'ITBIS 16%' },
  { value: '0',    label: 'ITBIS 0%' },
  { value: 'exento', label: 'Exento' },
];

const TASA_LABEL: Record<string, string> = Object.fromEntries(TASAS.map(t => [t.value, t.label]));

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function CatalogoComprasPage() {
  const { can, isLoading: permLoading } = usePermissions();
  const canGestionar = can('facturas:crear');

  const { data, isLoading, mutate } = useSWR<{ articulos?: Articulo[] }>(
    !permLoading && can('facturas:ver') ? '/api/compras/catalogo?gestion=1' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Articulo | null>(null);
  const [abierto, setAbierto]   = useState(false);

  const articulos = data?.articulos ?? [];
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return articulos;
    return articulos.filter(a =>
      a.nombre.toLowerCase().includes(q) || (a.referencia ?? '').toLowerCase().includes(q));
  }, [articulos, busqueda]);

  if (!permLoading && !can('facturas:ver')) {
    return (
      <Box sx={{ p: 3 }}>
        <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', bgcolor: '#fff', p: 5, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>No tienes permiso para ver esta sección.</Typography>
        </Box>
      </Box>
    );
  }

  function abrirNuevo() { setEditando(null); setAbierto(true); }
  function abrirEditar(a: Articulo) { setEditando(a); setAbierto(true); }

  async function borrar(a: Articulo) {
    if (!confirm(`¿Quitar "${a.nombre}" del catálogo de compras?`)) return;
    const res = await fetch(`/api/compras/catalogo/${a.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('No se pudo quitar'); return; }
    toast.success('Artículo quitado');
    mutate();
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: '#eef2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <PackageSearch color="#3658e1" style={{ width: 20, height: 20 }} />
          </Box>
          <Box>
            <Typography component="h1" sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', lineHeight: 1.25 }}>Artículos de compra</Typography>
            <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.25 }}>
              Lo que tu negocio compra a proveedores. Aparece al registrar un gasto o una compra. No es inventario ni una transacción.
            </Typography>
          </Box>
        </Box>
        {canGestionar && (
          <Button variant="contained" size="small" onClick={abrirNuevo} startIcon={<Plus style={{ width: 16, height: 16 }} />} sx={{ flexShrink: 0 }}>
            Nuevo artículo
          </Button>
        )}
      </Box>

      <TextField
        size="small" placeholder="Buscar por nombre o referencia…"
        value={busqueda} onChange={e => setBusqueda(e.target.value)}
        sx={{ maxWidth: 360 }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} color="#9ca3af" /></InputAdornment> } }}
      />

      {/* Tabla */}
      <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', bgcolor: '#fff' }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={24} sx={{ color: '#3658e1' }} /></Box>
        ) : filtrados.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 6, color: '#9ca3af' }}>
            <PackageSearch size={28} />
            <Typography sx={{ fontSize: '0.875rem' }}>
              {busqueda ? 'Sin resultados' : 'Aún no hay artículos de compra'}
            </Typography>
            {!busqueda && (
              <Typography sx={{ fontSize: '0.8125rem' }}>
                Se agregan también al vuelo desde el buscador de un gasto o compra.
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow sx={{ '& th': { fontSize: '0.6875rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #e5e7eb', bgcolor: '#f9fafb' } }}>
                  <TableCell>Artículo</TableCell>
                  <TableCell>Referencia</TableCell>
                  <TableCell>Proveedor</TableCell>
                  <TableCell>ITBIS</TableCell>
                  <TableCell align="right">Costo ref.</TableCell>
                  {canGestionar && <TableCell align="right">Acciones</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtrados.map((a) => (
                  <TableRow key={a.id} sx={{ '&:hover': { bgcolor: '#f9fafb' }, '& td': { fontSize: '0.8125rem', color: '#374151', borderBottom: '1px solid #f3f4f6', py: 1 } }}>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.875rem', color: '#111827', fontWeight: 500 }}>{a.nombre}</Typography>
                      {a.descripcion && <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{a.descripcion}</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{a.referencia ?? '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{a.proveedorNombre ?? '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: '#6b7280' }}>{TASA_LABEL[a.tasaItbis] ?? a.tasaItbis}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {a.costoDOP > 0 ? fmtDOP(Math.round(a.costoDOP * 100)) : '—'}
                    </TableCell>
                    {canGestionar && (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton size="small" onClick={() => abrirEditar(a)} sx={{ color: '#6b7280' }}><Pencil size={15} /></IconButton>
                        <IconButton size="small" onClick={() => borrar(a)} sx={{ color: '#9ca3af', '&:hover': { color: '#ef4444' } }}><Trash2 size={15} /></IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>

      {abierto && (
        <ArticuloDialog
          articulo={editando}
          onClose={() => setAbierto(false)}
          onSaved={() => { setAbierto(false); mutate(); }}
        />
      )}
    </Box>
  );
}

// ─── Modal crear/editar ──────────────────────────────────────────────────────

function ArticuloDialog({ articulo, onClose, onSaved }: {
  articulo: Articulo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esEditar = !!articulo;
  const [nombre, setNombre]                   = useState(articulo?.nombre ?? '');
  const [referencia, setReferencia]           = useState(articulo?.referencia ?? '');
  const [descripcion, setDescripcion]         = useState(articulo?.descripcion ?? '');
  const [costo, setCosto]                     = useState(articulo ? String(articulo.costoDOP || '') : '');
  const [tasaItbis, setTasaItbis]             = useState(articulo?.tasaItbis ?? '0.18');
  const [proveedorNombre, setProveedorNombre] = useState(articulo?.proveedorNombre ?? '');
  const [proveedorRnc, setProveedorRnc]       = useState(articulo?.proveedorRnc ?? '');
  const [saving, setSaving]                   = useState(false);

  async function guardar() {
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const body = {
        nombre: nombre.trim(),
        referencia: referencia.trim() || null,
        descripcion: descripcion.trim() || null,
        costoDOP: parseFloat(costo) || 0,
        tasaItbis,
        proveedorNombre: proveedorNombre.trim() || null,
        proveedorRnc: proveedorRnc.trim() || null,
      };
      const res = esEditar
        ? await fetch(`/api/compras/catalogo/${articulo!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/compras/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { toast.error('No se pudo guardar'); return; }
      toast.success(esEditar ? 'Artículo actualizado' : 'Artículo creado');
      onSaved();
    } catch {
      toast.error('Error de red');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} slotProps={{ paper: { sx: { width: '100%', maxWidth: 560 } } as object }}>
      <DialogTitle>{esEditar ? 'Editar artículo de compra' : 'Nuevo artículo de compra'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField size="small" label="Nombre" required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Cemento gris 42.5kg" autoFocus />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <TextField size="small" label="Referencia" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Opcional" />
          <TextField size="small" label="Costo de referencia (DOP)" type="number" value={costo} onChange={e => setCosto(e.target.value)} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          <TextField select size="small" label="ITBIS" value={tasaItbis} onChange={e => setTasaItbis(e.target.value)}>
            {TASAS.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          <TextField size="small" label="RNC / cédula proveedor" value={proveedorRnc} onChange={e => setProveedorRnc(e.target.value)} placeholder="Opcional" />
        </Box>
        <TextField size="small" label="Proveedor habitual" value={proveedorNombre} onChange={e => setProveedorNombre(e.target.value)} placeholder="Opcional" />
        <TextField size="small" label="Descripción" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Opcional" multiline rows={2} />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={saving} sx={{ borderColor: '#d1d5db', color: '#374151' }}>Cancelar</Button>
        <Button variant="contained" onClick={guardar} disabled={saving} startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : undefined}>
          {esEditar ? 'Guardar cambios' : 'Crear artículo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
