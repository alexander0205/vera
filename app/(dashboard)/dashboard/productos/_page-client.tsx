'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, Plus, Pencil, Trash2, AlertTriangle, Check, ChevronDown, ChevronUp, Upload, PackagePlus, Camera, X } from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { ImportModal } from '@/components/import-modal';
import MaestrosProductoSection from './MaestrosProductoSection';
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
import Switch from '@mui/material/Switch';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

interface Producto {
  id:                   number;
  nombre:               string;
  descripcion:          string | null;
  referencia:           string | null;
  codigoBarras:         string | null;
  precio:               number;
  precioDOP:            number;
  costo:                number;
  costoDOP:             number;
  tasaItbis:            string;
  tipo:                 string;
  activo:               string;
  unidadMedida:         string;
  stockActual:          number;
  stockMinimo:          number;
  controlaInventario:   boolean;
  permiteVentaSinStock: boolean;
  categoriaId:          number | null;
  imagen:               string | null;
}

interface Categoria { id: number; nombre: string; }

const IMG_MAX_BYTES = 800_000; // ~800KB, mismo tope que logo/firma de empresa

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  nombre: '', descripcion: '', referencia: '', codigoBarras: '',
  precio: '', tasaItbis: 'exento', tipo: 'servicio', unidad: 'Unidad',
  costo: '', stockActual: '', stockMinimo: '',
  controlaInventario: false, permiteVentaSinStock: true,
  categoriaId: '', imagen: '',
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
  const [categorias, setCategorias]     = useState<Categoria[]>([]);

  useEffect(() => {
    fetch('/api/categorias').then((r) => r.json()).then((d) => setCategorias(d.categorias ?? []));
  }, []);

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
      nombre:               p.nombre,
      descripcion:          p.descripcion ?? '',
      referencia:           p.referencia  ?? '',
      codigoBarras:         p.codigoBarras ?? '',
      precio:               p.precioDOP.toString(),
      tasaItbis:            p.tasaItbis,
      tipo:                 p.tipo,
      unidad:               p.unidadMedida ?? 'Unidad',
      costo:                p.costoDOP?.toString() ?? '',
      stockActual:          p.stockActual?.toString() ?? '',
      stockMinimo:          p.stockMinimo?.toString() ?? '',
      controlaInventario:   p.controlaInventario   ?? false,
      permiteVentaSinStock: p.permiteVentaSinStock ?? true,
      categoriaId:          p.categoriaId != null ? String(p.categoriaId) : '',
      imagen:               p.imagen ?? '',
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
      const costo      = parseFloat(form.costo) || 0;
      const stockActual = parseInt(form.stockActual) || 0;
      const stockMinimo = parseInt(form.stockMinimo) || 0;
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          precio,
          unidadMedida:         form.unidad,
          costo,
          stockActual,
          stockMinimo,
          controlaInventario:   form.controlaInventario,
          permiteVentaSinStock: form.permiteVentaSinStock,
          categoriaId:          form.categoriaId ? Number(form.categoriaId) : null,
          imagen:               form.imagen || null,
        }),
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
      id: 'stock',
      header: 'Stock',
      visibleAt: 'md',
      render: p => {
        if (p.tipo !== 'bien' || !p.controlaInventario) {
          return <Typography component="span" sx={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>No aplica</Typography>;
        }
        const agotado    = p.stockActual <= 0;
        const bajominimo = !agotado && p.stockActual <= p.stockMinimo;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography component="span" sx={{ fontWeight: 500, fontSize: '0.875rem', color: agotado ? '#dc2626' : bajominimo ? '#d97706' : '#15803d' }}>
              {p.stockActual}
            </Typography>
            {agotado && (
              <Chip label="Agotado" size="small" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', '& .MuiChip-label': { px: 0.75 } }} />
            )}
            {bajominimo && (
              <Chip label="Bajo mínimo" size="small" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', '& .MuiChip-label': { px: 0.75 } }} />
            )}
          </Box>
        );
      },
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
    { icon: Pencil, title: 'Editar', onClick: () => abrirEdicion(p) },
    ...(p.tipo === 'bien' && p.controlaInventario
      ? [{ icon: PackagePlus, title: 'Ver movimientos', onClick: () => { window.location.href = `/dashboard/inventario?productoId=${p.id}`; } }]
      : []),
    { icon: Trash2, title: 'Eliminar', onClick: () => { setDeleteTarget(p); setOpError(null); }, variant: 'danger' as const },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <DataTable<Producto>
        data={productos}
        loading={loading}
        columns={columns}
        rowHref={p => `/dashboard/productos/${p.id}`}
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

            {/* Costo de compra — solo para bienes */}
            {form.tipo === 'bien' && (
              <MuiTextField
                label="Costo de compra (DOP)" type="number" placeholder="0.00"
                value={form.costo} size="small" fullWidth
                helperText="Usado para calcular margen y costo de ventas. No aparece en la factura."
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                onChange={(e) => setForm((f) => ({ ...f, costo: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            )}

            {/* Categoría */}
            <FormControl size="small" fullWidth>
              <InputLabel>Categoría</InputLabel>
              <Select
                label="Categoría"
                value={form.categoriaId}
                onChange={(e) => setForm((f) => ({ ...f, categoriaId: e.target.value }))}
                sx={{ borderRadius: '8px' }}
              >
                <MenuItem value=""><em>Sin categoría</em></MenuItem>
                {categorias.map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>{c.nombre}</MenuItem>
                ))}
              </Select>
            </FormControl>

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

            {/* Control de inventario — solo para bienes */}
            {form.tipo === 'bien' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, border: '1px dashed #99f6e4', borderRadius: '8px', p: 2, bgcolor: 'rgba(240,253,250,0.4)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#1f2937' }}>Controlar inventario</Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25 }}>El stock se descuenta automáticamente al guardar o emitir facturas</Typography>
                  </Box>
                  <Switch
                    checked={form.controlaInventario}
                    onChange={(e) => setForm((f) => ({ ...f, controlaInventario: e.target.checked }))}
                    sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#0d9488' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#0d9488' } }}
                  />
                </Box>

                {form.controlaInventario && (
                  <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                      <MuiTextField
                        label="Stock actual" type="number" placeholder="0"
                        value={form.stockActual} size="small" fullWidth
                        slotProps={{ htmlInput: { min: 0, step: 1 } }}
                        onChange={(e) => setForm((f) => ({ ...f, stockActual: e.target.value }))}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                      />
                      <MuiTextField
                        label="Stock mínimo" type="number" placeholder="0"
                        value={form.stockMinimo} size="small" fullWidth
                        helperText="Alerta si el stock baja de este número"
                        slotProps={{ htmlInput: { min: 0, step: 1 } }}
                        onChange={(e) => setForm((f) => ({ ...f, stockMinimo: e.target.value }))}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Box>
                        <Typography variant="body2" sx={{ color: '#374151' }}>Permitir venta sin stock</Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.25 }}>Si está desactivado, se bloqueará la factura cuando el stock sea 0</Typography>
                      </Box>
                      <Switch
                        checked={form.permiteVentaSinStock}
                        onChange={(e) => setForm((f) => ({ ...f, permiteVentaSinStock: e.target.checked }))}
                        sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#0d9488' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#0d9488' } }}
                      />
                    </Box>
                  </>
                )}
              </Box>
            )}

            {/* Imagen del producto */}
            <ImagenProductoBox imagen={form.imagen} onChange={(v) => setForm((f) => ({ ...f, imagen: v }))} />

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
                    label="Código de barras (POS)" placeholder="Escanea o escribe el EAN/UPC"
                    value={form.codigoBarras} size="small" fullWidth
                    onChange={(e) => setForm((f) => ({ ...f, codigoBarras: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                  />
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

            {/* Atributos (maestros) — solo al editar un producto existente */}
            {editTarget && <MaestrosProductoSection productId={editTarget.id} />}
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

// ─── Imagen del producto (upload + preview) ──────────────────────────────────

function ImagenProductoBox({ imagen, onChange }: { imagen: string; onChange: (v: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Solo se aceptan imágenes'); return; }
    if (file.size > IMG_MAX_BYTES) { setError('Imagen demasiado grande (máx 800 KB)'); return; }
    setError(null);
    onChange(await fileToBase64(file));
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151', mb: 0.5 }}>Imagen (opcional)</Typography>
      <Box component="label" sx={{
        position: 'relative', display: 'flex', aspectRatio: '1 / 1', width: '100%', maxWidth: 200, cursor: 'pointer',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.75,
        borderRadius: '8px', border: '2px dashed #e5e7eb', bgcolor: '#f9fafb', color: '#9ca3af',
        '&:hover': { borderColor: '#d1d5db' },
      }}>
        <input type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {imagen ? (
          <>
            <Box component="img" src={imagen} alt="Producto" sx={{ height: '100%', width: '100%', borderRadius: '8px', objectFit: 'cover' }} />
            <IconButton size="small" onClick={(e) => { e.preventDefault(); onChange(''); }}
              sx={{ position: 'absolute', right: 6, top: 6, bgcolor: 'rgba(255,255,255,0.9)', color: '#4b5563', p: 0.5, boxShadow: 1, '&:hover': { bgcolor: '#fff' } }}>
              <X style={{ width: 14, height: 14 }} />
            </IconButton>
          </>
        ) : (
          <>
            <Camera style={{ width: 32, height: 32 }} />
            <Box component="span" sx={{ fontSize: '0.75rem', textAlign: 'center' }}>Selecciona una imagen<br />Tamaño máximo: 800 KB</Box>
          </>
        )}
      </Box>
      {error && <Typography sx={{ fontSize: '0.75rem', color: '#dc2626' }}>{error}</Typography>}
    </Box>
  );
}
