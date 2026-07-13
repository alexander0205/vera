'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Producto { id: number; nombre: string; stockActual: number; }
interface Almacen  { id: number; nombre: string; }

interface ItemForm {
  productoId:    number | null;
  cantidad:      string;
  costoUnitario: string;
  almacenId:     number | null;
}

export interface CompraPreFill {
  proveedorRnc?:   string;
  proveedorNombre?: string;
  referenciaEncf?: string;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
  prefill?:  CompraPreFill;
}

const ITEM_VACIO: ItemForm = { productoId: null, cantidad: '1', costoUnitario: '0', almacenId: null };

export default function ModalRegistrarCompra({ open, onClose, onSuccess, prefill }: Props) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [saving,    setSaving]    = useState(false);

  const [proveedorRnc,    setProveedorRnc]    = useState('');
  const [proveedorNombre, setProveedorNombre] = useState('');
  const [fecha,           setFecha]           = useState(new Date().toISOString().slice(0, 10));
  const [notas,           setNotas]           = useState('');
  const [almacenId,       setAlmacenId]       = useState<number | null>(null);
  const [items,           setItems]           = useState<ItemForm[]>([{ ...ITEM_VACIO }]);

  // Pre-rellenar desde e-CF recibido
  useEffect(() => {
    if (open && prefill) {
      setProveedorRnc(prefill.proveedorRnc ?? '');
      setProveedorNombre(prefill.proveedorNombre ?? '');
    }
    if (!open) {
      setProveedorRnc(''); setProveedorNombre(''); setFecha(new Date().toISOString().slice(0, 10));
      setNotas(''); setAlmacenId(null); setItems([{ ...ITEM_VACIO }]);
    }
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/productos').then(r => r.json()).then(d =>
      setProductos((d.productos ?? []).filter((p: { tipo: string }) => p.tipo === 'bien'))
    ).catch(() => {});
    fetch('/api/almacenes').then(r => r.json()).then(d =>
      setAlmacenes(d.almacenes ?? [])
    ).catch(() => {});
  }, [open]);

  function setItem(idx: number, patch: Partial<ItemForm>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  async function handleSubmit() {
    const validItems = items.filter(i => i.productoId && parseInt(i.cantidad) > 0);
    if (validItems.length === 0) {
      toast.error('Agrega al menos un producto con cantidad válida.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/compras/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedorRnc:    proveedorRnc    || null,
          proveedorNombre: proveedorNombre || null,
          fecha,
          referenciaEncf:  prefill?.referenciaEncf ?? null,
          notas:           notas || null,
          almacenId,
          items: validItems.map(i => ({
            productoId:    i.productoId!,
            cantidad:      parseInt(i.cantidad),
            costoUnitario: parseFloat(i.costoUnitario) || 0,
            almacenId:     i.almacenId,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Error al registrar compra'); return; }

      toast.success('Compra registrada. Stock actualizado.');
      onSuccess();
      onClose();
    } catch {
      toast.error('Error de red.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar entrada de inventario</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Proveedor */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>RNC / Cédula proveedor</Label>
              <Input value={proveedorRnc} onChange={e => setProveedorRnc(e.target.value)} placeholder="101234567" />
            </div>
            <div className="space-y-1">
              <Label>Nombre proveedor</Label>
              <Input value={proveedorNombre} onChange={e => setProveedorNombre(e.target.value)} placeholder="Distribuidora XYZ" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Almacén destino</Label>
              <Select value={almacenId?.toString() ?? '__none'}
                onValueChange={v => setAlmacenId(v === '__none' ? null : parseInt(v))}>
                <SelectTrigger><SelectValue placeholder="Sin almacén" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin almacén</SelectItem>
                  {almacenes.map(a => (
                    <SelectItem key={a.id} value={a.id.toString()}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {prefill?.referenciaEncf && (
            <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-700">
              Vinculado a e-NCF: <span className="font-mono font-semibold">{prefill.referenciaEncf}</span>
            </div>
          )}

          {/* Ítems */}
          <div className="space-y-2">
            <Label>Productos recibidos</Label>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_90px_36px] gap-2 items-center">
                <Select value={item.productoId?.toString() ?? '__none'}
                  onValueChange={v => setItem(idx, { productoId: v === '__none' ? null : parseInt(v) })}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Selecciona producto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Producto —</SelectItem>
                    {productos.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number" min="1" placeholder="Cant."
                  value={item.cantidad}
                  onChange={e => setItem(idx, { cantidad: e.target.value })}
                  className="text-sm"
                />
                <Input
                  type="number" min="0" step="0.01" placeholder="Costo"
                  value={item.costoUnitario}
                  onChange={e => setItem(idx, { costoUnitario: e.target.value })}
                  className="text-sm"
                />
                <Button
                  variant="ghost" size="icon"
                  onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="text-xs text-gray-400 grid grid-cols-[1fr_80px_90px_36px] gap-2 px-1">
              <span>Producto</span><span>Cantidad</span><span>Costo unit. DOP</span>
            </div>
            <Button variant="outline" size="sm" className="w-full mt-1"
              onClick={() => setItems(prev => [...prev, { ...ITEM_VACIO }])}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Agregar producto
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Notas internas</Label>
            <Textarea value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Número de orden, observaciones…" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
