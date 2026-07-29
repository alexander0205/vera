'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, Pencil, Trash2, Loader2, AlertTriangle, Upload, X } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import { ImportModal } from '@/components/import-modal';
import { formatTelefonoDO } from '@/lib/utils/format';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import MuiTextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

interface Cliente {
  id: number;
  razonSocial: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  descripcion: string | null;
}

interface Dependiente {
  id: number;
  nombre: string;
  apellido: string;
}

const EMPTY_FORM = { razonSocial: '', rnc: '', email: '', telefono: '', direccion: '', descripcion: '' };
type ClienteForm = typeof EMPTY_FORM;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Field({ label, field, type = 'text', placeholder, form, setForm }: {
  label: string;
  field: keyof ClienteForm;
  type?: string;
  placeholder?: string;
  form: ClienteForm;
  setForm: React.Dispatch<React.SetStateAction<ClienteForm>>;
}) {
  const isTelefono = field === 'telefono';
  return (
    <MuiTextField
      label={label} type={type} placeholder={placeholder}
      value={form[field]} size="small" fullWidth
      slotProps={{ htmlInput: { inputMode: isTelefono ? 'tel' : undefined } }}
      onChange={(e) => {
        const raw = e.target.value;
        const next = isTelefono ? formatTelefonoDO(raw) : raw;
        setForm((f) => ({ ...f, [field]: next }));
      }}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
    />
  );
}

export default function ClientesPage() {
  const [clientes, setClientes]         = useState<Cliente[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Cliente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [showImport, setShowImport]     = useState(false);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);
  const [tabValue, setTabValue]         = useState(0);

  const [dependientes, setDependientes]   = useState<Dependiente[]>([]);
  const [loadingDeps, setLoadingDeps]     = useState(false);
  const [depForm, setDepForm]             = useState({ nombre: '', apellido: '' });
  const [savingDep, setSavingDep]         = useState(false);
  const [depError, setDepError]           = useState<string | null>(null);
  const [deletingDepId, setDeletingDepId] = useState<number | null>(null);

  const search = filterValues.q ?? '';

  const cargar = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const data = await res.json();
      setClientes(data.clientes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => cargar(search), 300);
    return () => clearTimeout(t);
  }, [search, cargar]);

  async function cargarDependientes(clientId: number) {
    setLoadingDeps(true);
    setDepError(null);
    try {
      const res  = await fetch(`/api/clientes/${clientId}/dependientes`);
      const data = await res.json();
      setDependientes(data.dependientes ?? []);
    } catch {
      setDepError('Error cargando dependientes');
    } finally {
      setLoadingDeps(false);
    }
  }

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpError(null);
    setDependientes([]);
    setDepForm({ nombre: '', apellido: '' });
    setDepError(null);
    setTabValue(0);
    setShowForm(true);
  }

  function abrirEdicion(c: Cliente) {
    setEditTarget(c);
    setForm({
      razonSocial: c.razonSocial,
      rnc:         c.rnc         ?? '',
      email:       c.email       ?? '',
      telefono:    formatTelefonoDO(c.telefono ?? ''),
      direccion:   c.direccion   ?? '',
      descripcion: c.descripcion ?? '',
    });
    setOpError(null);
    setDepForm({ nombre: '', apellido: '' });
    setDepError(null);
    setTabValue(0);
    cargarDependientes(c.id);
    setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.razonSocial.trim()) {
      setOpError('El nombre / razón social es obligatorio');
      return;
    }
    setSaving(true);
    setOpError(null);
    try {
      const url    = editTarget ? `/api/clientes/${editTarget.id}` : '/api/clientes';
      const method = editTarget ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false);
      cargar(search);
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
      const res  = await fetch(`/api/clientes/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar(search);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
  }

  async function handleAgregarDependiente() {
    if (!editTarget) return;
    if (!depForm.nombre.trim() || !depForm.apellido.trim()) {
      setDepError('Nombre y apellido son obligatorios');
      return;
    }
    setSavingDep(true);
    setDepError(null);
    try {
      const res  = await fetch(`/api/clientes/${editTarget.id}/dependientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(depForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error agregando dependiente');
      setDepForm({ nombre: '', apellido: '' });
      cargarDependientes(editTarget.id);
    } catch (e: unknown) {
      setDepError(e instanceof Error ? e.message : 'Error agregando dependiente');
    } finally {
      setSavingDep(false);
    }
  }

  async function handleEliminarDependiente(depId: number) {
    if (!editTarget) return;
    setDeletingDepId(depId);
    setDepError(null);
    try {
      const res  = await fetch(`/api/clientes/${editTarget.id}/dependientes/${depId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando dependiente');
      cargarDependientes(editTarget.id);
    } catch (e: unknown) {
      setDepError(e instanceof Error ? e.message : 'Error eliminando dependiente');
    } finally {
      setDeletingDepId(null);
    }
  }

  const columns: DataTableColumn<Cliente>[] = useMemo(() => [
    {
      id: 'razonSocial',
      header: 'Nombre / Razón Social',
      sortable: true,
      render: c => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: '#f0fdfa', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase' }}>
            {initials(c.razonSocial)}
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.razonSocial}</Typography>
        </Box>
      ),
    },
    {
      id: 'rnc',
      header: 'RNC / Cédula',
      visibleAt: 'md',
      render: c => <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>{c.rnc ?? '—'}</Typography>,
    },
    {
      id: 'email',
      header: 'Email',
      visibleAt: 'lg',
      render: c => <Typography variant="body2" sx={{ color: 'text.secondary' }}>{c.email ?? '—'}</Typography>,
    },
    {
      id: 'telefono',
      header: 'Teléfono',
      visibleAt: 'lg',
      render: c => <Typography variant="body2" sx={{ color: 'text.secondary' }}>{c.telefono ?? '—'}</Typography>,
    },
  ], []);

  const rowActions = (c: Cliente): RowAction[] => [
    { icon: Pencil, title: 'Editar',   onClick: () => abrirEdicion(c) },
    { icon: Trash2, title: 'Eliminar', onClick: () => { setDeleteTarget(c); setOpError(null); }, variant: 'danger' },
  ];

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <DataTable<Cliente>
        data={clientes}
        loading={loading}
        columns={columns}
        title="Clientes"
        description="Directorio de compradores y contactos"
        filters={[{ type: 'search', id: 'q', placeholder: 'Buscar por nombre, RNC o email…' }]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        rowActions={rowActions}
        emptyState={{
          icon: Users,
          title: search ? 'Sin resultados para esa búsqueda' : 'Sin clientes registrados',
          hint: search ? undefined : 'Crea tu primer cliente o aparecerán automáticamente al emitir facturas',
          cta: search ? undefined : (
            <MuiButton variant="contained" size="small" disableElevation onClick={abrirNuevo}
              startIcon={<Plus style={{ width: 14, height: 14 }} />}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
              Nuevo cliente
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
              Nuevo cliente
            </MuiButton>
          </Box>
        }
      />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        endpoint="/api/import/clientes"
        title="Importar clientes de Alegra"
        helpText="Archivo CSV exportado de Alegra (Contactos). Se omiten duplicados por RNC o nombre."
        columns={[
          { key: 'razonSocial', label: 'Nombre / Razón Social' },
          { key: 'rnc',         label: 'RNC / Cédula' },
          { key: 'email',       label: 'Email' },
          { key: 'telefono',    label: 'Teléfono' },
        ]}
        onDone={() => cargar(search)}
      />

      {/* Modal: Crear / Editar */}
      <Dialog open={showForm} onClose={() => setShowForm(false)} maxWidth="sm" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          {editTarget ? 'Editar cliente' : 'Nuevo cliente'}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}
            sx={{ mb: 2, borderBottom: '1px solid #e5e7eb' }}>
            <Tab label="Datos" sx={{ textTransform: 'none', fontWeight: 600 }} />
            <Tab label="Dependientes" sx={{ textTransform: 'none', fontWeight: 600 }} />
          </Tabs>

          {tabValue === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {opError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.75 }}>
                  RNC / Cédula
                </Typography>
                <RncSearch
                  placeholder="Buscar RNC, Cédula o razón social…"
                  value={form.rnc || undefined}
                  onSelect={(r) => setForm((f) => ({
                    ...f,
                    rnc: r.rnc,
                    razonSocial: f.razonSocial.trim() ? f.razonSocial : r.nombre,
                  }))}
                  onClear={() => setForm((f) => ({ ...f, rnc: '' }))}
                  showSyncHint={false}
                />
              </Box>
              <Field label="Nombre / Razón Social *" field="razonSocial" placeholder="Empresa XYZ SRL" form={form} setForm={setForm} />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Field label="Teléfono" field="telefono" placeholder="(809) 000-0000" form={form} setForm={setForm} />
                <Field label="Email" field="email" type="email" placeholder="facturacion@empresa.com" form={form} setForm={setForm} />
              </Box>
              <Field label="Dirección" field="direccion" placeholder="Calle, No., Ciudad" form={form} setForm={setForm} />
              <MuiTextField
                label="Descripción" placeholder="Notas internas, sector, condiciones especiales…"
                value={form.descripcion} multiline rows={3} size="small" fullWidth
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Box>
          )}

          {tabValue === 1 && (
            <Box sx={{ minHeight: 220 }}>
              {!editTarget ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 5, gap: 1 }}>
                  <Users style={{ width: 32, height: 32, color: '#d1d5db' }} />
                  <Typography variant="body2" sx={{ color: 'text.disabled', textAlign: 'center' }}>
                    Guarda el cliente primero para agregar dependientes.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {depError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{depError}</Alert>}
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                    <MuiTextField
                      label="Nombre" placeholder="Nombre" value={depForm.nombre} size="small"
                      sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                      onChange={(e) => setDepForm((f) => ({ ...f, nombre: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarDependiente(); }}
                    />
                    <MuiTextField
                      label="Apellido" placeholder="Apellido" value={depForm.apellido} size="small"
                      sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                      onChange={(e) => setDepForm((f) => ({ ...f, apellido: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarDependiente(); }}
                    />
                    <MuiButton variant="contained" size="small" disableElevation
                      onClick={handleAgregarDependiente} disabled={savingDep}
                      startIcon={savingDep ? <CircularProgress size={12} color="inherit" /> : <Plus style={{ width: 14, height: 14 }} />}
                      sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600, height: 40, flexShrink: 0 }}>
                      Agregar
                    </MuiButton>
                  </Box>
                  {loadingDeps ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : dependientes.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'text.disabled', textAlign: 'center', py: 3 }}>
                      Sin dependientes registrados.
                    </Typography>
                  ) : (
                    <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                      {dependientes.map((dep, i) => (
                        <Box key={dep.id}>
                          {i > 0 && <Divider />}
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, '&:hover': { bgcolor: 'grey.50' } }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{dep.nombre} {dep.apellido}</Typography>
                            <IconButton size="small" onClick={() => handleEliminarDependiente(dep.id)} disabled={deletingDepId === dep.id}
                              sx={{ color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: '#fef2f2' } }}>
                              {deletingDepId === dep.id
                                ? <CircularProgress size={14} />
                                : <X style={{ width: 14, height: 14 }} />}
                            </IconButton>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton variant="outlined" onClick={() => setShowForm(false)} disabled={saving}
            sx={{ borderRadius: '8px', textTransform: 'none' }}>Cancelar</MuiButton>
          {tabValue === 0 && (
            <MuiButton variant="contained" disableElevation onClick={handleGuardar} disabled={saving}
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 600 }}>
              {saving ? 'Guardando…' : (editTarget ? 'Guardar cambios' : 'Crear cliente')}
            </MuiButton>
          )}
        </DialogActions>
      </Dialog>

      {/* Modal: Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}>
        <DialogTitle sx={{ fontWeight: 700 }}>¿Eliminar cliente?</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {opError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{opError}</Alert>}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Vas a eliminar a <strong>{deleteTarget?.razonSocial}</strong>. Esta acción no se puede deshacer.
            </Typography>
            <Alert severity="warning" icon={<AlertTriangle style={{ width: 16, height: 16 }} />} sx={{ borderRadius: '8px' }}>
              <Typography variant="caption">Las facturas emitidas a este cliente no se verán afectadas.</Typography>
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
