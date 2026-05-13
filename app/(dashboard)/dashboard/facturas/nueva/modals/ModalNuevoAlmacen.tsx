'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export function ModalNuevoAlmacen({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (a: { id: number; nombre: string }) => void;
}) {
  const [form, setForm]     = useState({ nombre: '', direccion: '', observacion: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/almacenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: form.nombre.trim(), direccion: form.direccion.trim() || undefined, observacion: form.observacion.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onCreated(data.almacen);
      setForm({ nombre: '', direccion: '', observacion: '' });
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
          <DialogTitle className="text-base font-semibold">Nuevo almacén</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div className="space-y-1.5">
            <Label className="text-sm">Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder="Ej. Almacén Principal" value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Dirección</Label>
            <Input placeholder="Dirección del almacén" value={form.direccion} onChange={(e) => setForm(f => ({ ...f, direccion: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Observación</Label>
            <Input placeholder="Notas adicionales" value={form.observacion} onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); setError(null); }} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear almacén'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
