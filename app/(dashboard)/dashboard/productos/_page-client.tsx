'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, Plus, Pencil, Trash2, Loader2, AlertTriangle, Check, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { ImportModal } from '@/components/import-modal';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
import Collapse from '@mui/material/Collapse';
import CircularProgress from '@mui/material/CircularProgress';

interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  referencia: string | null;
  precio: number;
  precioDOP: number;
  tasaItbis: string;
  tipo: string;
  activo: string;
}

const TASA_LABELS: Record<string, string> = {
  '0.18': 'ITBIS 18%',
  '0.16': 'ITBIS 16%',
  '0':    'ITBIS 0%',
  'exento': 'Exento',
};

const TASA_ITBIS_OPCIONES = [
  { value: 'exento', label: 'Exento (fuera de ITBIS)' },
  { value: '0',      label: 'ITBIS 0% (gravado al 0%)' },
  { value: '0.16',   label: 'ITBIS 16%' },
  { value: '0.18',   label: 'ITBIS 18%' },
];

const UNIDADES = ['Unidad', 'Servicio', 'Hora', 'Día', 'Mes', 'Kg', 'Lb', 'Metro', 'Litro', 'Caja', 'Docena'];

const TIPOS_ITEM: { value: string; label: string; disabled?: boolean }[] = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'bien',     label: 'Producto' },
  { value: 'combo',    label: 'Combo', disabled: true },
];

const EMPTY_FORM = {
  nombre: '', descripcion: '', referencia: '',
  precio: '', tasaItbis: 'exento', tipo: 'servicio', unidad: 'Unidad',
};

export default function ProductosPage() {
  const [productos, setProductos]       = useState<Producto[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Producto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Producto | null>(null);
  const [showImport, setShowImport]     = useState(false);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);
  const [showAvanzado, setShowAvanzado] = useState(false);

  const search      = filterValues.q    ?? '';
  const tipoFilter  = filterValues.tipo ?? '';

  const cargar = useCallback(async (q: string, tipo: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q)    params.set('q', q);
      if (tipo) params.set('tipo', tipo);
      const res  = await fetch(`/api/productos?${params}`);
      const data = await res.json();
      setProductos(data.productos ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => cargar(search, tipoFilter), 300);
    return () => clearTimeout(t);
  }, [search, tipoFilter, cargar]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpError(null);
    setShowAvanzado(false);
    setShowForm(true);
  }

  function abrirEdicion(p: Producto) {
    setEditTarget(p);
    setForm({
      nombre:      p.nombre,
      descripcion: p.descripcion ?? '',
      referencia:  p.referencia  ?? '',
      precio:      p.precioDOP.toString(),
      tasaItbis:   p.tasaItbis,
      tipo:        p.tipo,
      unidad:      'Unidad',
    });
    setOpError(null);
    setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setOpError('El nombre es obligatorio'); return; }
    const precio = parseFloat(form.precio);
    if (isNaN(precio) || precio < 0) { setOpError('El precio debe ser un número positivo'); return; }

    setSaving(true);
    setOpError(null);
    try {
      const url    = editTarget ? `/api/productos/${editTarget.id}` : '/api/productos';
      const method = editTarget ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, precio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false);
      cargar(search, tipoFilter);
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
      const res  = await fetch(`/api/productos/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar(search, tipoFilter);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataTableColumn<Producto>[] = useMemo(() => [
    {
      id: 'nombre',
      header: 'Nombre',
      sortable: true,
      render: p => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.nombre}</Typography>
          {p.descripcion && (
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
              {p.descripcion}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'referencia',
      header: 'Referencia',
      visibleAt: 'lg',
      render: p => <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{p.referencia ?? '—'}</Typography>,
    },
    {
      id: 'tipo',
      header: 'Tipo',
      visibleAt: 'md',
      render: p => (
        <Chip
          label={p.tipo === 'bien' ? 'Bien' : 'Servicio'}
          size="small"
          sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 600,
            ...(p.tipo === 'bien'
              ? { bgcolor: '#f3f4f6', color: '#374151' }
              : { bgcolor: '#f0fdfa', color: '#0d9488', border: '1px solid #99f6e4' }
            ),
            '& .MuiChip-label': { px: 1 }
          }}
        />
      ),
    },
    {
      id: 'precio',
      header: 'Precio (DOP)',
      align: 'right',
      sortable: true,
      sortAccessor: p => p.precioDOP,
      render: p => (
        <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {p.precioDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
        </Typography>
      ),
    },
    {
      id: 'itbis',
      header: 'ITBIS',
      visibleAt: 'md',
      render: p => <Typography variant="body2" sx={{ color: 'text.secondary' }}>{TASA_LABELS[p.tasaItbis] ?? p.tasaItbis}</Typography>,
    },
  ], []);

  const rowActions = (p: Producto): RowAction[] => [
    { icon: Pencil, title: 'Editar',   onClick: () => abrirEdicion(p) },
    { icon: Trash2, title: 'Eliminar', onClick: () => { setDeleteTarget(p); setOpError(null); }, variant: 'danger' },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <DataTable<Producto>
        data={productos}
        loading={loading}
        columns={columns}
        title="Productos y Servicios"
        description="Catálogo de ítems para tus facturas"
        filters={[
          { type: 'search', id: 'q', placeholder: 'Buscar por nombre o referencia…' },
          {
            type: 'select',
            id: 'tipo',
            label: 'Todos',
            options: [
              { value: 'bien',     label: 'Bienes' },
              { value: 'servicio', label: 'Servicios' },
            ],
            placeholder: 'Todos los tipos',
          },
        ]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        rowActions={rowActions}
        emptyState={{
          icon: Package,
          title: search ? 'Sin resultados para esa búsqueda' : 'Sin productos o servicios registrados',
          hint: search ? undefined : 'Crea tu catálogo para agilizar la emisión de facturas',
          cta: search ? undefined : (
            <MuiButton variant="contained" size="small" disableElevation onClick={abrirNuevo}
              startIcon={<Plus style={{ width: 14, height: 14 }} />}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
              Nuevo ítem
            </MuiButton>
          ),
        }}
        headerActions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <MuiButton variant="outlined" size="small" onClick={() => setShowImport(true)}
              startIcon={<Upload style={{ width: 14, height: 14 }} />}
              sx={{ borderRadius: '8px', textTransform: 'none', borderColor: 'divider', color: 'text.secondary' }}>
              Importar de Alegra
            </MuiButton>
            <MuiButton variant="contained" size="small" disableElevation onClick={abrirNuevo}
              startIcon={<Plus style={{ width: 14, height: 14 }} />}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
              Nuevo ítem
            </MuiButton>
          </Box>
        }
      />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        endpoint="/api/import/productos"
        title="Importar productos de Alegra"
        helpText="Archivo CSV exportado de Alegra (Productos-servicios). Se omiten duplicados por referencia o nombre."
        columns={[
          { key: 'nombre',     label: 'Nombre' },
          { key: 'referencia', label: 'Referencia' },
          { key: 'precio',     label: 'Precio (¢)' },
          { key: 'tasaItbis',  label: 'ITBIS' },
          { key: 'tipo',       label: 'Tipo' },
        ]}
        onDone={() => cargar(search, tipoFilter)}
      />

      {/* Modal: Crear / Editar */}
      <Dialog open={showForm} onClose={() => { setShowForm(false); setShowAvanzado(false); }} maxWidth="sm" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          {editTarget ? 'Editar ítem' : 'Nuevo producto o servicio'}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {opError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>}

            {/* Tipo toggle pills */}
            {!editTarget && (
              <Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {TIPOS_ITEM.map((t) => {
                    const isSelected = form.tipo === t.value;
                    if (t.disabled) {
                      return (
                        <Box key={t.value} title="Próximamente"
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 1, borderRadius: '20px', border: '1px solid #e5e7eb', fontSize: '0.875rem', fontWeight: 600, opacity: 0.4, cursor: 'not-allowed', userSelect: 'none', bgcolor: 'white', color: '#9ca3af' }}>
                          {t.label}
                        </Box>
                      );
                    }
                    return (
                      <Box key={t.value} component="button" type="button"
                        onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 0.75,
                          px: 2, py: 1, borderRadius: '20px', border: '1px solid',
                          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                          ...(isSelected
                            ? { bgcolor: '#f0fdfa', borderColor: '#0d9488', color: '#0d9488' }
                            : { bgcolor: 'white', borderColor: '#e5e7eb', color: '#6b7280', '&:hover': { borderColor: '#d1d5db', bgcolor: 'grey.50' } }),
                        }}>
                        {isSelected && <Check style={{ width: 14, height: 14 }} />}
                        {t.label}
                      </Box>
                    );
                  })}
                </Box>
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.75 }}>
                  Una vez creado, no podrás cambiar el tipo del artículo.
                </Typography>
              </Box>
            )}

            {/* Nombre */}
            <MuiTextField
              label="Nombre *"
              placeholder={form.tipo === 'bien' ? 'Ej. Camisa talla M' : 'Ej. Diseño de logo'}
              value={form.nombre} size="small" fullWidth autoFocus
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />

            {/* Precio + ITBIS */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <MuiTextField
                label="Precio (DOP) *" type="number" placeholder="0.00"
                value={form.precio} size="small" fullWidth
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Impuesto (ITBIS)</InputLabel>
                <Select
                  label="Impuesto (ITBIS)"
                  value={form.tasaItbis}
                  onChange={(e) => setForm((f) => ({ ...f, tasaItbis: e.target.value }))}
                  sx={{ borderRadius: '8px' }}
                >
                  {TASA_ITBIS_OPCIONES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Unidad de medida */}
            <FormControl size="small" fullWidth>
              <InputLabel>Unidad de medida</InputLabel>
              <Select
                label="Unidad de medida"
                value={form.unidad}
                onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}
                sx={{ borderRadius: '8px' }}
              >
                {UNIDADES.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </Select>
            </FormControl>

            {/* Formulario avanzado */}
            <Box>
              <MuiButton
                variant="text" size="small"
                onClick={() => setShowAvanzado((v) => !v)}
                startIcon={showAvanzado ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                sx={{ textTransform: 'none', fontWeight: 600, color: 'primary.main', p: 0 }}>
                Mostrar formulario avanzado
              </MuiButton>
              <Collapse in={showAvanzado}>
                <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, border: '1px dashed #e5e7eb', borderRadius: '8px', p: 2 }}>
                  <MuiTextField
                    label="Referencia / SKU" placeholder="SERV-001"
                    value={form.referencia} size="small" fullWidth
                    onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                  />
                  <MuiTextField
                    label="Descripción" placeholder="Descripción opcional que aparecerá en la factura"
                    value={form.descripcion} size="small" fullWidth
                    onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                  />
                </Box>
              </Collapse>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton variant="outlined" onClick={() => { setShowForm(false); setShowAvanzado(false); }} disabled={saving}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</MuiButton>
          <MuiButton variant="contained" disableElevation onClick={handleGuardar} disabled={saving}
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {saving ? 'Guardando…' : (editTarget ? 'Guardar cambios' : 'Crear ítem')}
          </MuiButton>
        </DialogActions>
      </Dialog>

      {/* Modal: Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700 }}>¿Eliminar ítem?</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {opError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Las facturas existentes no se verán afectadas.
            </Typography>
            <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
              <Typography variant="caption">Este ítem dejará de aparecer en el selector de nueva factura.</Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton variant="outlined" onClick={() => setDeleteTarget(null)} disabled={deleting}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</MuiButton>
          <MuiButton variant="contained" color="error" disableElevation onClick={handleEliminar} disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : undefined}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </MuiButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
