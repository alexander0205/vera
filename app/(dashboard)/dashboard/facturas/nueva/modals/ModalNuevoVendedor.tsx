'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export function ModalNuevoVendedor({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (v: { id: number; nombre: string }) => void;
}) {
  const [form, setForm]     = useState({ nombre: '', identificacion: '', observacion: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/vendedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:         form.nombre.trim(),
          identificacion: form.identificacion.trim() || undefined,
          observacion:    form.observacion.trim()    || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onCreated(data.vendedor);
      setForm({ nombre: '', identificacion: '', observacion: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { onClose(); setError(null); } }}>
      <DialogContent className="max-w-md w-[calc(100%-1rem)] sm:w-full p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Nuevo vendedor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div className="space-y-1.5">
            <Label className="text-sm">Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder="Nombre del vendedor" value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Identificación</Label>
            <Input placeholder="Cédula u otro identificador" value={form.identificacion} onChange={(e) => setForm(f => ({ ...f, identificacion: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Observación</Label>
            <Input placeholder="Notas adicionales" value={form.observacion} onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); setError(null); }} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear vendedor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
