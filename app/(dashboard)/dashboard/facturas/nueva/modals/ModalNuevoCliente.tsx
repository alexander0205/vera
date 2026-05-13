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
import { Loader2, UserPlus, X } from 'lucide-react';
import { RncSearch } from '@/components/RncSearch';
import type { Cliente } from '../utils/types';

const TIPOS_IDENTIFICACION = [
  { value: 'rnc', label: 'RNC' },
  { value: 'cedula', label: 'Cédula' },
  { value: 'pasaporte', label: 'Pasaporte' },
];

export function ModalNuevoCliente({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (c: Cliente) => void;
}) {
  const [form, setForm]         = useState({ razonSocial: '', rnc: '', email: '', telefono: '', tipoId: 'rnc' });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [tipoContacto, setTipo] = useState<'cliente' | 'proveedor'>('cliente');

  async function handleSave() {
    if (!form.razonSocial.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        razonSocial: form.razonSocial.trim(),
        rnc:      form.rnc.trim()      || null,
        email:    form.email.trim()    || null,
        telefono: form.telefono.trim() || null,
        tipoId:   form.tipoId,
      };
      const res  = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data?.detalles?.fieldErrors as Record<string, string[]> | undefined;
        if (fieldErrors) {
          const msgs = Object.entries(fieldErrors)
            .filter(([, errs]) => errs?.length)
            .map(([field, errs]) => {
              const label: Record<string, string> = {
                razonSocial: 'Nombre', rnc: 'RNC/Cédula',
                email: 'Correo electrónico', telefono: 'Teléfono', direccion: 'Dirección',
              };
              return `${label[field] ?? field}: ${errs[0]}`;
            });
          if (msgs.length) { setError(msgs.join(' · ')); return; }
        }
        throw new Error(data.error ?? 'Error al guardar');
      }
      onCreated(data.cliente);
      setForm({ razonSocial: '', rnc: '', email: '', telefono: '', tipoId: 'rnc' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-teal-600" />Nuevo contacto
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
          {(['cliente', 'proveedor'] as const).map((t) => (
            <button key={t} type="button"
              onClick={() => setTipo(t)}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                tipoContacto === t
                  ? 'bg-teal-100 text-teal-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tipoContacto === t && <span className="h-4 w-4 rounded-full border-2 border-teal-600 flex items-center justify-center"><span className="h-2 w-2 bg-teal-600 rounded-full" /></span>}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-3 py-1">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

          <div className="space-y-1.5">
            <Label className="text-sm">Tipo de identificación</Label>
            <Select value={form.tipoId} onValueChange={(v) => setForm((f) => ({ ...f, tipoId: v }))}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {TIPOS_IDENTIFICACION.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">RNC / Cédula</Label>
            <RncSearch
              placeholder="Buscar RNC, Cédula o razón social…"
              value={form.rnc ? `${form.rnc}${form.razonSocial ? ` · ${form.razonSocial}` : ''}` : undefined}
              onSelect={(r) => setForm((f) => ({
                ...f,
                rnc: r.rnc,
                razonSocial: r.nombre,
                tipoId: r.tipo === 'cedula' ? 'cedula' : 'rnc',
              }))}
              onClear={() => setForm((f) => ({ ...f, rnc: '', razonSocial: '' }))}
              showSyncHint
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Nombre o Razón social <span className="text-red-500">*</span></Label>
            <Input placeholder="Empresa XYZ SRL" value={form.razonSocial} onChange={(e) => setForm((f) => ({ ...f, razonSocial: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Correo electrónico</Label>
              <Input type="email" placeholder="Ejemplo@email.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Teléfono</Label>
              <Input placeholder="___-___-____" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex items-center gap-1">
            <X className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Ir a formulario avanzado
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear contacto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
