'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ListTree, Plus, Pencil, Trash2, Loader2, AlertTriangle, X,
} from 'lucide-react';

type AplicaA = 'bien' | 'servicio' | 'ambos' | 'manual';
type Entidad = 'producto' | 'factura';

interface MaestroValor {
  id: number;
  maestroId: number;
  valor: string;
  orden: number;
}

interface Maestro {
  id: number;
  nombre: string;
  descripcion: string | null;
  aplicaA: AplicaA;
  multiple: boolean;
  targets: Entidad[];
  valores: MaestroValor[];
  createdAt: string;
}

const APLICA_LABEL: Record<AplicaA, string> = {
  bien:     'Todos los bienes',
  servicio: 'Todos los servicios',
  ambos:    'Bienes y servicios',
  manual:   'Manual (por producto)',
};

const TARGET_LABEL: Record<Entidad, string> = {
  producto: 'Productos',
  factura:  'Facturas',
};

const EMPTY_FORM = {
  nombre: '', descripcion: '', aplicaA: 'manual' as AplicaA, multiple: false,
  targets: ['producto'] as Entidad[],
};

export default function MaestrosPage() {
  const [maestros, setMaestros]         = useState<Maestro[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState<Maestro | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Maestro | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [opError, setOpError]           = useState<string | null>(null);

  // Gestión de valores dentro del modal de edición
  const [nuevoValor, setNuevoValor]     = useState('');
  const [valorBusy, setValorBusy]       = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/maestros');
      const data = await res.json();
      setMaestros(data.maestros ?? []);
      return data.maestros as Maestro[] ?? [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setNuevoValor('');
    setOpError(null);
    setShowForm(true);
  }

  function abrirEdicion(m: Maestro) {
    setEditTarget(m);
    setForm({
      nombre: m.nombre, descripcion: m.descripcion ?? '', aplicaA: m.aplicaA, multiple: m.multiple,
      targets: m.targets?.length ? m.targets : ['producto'],
    });
    setNuevoValor('');
    setOpError(null);
    setShowForm(true);
  }

  function toggleTarget(t: Entidad) {
    setForm((f) => {
      const has = f.targets.includes(t);
      const next = has ? f.targets.filter(x => x !== t) : [...f.targets, t];
      return { ...f, targets: next };
    });
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setOpError('El nombre es obligatorio'); return; }
    if (form.targets.length === 0) { setOpError('Selecciona al menos dónde aplica (Productos o Facturas)'); return; }
    setSaving(true);
    setOpError(null);
    try {
      const url    = editTarget ? `/api/maestros/${editTarget.id}` : '/api/maestros';
      const method = editTarget ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      const lista = await cargar();
      if (editTarget) {
        // Mantener modal abierto para seguir gestionando valores
        const actualizado = lista.find(x => x.id === editTarget.id) ?? null;
        setEditTarget(actualizado);
      } else {
        setShowForm(false);
      }
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
      const res  = await fetch(`/api/maestros/${deleteTarget.id}`, { method: 'DELETE' });
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

  async function agregarValor() {
    if (!editTarget || !nuevoValor.trim()) return;
    setValorBusy(true);
    setOpError(null);
    try {
      const res = await fetch(`/api/maestros/${editTarget.id}/valores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: nuevoValor.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error agregando valor');
      setNuevoValor('');
      const lista = await cargar();
      setEditTarget(lista.find(x => x.id === editTarget.id) ?? null);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error agregando valor');
    } finally {
      setValorBusy(false);
    }
  }

  async function eliminarValor(v: MaestroValor) {
    if (!editTarget) return;
    setValorBusy(true);
    setOpError(null);
    try {
      const res = await fetch(`/api/maestros/${editTarget.id}/valores/${v.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando valor');
      const lista = await cargar();
      setEditTarget(lista.find(x => x.id === editTarget.id) ?? null);
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error eliminando valor');
    } finally {
      setValorBusy(false);
    }
  }

  return (
    <section className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maestros</h1>
          <p className="text-sm text-gray-500 mt-1">
            Listas de atributos (marca, color…) que se aplican a tus productos y servicios
          </p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirNuevo}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo maestro
        </Button>
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListTree className="h-4 w-4" />
            {loading ? 'Cargando…' : `${maestros.length} maestro${maestros.length !== 1 ? 's' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : maestros.length === 0 ? (
            <div className="text-center py-16">
              <ListTree className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Sin maestros registrados</p>
              <p className="text-sm text-gray-400 mt-1">
                Crea un maestro (ej. Marca, Color) y agrégale valores
              </p>
              <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm" onClick={abrirNuevo}>
                <Plus className="h-4 w-4 mr-1" />Nuevo maestro
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Aplica a</TableHead>
                  <TableHead>Selección</TableHead>
                  <TableHead>Valores</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maestros.map((m) => (
                  <TableRow key={m.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => abrirEdicion(m)}>
                    <TableCell className="font-medium text-gray-900">{m.nombre}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {(m.targets ?? []).map((t) => (
                          <Badge key={t} variant="outline">{TARGET_LABEL[t]}</Badge>
                        ))}
                        {m.targets?.includes('producto') && (
                          <span className="text-[11px] text-gray-400">· {APLICA_LABEL[m.aplicaA]}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.multiple ? 'secondary' : 'outline'}>
                        {m.multiple ? 'Múltiple' : 'Único'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{m.valores.length}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicion(m)}>
                          <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setDeleteTarget(m); setOpError(null); }}>
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

      {/* Modal: Crear / Editar */}
      <Dialog open={showForm} onOpenChange={(o: boolean) => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar maestro' : 'Nuevo maestro'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input
                placeholder="Ej: Marca"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea
                placeholder="Descripción opcional…"
                rows={2}
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              />
            </div>
            {/* Dónde aplica el maestro */}
            <div className="space-y-1.5">
              <Label>Aplica a</Label>
              <div className="flex gap-2">
                {(['producto', 'factura'] as Entidad[]).map((t) => (
                  <label key={t} className="flex items-center gap-2 h-10 px-3 border rounded-md cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-teal-600"
                      checked={form.targets.includes(t)}
                      onChange={() => toggleTarget(t)}
                    />
                    <span className="text-sm text-gray-700">{TARGET_LABEL[t]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* aplicaA solo aplica del lado producto */}
              <div className="space-y-1.5">
                <Label className={form.targets.includes('producto') ? '' : 'text-gray-300'}>
                  En productos, mostrar en
                </Label>
                <Select
                  value={form.aplicaA}
                  onValueChange={(v) => setForm((f) => ({ ...f, aplicaA: v as AplicaA }))}
                  disabled={!form.targets.includes('producto')}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual (por producto)</SelectItem>
                    <SelectItem value="bien">Todos los bienes</SelectItem>
                    <SelectItem value="servicio">Todos los servicios</SelectItem>
                    <SelectItem value="ambos">Bienes y servicios</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Selección</Label>
                <label className="flex items-center gap-2 h-10 px-3 border rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-teal-600"
                    checked={form.multiple}
                    onChange={(e) => setForm((f) => ({ ...f, multiple: e.target.checked }))}
                  />
                  <span className="text-sm text-gray-700">Permite varios valores</span>
                </label>
              </div>
            </div>

            {/* Gestión de valores — solo en edición (el maestro ya existe) */}
            {editTarget ? (
              <div className="space-y-2 pt-2 border-t">
                <Label>Valores del dropdown</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: Toyota"
                    value={nuevoValor}
                    onChange={(e) => setNuevoValor(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarValor(); } }}
                  />
                  <Button type="button" variant="outline" onClick={agregarValor} disabled={valorBusy || !nuevoValor.trim()}>
                    {valorBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
                {editTarget.valores.length === 0 ? (
                  <p className="text-xs text-gray-400">Aún no hay valores. Agrega al menos uno.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {editTarget.valores.map((v) => (
                      <span key={v.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-sm rounded-full pl-3 pr-1.5 py-1">
                        {v.valor}
                        <button
                          type="button"
                          className="hover:bg-gray-300 rounded-full p-0.5"
                          onClick={() => eliminarValor(v)}
                          disabled={valorBusy}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 pt-1">
                Podrás agregar los valores del dropdown después de crear el maestro.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              {editTarget ? 'Cerrar' : 'Cancelar'}
            </Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
              {saving
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
                : (editTarget ? 'Guardar cambios' : 'Crear maestro')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar eliminación */}
      <Dialog open={!!deleteTarget} onOpenChange={(o: boolean) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar maestro?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}
            <p className="text-sm text-gray-700">
              Vas a eliminar el maestro <strong>{deleteTarget?.nombre}</strong>, sus valores y las
              asignaciones a productos. Esta acción no se puede deshacer.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Los productos no se eliminan, solo pierden este atributo.</span>
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
