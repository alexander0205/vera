'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export interface EstudianteEditable {
  id: number;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string | null;
  estado: string;
}

const ESTADOS = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'retirado', label: 'Retirado' },
  { value: 'graduado', label: 'Graduado' },
];

interface Props {
  estudiante: EstudianteEditable | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditarEstudianteDialog({ estudiante, open, onClose, onSaved }: Props) {
  const [form, setForm]     = useState({ codigo: '', nombres: '', apellidos: '', fechaNacimiento: '', estado: 'activo' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (open && estudiante) {
      setForm({
        codigo: estudiante.codigo ?? '',
        nombres: estudiante.nombres,
        apellidos: estudiante.apellidos,
        fechaNacimiento: estudiante.fechaNacimiento ?? '',
        estado: estudiante.estado,
      });
      setError(null);
    }
  }, [open, estudiante]);

  async function handleGuardar() {
    if (!estudiante) return;
    if (!form.nombres.trim() || !form.apellidos.trim()) {
      setError('Nombres y apellidos son obligatorios'); return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/administracion-escolar/estudiantes/${estudiante.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: form.codigo || null,
          nombres: form.nombres,
          apellidos: form.apellidos,
          fechaNacimiento: form.fechaNacimiento || null,
          estado: form.estado,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar estudiante</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombres *</Label>
              <Input autoFocus value={form.nombres}
                onChange={(e) => setForm((f) => ({ ...f, nombres: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Apellidos *</Label>
              <Input value={form.apellidos}
                onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input value={form.codigo}
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha nacimiento</Label>
              <Input type="date" value={form.fechaNacimiento}
                onChange={(e) => setForm((f) => ({ ...f, fechaNacimiento: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => setForm((f) => ({ ...f, estado: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGuardar} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
