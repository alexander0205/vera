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
import { Loader2 } from 'lucide-react';

export function ModalNuevaLista({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (l: { id: number; nombre: string; tipo: string; porcentaje: number }) => void;
}) {
  const [form, setForm]     = useState({ nombre: '', tipo: 'valor', porcentaje: '', descripcion: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/listas-precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:      form.nombre.trim(),
          tipo:        form.tipo,
          porcentaje:  form.tipo === 'porcentaje' ? parseFloat(form.porcentaje) * 100 || 0 : 0,
          descripcion: form.descripcion.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onCreated(data.lista);
      setForm({ nombre: '', tipo: 'valor', porcentaje: '', descripcion: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { onClose(); setError(null); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Nueva lista de precios</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div className="space-y-1.5">
            <Label className="text-sm">Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder="Ej. Lista mayorista" value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="valor">Valor fijo</SelectItem>
                <SelectItem value="porcentaje">Porcentaje de descuento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.tipo === 'porcentaje' && (
            <div className="space-y-1.5">
              <Label className="text-sm">Porcentaje (%)</Label>
              <Input type="number" min={0} max={100} step={0.01} placeholder="0.00"
                value={form.porcentaje} onChange={(e) => setForm(f => ({ ...f, porcentaje: e.target.value }))} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">Descripción</Label>
            <Input placeholder="Descripción opcional" value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); setError(null); }} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear lista'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
