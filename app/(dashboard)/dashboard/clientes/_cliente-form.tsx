'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Plus, Loader2, X, ArrowLeft } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import { formatTelefonoDO } from '@/lib/utils/format';

interface Dependiente {
  id: number;   // > 0 persistido en DB; < 0 temporal (en memoria, modo crear)
  nombre: string;
  apellido: string;
}

const EMPTY_FORM = { razonSocial: '', rnc: '', email: '', telefono: '', direccion: '', descripcion: '' };
type ClienteForm = typeof EMPTY_FORM;

/**
 * Campo de texto. Definido FUERA del componente página: si se define adentro,
 * cada render crea una función nueva y React remonta el <Input>, tumbando el foco.
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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        inputMode={isTelefono ? 'tel' : undefined}
        value={form[field]}
        onChange={(e) => {
          const raw = e.target.value;
          const next = isTelefono ? formatTelefonoDO(raw) : raw;
          setForm((f) => ({ ...f, [field]: next }));
        }}
      />
    </div>
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
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-3xl p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard/clientes')}
          className="p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Volver a clientes"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h1>
          <p className="text-sm text-gray-500">Datos del cliente y sus dependientes</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
      )}

      {/* ── Datos del cliente ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Datos</h2>

        <div className="space-y-1.5">
          <Label>RNC / Cédula</Label>
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
        </div>

        <Field label="Nombre / Razón Social *" field="razonSocial" placeholder="Empresa XYZ SRL" form={form} setForm={setForm} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Teléfono" field="telefono" placeholder="(809) 000-0000" form={form} setForm={setForm} />
          <Field label="Email" field="email" type="email" placeholder="facturacion@empresa.com" form={form} setForm={setForm} />
        </div>
        <Field label="Dirección" field="direccion" placeholder="Calle, No., Ciudad" form={form} setForm={setForm} />

        <div className="space-y-1.5">
          <Label>Descripción</Label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[80px]"
            placeholder="Notas internas, sector, condiciones especiales…"
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          />
        </div>
      </div>

      {/* ── Dependientes ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Dependientes</h2>
          <p className="text-xs text-gray-500">Personas asociadas al cliente. Puedes agregarlas desde ya.</p>
        </div>

        {depError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{depError}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Nombre</Label>
            <Input
              placeholder="Nombre"
              value={depForm.nombre}
              onChange={(e) => setDepForm((f) => ({ ...f, nombre: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarDependiente(); }}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Apellido</Label>
            <Input
              placeholder="Apellido"
              value={depForm.apellido}
              onChange={(e) => setDepForm((f) => ({ ...f, apellido: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarDependiente(); }}
            />
          </div>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 shrink-0"
            onClick={handleAgregarDependiente}
            disabled={savingDep}
          >
            {savingDep ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Agregar</>}
          </Button>
        </div>

        {dependientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-gray-400">
            <Users className="h-8 w-8 text-gray-300" />
            <p>Sin dependientes. Agrega el primero arriba.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
            {dependientes.map((dep) => (
              <li key={dep.id} className="flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50 text-sm">
                <span className="font-medium text-gray-800">{dep.nombre} {dep.apellido}</span>
                <button
                  onClick={() => handleEliminarDependiente(dep)}
                  disabled={deletingDepId === dep.id}
                  className="ml-2 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                  title="Eliminar dependiente"
                >
                  {deletingDepId === dep.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <X className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Acciones ──────────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push('/dashboard/clientes')} disabled={saving}>
          Cancelar
        </Button>
        <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : (isEdit ? 'Guardar cambios' : 'Crear cliente')}
        </Button>
      </div>
    </section>
  );
}
