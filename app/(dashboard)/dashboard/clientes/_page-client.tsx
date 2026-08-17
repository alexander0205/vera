'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, Pencil, Trash2, AlertTriangle, Upload } from 'lucide-react';
import { ImportModal } from '@/components/import-modal';
import { ClienteDialog } from '@/components/shared/cliente-dialog';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ClientesPage() {
  const [clientes, setClientes]         = useState<Cliente[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Cliente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [showImport, setShowImport]     = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

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

  function abrirNuevo() {
    setEditTarget(null);
    setOpError(null);
    setShowForm(true);
  }

  function abrirEdicion(c: Cliente) {
    setEditTarget(c);
    setOpError(null);
    setShowForm(true);
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

  const columns: DataTableColumn<Cliente>[] = useMemo(() => [
    {
      id: 'razonSocial',
      header: 'Nombre / Razón Social',
      sortable: true,
      render: c => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: '#eef2fe', color: '#3658e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase' }}>
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
              Importar CSV
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
        title="Importar clientes desde CSV"
        helpText="Archivo CSV de contactos. Se omiten duplicados por RNC o nombre."
        columns={[
          { key: 'razonSocial', label: 'Nombre / Razón Social' },
          { key: 'rnc',         label: 'RNC / Cédula' },
          { key: 'email',       label: 'Email' },
          { key: 'telefono',    label: 'Teléfono' },
        ]}
        onDone={() => cargar(search)}
      />

      {/* Crear / Editar — el MISMO modal que la factura, la cotización y el POS.
          Esta pantalla tenía su propia copia, con los dependientes en una
          pestaña que decía «Guarda el cliente primero»: había que crear, cerrar,
          volver a abrir y editar para ponerle un hijo. */}
      {showForm && (
        <ClienteDialog
          open
          clienteId={editTarget?.id}
          onClose={() => setShowForm(false)}
          onCreated={() => cargar(search)}
          onActualizado={() => cargar(search)}
        />
      )}

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
