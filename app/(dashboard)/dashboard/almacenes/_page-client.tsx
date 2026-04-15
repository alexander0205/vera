'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Warehouse, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

interface Almacen {
  id: number;
  teamId: number;
  nombre: string;
  direccion: string | null;
  observacion: string | null;
  esDefault: string;
  createdAt: string;
}

const EMPTY_FORM = {
  nombre: '',
  direccion: '',
  observacion: '',
  esDefault: false,
};

export default function AlmacenesPage() {
  const [almacenes, setAlmacenes]       = useState<Almacen[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Almacen | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Almacen | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/almacenes');
      const data = await res.json();
      setAlmacenes(data.almacenes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpError(null);
    setShowForm(true);
  }

  function abrirEdicion(a: Almacen) {
    setEditTarget(a);
    setForm({
      nombre:      a.nombre,
      direccion:   a.direccion ?? '',
      observacion: a.observacion ?? '',
      esDefault:   a.esDefault === 'true',
    });
    setOpError(null);
    setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) {
      setOpError('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    setOpError(null);
    try {
      const url    = editTarget ? `/api/almacenes/${editTarget.id}` : '/api/almacenes';
      const method = editTarget ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = {
        nombre:      form.nombre.trim(),
        direccion:   form.direccion.trim() || null,
        observacion: form.observacion.trim() || null,
        esDefault:   form.esDefault,
      };
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false);
      cargar();
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
      const res  = await fetch(`/api/almacenes/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar();
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
            <Warehouse className="h-6 w-6 text-teal-600" />
            Almacenes
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona los almacenes donde guardas tu inventario</p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirNuevo}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Almacén
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Warehouse className="h-4 w-4" />
            {loading ? 'Cargando…' : `${almacenes.length} almacén${almacenes.length !== 1 ? 'es' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : almacenes.length === 0 ? (
            <div className="text-center py-16">
              <Warehouse className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Sin almacenes registrados</p>
              <p className="text-sm text-gray-400 mt-1">Crea tu primer almacén para organizar tu inventario</p>
              <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm" onClick={abrirNuevo}>
                <Plus className="h-4 w-4 mr-1" />Nuevo Almacén
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Por defecto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {almacenes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <p className="font-medium text-gray-900">{a.nombre}</p>
                      {a.observacion && (
                        <p className="text-xs text-gray-400 truncate max-w-[220px]">{a.observacion}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {a.direccion ?? <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell>
                      {a.esDefault === 'true' ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">Por defecto</Badge>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicion(a)}>
                          <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setDeleteTarget(a); setOpError(null); }}>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar almacén' : 'Nuevo almacén'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-red-500">*</span></Label>
              <Input placeholder="Ej: Almacén Principal" value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input placeholder="Ej: Calle Principal #1, Santiago" value={form.direccion}
                onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Observación</Label>
              <Textarea placeholder="Notas internas sobre este almacén…" value={form.observacion}
                onChange={(e) => setForm((f) => ({ ...f, observacion: e.target.value }))}
                rows={3} className="resize-none" />
            </div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div role="checkbox" aria-checked={form.esDefault} tabIndex={0}
                onClick={() => setForm((f) => ({ ...f, esDefault: !f.esDefault }))}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setForm((f) => ({ ...f, esDefault: !f.esDefault })); } }}
                className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 ${form.esDefault ? 'bg-teal-600 border-teal-600' : 'bg-white border-gray-300 hover:border-gray-400'}`}
              >
                {form.esDefault && (
                  <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-gray-700">Establecer como almacén por defecto</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : editTarget ? 'Guardar cambios' : 'Crear almacén'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar almacén?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.
            </p>
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
