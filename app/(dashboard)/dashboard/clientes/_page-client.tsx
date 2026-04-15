'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Users, Plus, Pencil, Trash2, Search, Loader2, AlertTriangle, X,
} from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';

interface Cliente {
  id: number;
  razonSocial: string;
  rnc: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
}

const EMPTY_FORM = { razonSocial: '', rnc: '', email: '', telefono: '', direccion: '' };

export default function ClientesPage() {
  const [clientes, setClientes]         = useState<Cliente[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Cliente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);
  const searchTimer                     = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => { cargar(); }, [cargar]);

  function handleSearch(v: string) {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => cargar(v), 300);
  }

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpError(null);
    setShowForm(true);
  }

  function abrirEdicion(c: Cliente) {
    setEditTarget(c);
    setForm({
      razonSocial: c.razonSocial,
      rnc:       c.rnc       ?? '',
      email:     c.email     ?? '',
      telefono:  c.telefono  ?? '',
      direccion: c.direccion ?? '',
    });
    setOpError(null);
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

  function Field({ label, field, type = 'text', placeholder }: {
    label: string; field: keyof typeof EMPTY_FORM; type?: string; placeholder?: string;
  }) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Input
          type={type}
          placeholder={placeholder}
          value={form[field]}
          onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <section className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">Directorio de compradores y contactos</p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirNuevo}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo cliente
        </Button>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, RNC o email…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => { setSearch(''); cargar(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            {loading ? 'Cargando…' : `${clientes.length} cliente${clientes.length !== 1 ? 's' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-16">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">
                {search ? 'Sin resultados para esa búsqueda' : 'Sin clientes registrados'}
              </p>
              {!search && (
                <p className="text-sm text-gray-400 mt-1">
                  Crea tu primer cliente o aparecerán automáticamente al emitir facturas
                </p>
              )}
              {!search && (
                <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm" onClick={abrirNuevo}>
                  <Plus className="h-4 w-4 mr-1" />Nuevo cliente
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre / Razón Social</TableHead>
                  <TableHead>RNC / Cédula</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-gray-50">
                    <TableCell className="font-medium">{c.razonSocial}</TableCell>
                    <TableCell className="font-mono text-sm text-gray-600">{c.rnc ?? '—'}</TableCell>
                    <TableCell className="text-sm text-gray-600">{c.email ?? '—'}</TableCell>
                    <TableCell className="text-sm text-gray-600">{c.telefono ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicion(c)}>
                          <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setDeleteTarget(c); setOpError(null); }}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Modal: Crear / Editar ─────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={(o: boolean) => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}

            {/* RNC / Cédula con autocomplete */}
            <div className="space-y-1.5">
              <Label>RNC / Cédula</Label>
              <RncSearch
                placeholder="Buscar RNC, Cédula o razón social…"
                value={form.rnc
                  ? `${form.rnc}${form.razonSocial ? ` · ${form.razonSocial}` : ''}`
                  : undefined
                }
                onSelect={(r) => setForm((f) => ({
                  ...f,
                  rnc: r.rnc,
                  // Auto-fill razón social solo si está vacía
                  razonSocial: f.razonSocial.trim() ? f.razonSocial : r.nombre,
                }))}
                onClear={() => setForm((f) => ({ ...f, rnc: '' }))}
                showSyncHint={false}
              />
            </div>

            <Field label="Nombre / Razón Social *" field="razonSocial" placeholder="Empresa XYZ SRL" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono" field="telefono" placeholder="(809) 000-0000" />
              <Field label="Email" field="email" type="email" placeholder="facturacion@empresa.com" />
            </div>
            <Field label="Dirección" field="direccion" placeholder="Calle, No., Ciudad" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : (editTarget ? 'Guardar cambios' : 'Crear cliente')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar eliminación ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar cliente?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar a <strong>{deleteTarget?.razonSocial}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Las facturas emitidas a este cliente no se verán afectadas.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleEliminar} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Eliminando…</> : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
