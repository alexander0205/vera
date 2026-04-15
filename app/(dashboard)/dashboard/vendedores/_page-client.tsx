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
  UserCheck, Plus, Pencil, Trash2, Search, Loader2, AlertTriangle, X,
} from 'lucide-react';

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

  function abrirEdicion(v: Vendedor) {
    setEditTarget(v);
    setForm({ nombre: v.nombre, identificacion: v.identificacion ?? '', observacion: v.observacion ?? '' });
    setOpError(null);
    setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setOpError('El nombre es obligatorio'); return; }
    setSaving(true);
    setOpError(null);
    try {
      const url    = editTarget ? `/api/vendedores/${editTarget.id}` : '/api/vendedores';
      const method = editTarget ? 'PATCH' : 'POST';
      const body: Record<string, string> = { nombre: form.nombre.trim() };
      if (form.identificacion.trim()) body.identificacion = form.identificacion.trim();
      if (form.observacion.trim())    body.observacion    = form.observacion.trim();
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
      const res  = await fetch(`/api/vendedores/${deleteTarget.id}`, { method: 'DELETE' });
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

  return (
    <section className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-teal-600" />
            Vendedores
          </h1>
          <p className="text-sm text-gray-500 mt-1">Administra los vendedores y asígnalos a facturas</p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirNuevo}>
          <Plus className="h-4 w-4 mr-2" />Nuevo Vendedor
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Buscar por nombre o identificación…" value={search}
            onChange={(e) => handleSearch(e.target.value)} />
          {search && (
            <button onClick={() => { setSearch(''); cargar(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            {loading ? 'Cargando…' : `${vendedores.length} vendedor${vendedores.length !== 1 ? 'es' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
          ) : vendedores.length === 0 ? (
            <div className="text-center py-16">
              <UserCheck className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">
                {search ? 'Sin resultados para esa búsqueda' : 'No hay vendedores registrados'}
              </p>
              {!search && (
                <>
                  <p className="text-sm text-gray-400 mt-1">Agrega vendedores para asignarlos en tus facturas</p>
                  <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm" onClick={abrirNuevo}>
                    <Plus className="h-4 w-4 mr-1" />Nuevo Vendedor
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Identificación</TableHead>
                  <TableHead>Observación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendedores.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell><p className="font-medium text-gray-900">{v.nombre}</p></TableCell>
                    <TableCell className="font-mono text-sm text-gray-500">{v.identificacion ?? '—'}</TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[240px]">
                      {v.observacion ? <span className="truncate block">{v.observacion}</span> : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicion(v)}>
                          <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setDeleteTarget(v); setOpError(null); }}>
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

      <Dialog open={showForm} onOpenChange={(o: boolean) => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar vendedor' : 'Nuevo vendedor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {opError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>}
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre <span className="text-red-500">*</span></Label>
              <Input id="nombre" placeholder="Ej. Juan Pérez" value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="identificacion">Identificación</Label>
              <Input id="identificacion" placeholder="Cédula o RNC del vendedor" value={form.identificacion}
                onChange={(e) => setForm((f) => ({ ...f, identificacion: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observacion">Observación</Label>
              <textarea id="observacion" rows={3} placeholder="Notas internas opcionales sobre este vendedor"
                value={form.observacion} onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : editTarget ? 'Guardar cambios' : 'Crear vendedor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar vendedor?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>}
            <p className="text-sm text-gray-700">
              Vas a eliminar al vendedor <strong>{deleteTarget?.nombre}</strong>. Esta acción es reversible desde la base de datos.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Este vendedor dejará de estar disponible en el selector de facturas.</span>
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
