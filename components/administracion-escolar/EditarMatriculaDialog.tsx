'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, X } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';

interface Periodo { id: number; nombre: string; activo: boolean }
interface Curso { id: number; nombre: string }

export interface MatriculaEditable {
  id: number;
  periodoId: number;
  cursoId: number;
  fechaInscripcion: string | null;
  estado: string;
  codigoMatricula: string | null;
  notas: string | null;
}

const ESTADOS = [
  { value: 'activa', label: 'Activa' },
  { value: 'finalizada', label: 'Finalizada' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'anulada', label: 'Anulada' },
];

interface Props {
  matricula: MatriculaEditable | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Si se pasa (y `matricula` es null) el diálogo crea una matrícula nueva
   *  (reinscripción) para ese estudiante en vez de editar una existente. */
  crearParaEstudianteId?: number | null;
}

export function EditarMatriculaDialog({ matricula, open, onClose, onSaved, crearParaEstudianteId = null }: Props) {
  const esCrear = !matricula && crearParaEstudianteId != null;
  const { permissions } = usePermissions();
  const puedeConfigurar = permissions.includes('administracion-escolar:configurar');

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cursos, setCursos]     = useState<Curso[]>([]);
  const [form, setForm] = useState({ periodoId: '', cursoId: '', fechaInscripcion: '', estado: 'activa', codigoMatricula: '', notas: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const [nuevoPeriodo, setNuevoPeriodo] = useState<string | null>(null);
  const [nuevoCurso, setNuevoCurso]     = useState<string | null>(null);
  const [guardandoCat, setGuardandoCat] = useState(false);

  const cargarCat = useCallback(async () => {
    const [p, c] = await Promise.all([
      fetch('/api/administracion-escolar/periodos').then((r) => r.json()),
      fetch('/api/administracion-escolar/cursos').then((r) => r.json()),
    ]);
    setPeriodos(p.periodos ?? []);
    setCursos(c.cursos ?? []);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (matricula) {
      setForm({
        periodoId: String(matricula.periodoId),
        cursoId: String(matricula.cursoId),
        fechaInscripcion: matricula.fechaInscripcion ?? '',
        estado: matricula.estado,
        codigoMatricula: matricula.codigoMatricula ?? '',
        notas: matricula.notas ?? '',
      });
    } else if (crearParaEstudianteId != null) {
      setForm({
        periodoId: '', cursoId: '',
        fechaInscripcion: new Date().toISOString().slice(0, 10),
        estado: 'activa', codigoMatricula: '', notas: '',
      });
    }
    setError(null);
    setNuevoPeriodo(null);
    setNuevoCurso(null);
    cargarCat();
  }, [open, matricula, crearParaEstudianteId, cargarCat]);

  async function crearPeriodoInline() {
    if (!nuevoPeriodo?.trim()) return;
    setGuardandoCat(true); setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/periodos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoPeriodo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando período');
      await cargarCat();
      setForm((f) => ({ ...f, periodoId: String(data.periodo.id) }));
      setNuevoPeriodo(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando período');
    } finally { setGuardandoCat(false); }
  }

  async function crearCursoInline() {
    if (!nuevoCurso?.trim()) return;
    setGuardandoCat(true); setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/cursos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoCurso.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando curso');
      await cargarCat();
      setForm((f) => ({ ...f, cursoId: String(data.curso.id) }));
      setNuevoCurso(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando curso');
    } finally { setGuardandoCat(false); }
  }

  async function guardar() {
    if (!matricula && !esCrear) return;
    if (!form.periodoId || !form.cursoId) { setError('Período y curso son obligatorios'); return; }
    setSaving(true); setError(null);
    try {
      const res = matricula
        ? await fetch(`/api/administracion-escolar/matriculas/${matricula.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              periodoId: Number(form.periodoId), cursoId: Number(form.cursoId),
              fechaInscripcion: form.fechaInscripcion || null, estado: form.estado,
              codigoMatricula: form.codigoMatricula || null, notas: form.notas || null,
            }),
          })
        : await fetch('/api/administracion-escolar/matriculas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              estudianteId: crearParaEstudianteId,
              periodoId: Number(form.periodoId), cursoId: Number(form.cursoId),
              fechaInscripcion: form.fechaInscripcion || null, estado: form.estado,
              codigoMatricula: form.codigoMatricula || null, notas: form.notas || null,
            }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{esCrear ? 'Reinscribir estudiante' : 'Editar matrícula'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}
          <div className="space-y-1.5">
            <Label>Período *</Label>
            {nuevoPeriodo !== null ? (
              <InlineCrear value={nuevoPeriodo} onChange={setNuevoPeriodo} onGuardar={crearPeriodoInline}
                onCancelar={() => setNuevoPeriodo(null)} saving={guardandoCat} placeholder="Ej: 2026-2027" />
            ) : (
              <div className="flex gap-2">
                <Select value={form.periodoId} onValueChange={(v) => setForm((f) => ({ ...f, periodoId: v }))}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {periodos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                {puedeConfigurar && (
                  <Button type="button" variant="outline" size="icon" onClick={() => setNuevoPeriodo('')} title="Nuevo período">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Curso *</Label>
            {nuevoCurso !== null ? (
              <InlineCrear value={nuevoCurso} onChange={setNuevoCurso} onGuardar={crearCursoInline}
                onCancelar={() => setNuevoCurso(null)} saving={guardandoCat} placeholder="Ej: Primero A" />
            ) : (
              <div className="flex gap-2">
                <Select value={form.cursoId} onValueChange={(v) => setForm((f) => ({ ...f, cursoId: v }))}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {cursos.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                {puedeConfigurar && (
                  <Button type="button" variant="outline" size="icon" onClick={() => setNuevoCurso('')} title="Nuevo curso">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha inscripción</Label>
              <Input type="date" value={form.fechaInscripcion}
                onChange={(e) => setForm((f) => ({ ...f, fechaInscripcion: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={(v) => setForm((f) => ({ ...f, estado: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Código de matrícula</Label>
            <Input placeholder="Opcional" value={form.codigoMatricula}
              onChange={(e) => setForm((f) => ({ ...f, codigoMatricula: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={guardar} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : (esCrear ? 'Crear matrícula' : 'Guardar cambios')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InlineCrear({ value, onChange, onGuardar, onCancelar, saving, placeholder }: {
  value: string; onChange: (v: string) => void; onGuardar: () => void; onCancelar: () => void;
  saving: boolean; placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <Input autoFocus placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onGuardar(); } }} />
      <Button type="button" size="icon" className="bg-teal-600 hover:bg-teal-700" onClick={onGuardar} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </Button>
      <Button type="button" variant="outline" size="icon" onClick={onCancelar} disabled={saving}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
