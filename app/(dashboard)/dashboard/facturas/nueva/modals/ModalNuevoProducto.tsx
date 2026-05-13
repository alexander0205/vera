'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Check, ChevronDown, ChevronUp, Loader2, PackagePlus } from 'lucide-react';
import type { Producto } from '../utils/types';

const TASA_ITBIS_MODAL = [
  { value: 'exento', label: 'Ninguno (0%)' },
  { value: '0.18',   label: 'ITBIS - (18.00%)' },
  { value: '0.16',   label: 'ITBIS 16% - (16.00%)' },
  { value: '0',      label: 'ITBIS 0% - (0.00%)' },
];

const UNIDADES = ['Unidad', 'Servicio', 'Hora', 'Día', 'Mes', 'Kg', 'Lb', 'Metro', 'Litro', 'Caja', 'Docena'];

const TIPOS_ITEM: { value: string; label: string; disabled?: boolean }[] = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'bien',     label: 'Producto' },
  { value: 'combo',    label: 'Combo', disabled: true },
];

export function ModalNuevoProducto({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (p: Producto) => void;
}) {
  const [form, setForm]                 = useState({ nombre: '', precio: '', tasaItbis: 'exento', tipo: 'servicio', descripcion: '', unidad: 'Unidad', cantidadInicial: '' });
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [showAvanzado, setShowAvanzado] = useState(false);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        nombre:      form.nombre,
        precio:      parseFloat(form.precio) || 0,
        tasaItbis:   form.tasaItbis,
        tipo:        form.tipo === 'bien' ? 'bien' : 'servicio',
        descripcion: form.descripcion,
        unidad:      form.unidad,
      };
      const res  = await fetch('/api/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated(data.producto);
      setForm({ nombre: '', precio: '', tasaItbis: 'exento', tipo: 'servicio', descripcion: '', unidad: 'Unidad', cantidadInicial: '' });
      setShowAvanzado(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { onClose(); setError(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-teal-600" />Nuevo producto/servicio
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

          <div>
            <div className="flex gap-2">
              {TIPOS_ITEM.map((t) => {
                const isSelected = form.tipo === t.value;
                if (t.disabled) {
                  return (
                    <div key={t.value} title="Próximamente"
                      className="relative flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium cursor-not-allowed opacity-40 bg-white border-gray-200 text-gray-400 select-none">
                      {t.label}
                    </div>
                  );
                }
                return (
                  <button key={t.value} type="button"
                    onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-teal-100 border-teal-300 text-teal-800'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Ten en cuenta que, una vez creado, no podrás cambiar el tipo del artículo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder={form.tipo === 'bien' ? 'Ej. Camisa talla M' : 'Ej. Diseño de logo'}
              value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Precio (DOP) <span className="text-red-500">*</span></Label>
              <Input type="number" min={0} step={0.01} placeholder="0.00"
                value={form.precio} onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Impuesto (ITBIS)</Label>
              <Select value={form.tasaItbis} onValueChange={(v) => setForm((f) => ({ ...f, tasaItbis: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASA_ITBIS_MODAL.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Unidad de medida</Label>
            <Select value={form.unidad} onValueChange={(v) => setForm((f) => ({ ...f, unidad: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {form.tipo === 'bien' && (
            <div className="space-y-1.5">
              <Label>Cantidad inicial en inventario</Label>
              <Input type="number" min={0} step={1} placeholder="0"
                value={form.cantidadInicial} onChange={(e) => setForm((f) => ({ ...f, cantidadInicial: e.target.value }))} />
            </div>
          )}

          <div>
            <button type="button"
              onClick={() => setShowAvanzado((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900 font-medium">
              {showAvanzado ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Mostrar formulario avanzado
            </button>
            {showAvanzado && (
              <div className="mt-3 space-y-3 border border-dashed border-gray-200 rounded-lg p-4">
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <Input placeholder="Descripción opcional que aparecerá en la factura"
                    value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setError(null); }} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear ítem'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
