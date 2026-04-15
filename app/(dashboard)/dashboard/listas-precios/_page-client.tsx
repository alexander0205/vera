'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Tag, Plus, Pencil, Trash2, Eye, Loader2,
} from 'lucide-react';

interface ListaPrecio {
  id: number;
  teamId: string;
  nombre: string;
  tipo: 'valor' | 'porcentaje';
  porcentaje: number;
  esDescuento: string;
  descripcion: string | null;
  esDefault: string;
  createdAt: string;
}

interface ItemLista {
  id: number;
  productoId: number;
  precio: number;
  nombre: string;
  precioBase: number;
}

function formatDOP(centavos: number) {
  return `RD$ ${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

function formatPorcentaje(lista: ListaPrecio) {
  if (lista.tipo !== 'porcentaje') return 'Precios fijos';
  const pct = lista.porcentaje / 100;
  const sign = lista.esDescuento === 'true' ? '-' : '+';
  return `${sign}${pct.toFixed(2)}%`;
}

const EMPTY_FORM = {
  nombre: '',
  tipo: 'valor' as 'valor' | 'porcentaje',
  porcentaje: '',
  esDescuento: false,
  descripcion: '',
  esDefault: false,
};

export default function ListasPreciosPage() {
  const [listas, setListas]               = useState<ListaPrecio[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [editTarget, setEditTarget]       = useState<ListaPrecio | null>(null);
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [saving, setSaving]               = useState(false);
  const [formError, setFormError]         = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<ListaPrecio | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [deleteError, setDeleteError]     = useState<string | null>(null);
  const [itemsTarget, setItemsTarget]     = useState<ListaPrecio | null>(null);
  const [items, setItems]                 = useState<ItemLista[]>([]);
  const [loadingItems, setLoadingItems]   = useState(false);
  const [itemsError, setItemsError]       = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/listas-precios');
      const data = await res.json();
      setListas(data.listasPrecios ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function abrirEdicion(lista: ListaPrecio) {
    setEditTarget(lista);
    setForm({
      nombre:      lista.nombre,
      tipo:        lista.tipo,
      porcentaje:  lista.tipo === 'porcentaje' ? (lista.porcentaje / 100).toString() : '',
      esDescuento: lista.esDescuento === 'true',
      descripcion: lista.descripcion ?? '',
      esDefault:   lista.esDefault === 'true',
    });
    setFormError(null);
    setShowForm(true);
  }

  async function abrirItems(lista: ListaPrecio) {
    setItemsTarget(lista);
    setItems([]);
    setItemsError(null);
    if (lista.tipo === 'porcentaje') return;
    setLoadingItems(true);
    try {
      const res  = await fetch(`/api/listas-precios/${lista.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando items');
      setItems(data.items ?? []);
    } catch (e: unknown) {
      setItemsError(e instanceof Error ? e.message : 'Error cargando items');
    } finally {
      setLoadingItems(false);
    }
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio'); return; }
    let porcentajeInt: number | undefined;
    if (form.tipo === 'porcentaje') {
      const parsed = parseFloat(form.porcentaje);
      if (isNaN(parsed) || parsed < 0) { setFormError('El porcentaje debe ser un número positivo'); return; }
      porcentajeInt = Math.round(parsed * 100);
    }
    setSaving(true);
    setFormError(null);
    try {
      const url    = editTarget ? `/api/listas-precios/${editTarget.id}` : '/api/listas-precios';
      const method = editTarget ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = {
        nombre: form.nombre.trim(), tipo: form.tipo,
        esDescuento: form.esDescuento, esDefault: form.esDefault,
      };
      if (form.descripcion.trim()) body.descripcion = form.descripcion.trim();
      if (form.tipo === 'porcentaje') body.porcentaje = porcentajeInt;
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      setShowForm(false);
      cargar();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res  = await fetch(`/api/listas-precios/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error eliminando');
      setDeleteTarget(null);
      cargar();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : 'Error eliminando');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="h-6 w-6 text-teal-600" />
            Listas de precios
          </h1>
          <p className="text-sm text-gray-500 mt-1">Configura precios especiales o descuentos para diferentes clientes o grupos</p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirNuevo}>
          <Plus className="h-4 w-4 mr-2" />Nueva lista
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            {loading ? 'Cargando…' : `${listas.length} lista${listas.length !== 1 ? 's' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
          ) : listas.length === 0 ? (
            <div className="text-center py-16">
              <Tag className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Sin listas de precios registradas</p>
              <p className="text-sm text-gray-400 mt-1">Crea listas para aplicar descuentos o recargos a grupos de clientes</p>
              <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm" onClick={abrirNuevo}>
                <Plus className="h-4 w-4 mr-1" />Nueva lista
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ajuste</TableHead>
                  <TableHead>Por defecto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listas.map((lista) => (
                  <TableRow key={lista.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">{lista.nombre}</p>
                        {lista.descripcion && <p className="text-xs text-gray-400 truncate max-w-[220px]">{lista.descripcion}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lista.tipo === 'valor'
                        ? <Badge className="bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-100">Fijo</Badge>
                        : <Badge className="bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100">% Porcentaje</Badge>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${lista.tipo === 'porcentaje' ? lista.esDescuento === 'true' ? 'text-red-600' : 'text-green-600' : 'text-gray-500'}`}>
                        {formatPorcentaje(lista)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {lista.esDefault === 'true' && (
                        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">Por defecto</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" title="Ver items" onClick={() => abrirItems(lista)}>
                          <Eye className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Editar" onClick={() => abrirEdicion(lista)}>
                          <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Eliminar" onClick={() => { setDeleteTarget(lista); setDeleteError(null); }}>
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

      <Dialog open={showForm} onOpenChange={(o) => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar lista de precios' : 'Nueva lista de precios'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {formError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{formError}</div>}
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-red-500">*</span></Label>
              <Input placeholder="Ej. Clientes VIP, Mayoristas…" value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de lista</Label>
              <Select value={form.tipo} onValueChange={(v: 'valor' | 'porcentaje') => setForm((f) => ({ ...f, tipo: v, porcentaje: '', esDescuento: false }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="valor">Precio fijo por producto</SelectItem>
                  <SelectItem value="porcentaje">Porcentaje sobre precio base</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tipo === 'porcentaje' && (
              <>
                <div className="space-y-1.5">
                  <Label>Porcentaje <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input type="number" min={0} step={0.01} placeholder="Ej: 10 para 10%" value={form.porcentaje}
                      onChange={(e) => setForm((f) => ({ ...f, porcentaje: e.target.value }))} className="pr-8" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de ajuste</Label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm((f) => ({ ...f, esDescuento: true }))}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${form.esDescuento ? 'bg-red-50 border-red-300 text-red-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                      Descuento (reduce el precio)
                    </button>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, esDescuento: false }))}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${!form.esDescuento ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                      Recargo (aumenta el precio)
                    </button>
                  </div>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Descripción <span className="text-xs text-gray-400">(opcional)</span></Label>
              <Textarea placeholder="Notas internas sobre esta lista…" rows={3} value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={form.esDefault}
                onChange={(e) => setForm((f) => ({ ...f, esDefault: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 accent-teal-600" />
              <span className="text-sm text-gray-700">Establecer como lista por defecto</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : editTarget ? 'Guardar cambios' : 'Crear lista'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!itemsTarget} onOpenChange={(o) => { if (!o) setItemsTarget(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{itemsTarget?.nombre} — Items de precio</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {itemsTarget?.tipo === 'porcentaje' ? (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 text-sm text-teal-800">
                <p>Esta lista aplica un <strong>{itemsTarget.porcentaje / 100}% de {itemsTarget.esDescuento === 'true' ? 'descuento' : 'recargo'}</strong> sobre el precio base de cada producto.</p>
              </div>
            ) : loadingItems ? (
              <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>
            ) : itemsError ? (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{itemsError}</div>
            ) : items.length === 0 ? (
              <div className="text-center py-10">
                <Tag className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Esta lista aún no tiene precios individuales configurados.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Precio base</TableHead>
                    <TableHead className="text-right">Precio lista</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.nombre}</TableCell>
                      <TableCell className="text-right text-gray-500">{formatDOP(item.precioBase)}</TableCell>
                      <TableCell className="text-right font-semibold text-teal-700">{formatDOP(item.precio)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemsTarget(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar lista?</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            {deleteError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{deleteError}</div>}
            <p className="text-sm text-gray-700">Vas a eliminar la lista <strong>{deleteTarget?.nombre}</strong>. Esta acción no se puede deshacer.</p>
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
