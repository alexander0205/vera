'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { Users, Plus, X, ArrowLeft } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import { formatTelefonoDO } from '@/lib/utils/format';

interface Dependiente {
  id: number;   // > 0 persistido en DB; < 0 temporal (en memoria, modo crear)
  nombre: string;
  apellido: string;
}

const EMPTY_FORM = { razonSocial: '', rnc: '', email: '', telefono: '', direccion: '', descripcion: '' };
type ClienteForm = typeof EMPTY_FORM;

const inputSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } } as const;

/**
 * Campo de texto. Definido FUERA del componente página: si se define adentro,
 * cada render crea una función nueva y React remonta el <TextField>, tumbando el foco.
 */
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
        {label}
      </Typography>
      <TextField
        type={type}
        placeholder={placeholder}
        size="small"
        fullWidth
        value={form[field]}
        onChange={(e) => {
          const raw = e.target.value;
          const next = isTelefono ? formatTelefonoDO(raw) : raw;
          setForm((f) => ({ ...f, [field]: next }));
        }}
        slotProps={{ htmlInput: { inputMode: isTelefono ? 'tel' : undefined } }}
        sx={inputSx}
      />
    </Box>
  );
}

/**
 * Formulario de cliente en página propia (crear y editar).
 * Datos arriba + dependientes como listado abajo, disponible en ambos modos:
 *   - Editar: dependientes se persisten en vivo (ya hay clientId).
 *   - Crear:  se acumulan en memoria y se guardan tras crear el cliente.
 */
export default function ClienteForm({ clienteId }: { clienteId?: number }) {
  const router = useRouter();
  const isEdit = clienteId != null;

  const [form, setForm]       = useState<ClienteForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEdit);   // edición: carga datos primero
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Dependientes
  const [dependientes, setDependientes]   = useState<Dependiente[]>([]);
  const [depForm, setDepForm]             = useState({ nombre: '', apellido: '' });
  const [savingDep, setSavingDep]         = useState(false);
  const [depError, setDepError]           = useState<string | null>(null);
  const [deletingDepId, setDeletingDepId] = useState<number | null>(null);

  // Si el cliente ya fue creado (modo crear), evita duplicarlo al reintentar guardar.
  const createdIdRef = useRef<number | null>(null);
  const tempIdRef    = useRef(-1);

  // ID efectivo del cliente para operaciones de dependientes en vivo.
  const persistedId = clienteId ?? createdIdRef.current;

  // Cargar cliente + dependientes en modo edición
  useEffect(() => {
    if (!isEdit) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [cRes, dRes] = await Promise.all([
          fetch(`/api/clientes/${clienteId}`),
          fetch(`/api/clientes/${clienteId}/dependientes`),
        ]);
        const cData = await cRes.json();
        const dData = await dRes.json();
        if (cancel) return;
        if (!cRes.ok) { setError(cData.error ?? 'Error cargando el cliente'); return; }
        const c = cData.cliente;
        setForm({
          razonSocial: c.razonSocial ?? '',
          rnc:         c.rnc         ?? '',
          email:       c.email       ?? '',
          telefono:    formatTelefonoDO(c.telefono ?? ''),
          direccion:   c.direccion   ?? '',
          descripcion: c.descripcion ?? '',
        });
        setDependientes(dData.dependientes ?? []);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [isEdit, clienteId]);

  async function recargarDependientes(id: number) {
    try {
      const res  = await fetch(`/api/clientes/${id}/dependientes`);
      const data = await res.json();
      if (res.ok) setDependientes(data.dependientes ?? []);
    } catch { /* silencioso: la lista en memoria sigue válida */ }
  }

  async function handleAgregarDependiente() {
    const nombre   = depForm.nombre.trim();
    const apellido = depForm.apellido.trim();
    if (!nombre || !apellido) { setDepError('Nombre y apellido son obligatorios'); return; }
    setDepError(null);

    // Si ya hay cliente en DB, persiste en vivo; si no, acumula en memoria.
    if (persistedId != null) {
      setSavingDep(true);
      try {
        const res  = await fetch(`/api/clientes/${persistedId}/dependientes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, apellido }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Error agregando dependiente');
        setDependientes((prev) => [...prev, data.dependiente]);
        setDepForm({ nombre: '', apellido: '' });
      } catch (e: unknown) {
        setDepError(e instanceof Error ? e.message : 'Error agregando dependiente');
      } finally {
        setSavingDep(false);
      }
    } else {
      setDependientes((prev) => [...prev, { id: tempIdRef.current--, nombre, apellido }]);
      setDepForm({ nombre: '', apellido: '' });
    }
  }

  async function handleEliminarDependiente(dep: Dependiente) {
    setDepError(null);
    // Persistido (id > 0): borra en DB. Temporal (id < 0): solo de memoria.
    if (dep.id > 0 && persistedId != null) {
      setDeletingDepId(dep.id);
      try {
        const res  = await fetch(`/api/clientes/${persistedId}/dependientes/${dep.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Error eliminando dependiente');
        setDependientes((prev) => prev.filter((d) => d.id !== dep.id));
      } catch (e: unknown) {
        setDepError(e instanceof Error ? e.message : 'Error eliminando dependiente');
      } finally {
        setDeletingDepId(null);
      }
    } else {
      setDependientes((prev) => prev.filter((d) => d.id !== dep.id));
    }
  }

  async function handleGuardar() {
    if (!form.razonSocial.trim()) { setError('El nombre / razón social es obligatorio'); return; }
    setSaving(true);
    setError(null);
    try {
      // 1. Crear (una sola vez) o actualizar el cliente.
      let id = clienteId ?? createdIdRef.current;
      if (id == null) {
        const res  = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje ?? data.error ?? 'Error guardando');
        id = data.cliente.id as number;
        createdIdRef.current = id;
      } else {
        const res  = await fetch(`/api/clientes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.mensaje ?? data.error ?? 'Error guardando');
      }

      // 2. Persistir dependientes acumulados en memoria (modo crear).
      const pendientes = dependientes.filter((d) => d.id < 0);
      if (pendientes.length > 0) {
        const resultados = await Promise.allSettled(pendientes.map((d) =>
          fetch(`/api/clientes/${id}/dependientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: d.nombre, apellido: d.apellido }),
          }).then((r) => { if (!r.ok) throw new Error(); }),
        ));
        const fallidos = resultados.filter((r) => r.status === 'rejected').length;
        if (fallidos > 0) {
          // El cliente sí quedó guardado; recargamos lo persistido y dejamos
          // que el usuario reintente sin duplicar el cliente (createdIdRef).
          await recargarDependientes(id);
          setError(`El cliente se guardó, pero ${fallidos} dependiente(s) no. Revisa la lista y reintenta.`);
          setSaving(false);
          return;
        }
      }

      router.push('/dashboard/clientes');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress size={32} sx={{ color: '#0d9488' }} />
      </Box>
    );
  }

  return (
    <Box component="section" sx={{ mx: 'auto', maxWidth: 768, p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Encabezado */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <IconButton
          onClick={() => router.push('/dashboard/clientes')}
          title="Volver a clientes"
          sx={{ ml: -1, borderRadius: '8px', color: '#6b7280', '&:hover': { bgcolor: '#f3f4f6' } }}
        >
          <ArrowLeft size={20} />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
            {isEdit ? 'Editar cliente' : 'Nuevo cliente'}
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Datos del cliente y sus dependientes
          </Typography>
        </Box>
      </Box>

      {error && (
        <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.875rem', borderRadius: '8px', p: 1.5 }}>
          {error}
        </Box>
      )}

      {/* ── Datos del cliente ─────────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
          Datos
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <Field label="Teléfono" field="telefono" placeholder="(809) 000-0000" form={form} setForm={setForm} />
          <Field label="Email" field="email" type="email" placeholder="facturacion@empresa.com" form={form} setForm={setForm} />
        </Box>
        <Field label="Dirección" field="direccion" placeholder="Calle, No., Ciudad" form={form} setForm={setForm} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
            Descripción
          </Typography>
          <TextField
            multiline
            minRows={3}
            size="small"
            fullWidth
            placeholder="Notas internas, sector, condiciones especiales…"
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            sx={{ ...inputSx, '& .MuiOutlinedInput-input': { resize: 'none' } }}
          />
        </Box>
      </Paper>

      {/* ── Dependientes ──────────────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
            Dependientes
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
            Personas asociadas al cliente. Puedes agregarlas desde ya.
          </Typography>
        </Box>

        {depError && (
          <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.875rem', borderRadius: '8px', p: 1.5 }}>
            {depError}
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { sm: 'flex-end' } }}>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Typography component="label" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
              Nombre
            </Typography>
            <TextField
              placeholder="Nombre"
              size="small"
              fullWidth
              value={depForm.nombre}
              onChange={(e) => setDepForm((f) => ({ ...f, nombre: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarDependiente(); }}
              sx={inputSx}
            />
          </Box>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Typography component="label" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
              Apellido
            </Typography>
            <TextField
              placeholder="Apellido"
              size="small"
              fullWidth
              value={depForm.apellido}
              onChange={(e) => setDepForm((f) => ({ ...f, apellido: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarDependiente(); }}
              sx={inputSx}
            />
          </Box>
          <Button
            size="small"
            variant="contained"
            disableElevation
            onClick={handleAgregarDependiente}
            disabled={savingDep}
            sx={{ flexShrink: 0, bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, textTransform: 'none', borderRadius: '8px' }}
          >
            {savingDep
              ? <CircularProgress size={16} sx={{ color: '#fff' }} />
              : <><Plus size={16} style={{ marginRight: 4 }} />Agregar</>}
          </Button>
        </Box>

        {dependientes.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, py: 4, textAlign: 'center', fontSize: '0.875rem', color: '#9ca3af' }}>
            <Users size={32} style={{ color: '#d1d5db' }} />
            <Typography sx={{ fontSize: '0.875rem', color: 'inherit' }}>Sin dependientes. Agrega el primero arriba.</Typography>
          </Box>
        ) : (
          <Box
            component="ul"
            sx={{
              listStyle: 'none', m: 0, p: 0,
              borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden',
              '& > li + li': { borderTop: '1px solid #f3f4f6' },
            }}
          >
            {dependientes.map((dep) => (
              <Box
                component="li"
                key={dep.id}
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, bgcolor: '#fff', fontSize: '0.875rem', '&:hover': { bgcolor: '#f9fafb' } }}
              >
                <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#1f2937' }}>
                  {dep.nombre} {dep.apellido}
                </Typography>
                <IconButton
                  onClick={() => handleEliminarDependiente(dep)}
                  disabled={deletingDepId === dep.id}
                  title="Eliminar dependiente"
                  sx={{ ml: 1, p: 0.5, borderRadius: '6px', color: '#9ca3af', '&:hover': { color: '#ef4444', bgcolor: '#fef2f2' }, '&.Mui-disabled': { opacity: 0.5 } }}
                >
                  {deletingDepId === dep.id
                    ? <CircularProgress size={16} sx={{ color: 'inherit' }} />
                    : <X size={16} />}
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {/* ── Acciones ──────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button
          variant="outlined"
          onClick={() => router.push('/dashboard/clientes')}
          disabled={saving}
          sx={{ textTransform: 'none', borderRadius: '8px' }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          disableElevation
          onClick={handleGuardar}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : undefined}
          sx={{ bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, textTransform: 'none', borderRadius: '8px' }}
        >
          {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear cliente')}
        </Button>
      </Box>
    </Box>
  );
}
