'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { SEXOS, calcularEdad } from '@/lib/administracion-escolar/estudiante-utils';

interface Periodo { id: number; nombre: string; activo: boolean }
interface Curso { id: number; nombre: string }

function hoy() { return new Date().toISOString().slice(0, 10); }

export default function NuevoEstudianteClient() {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeConfigurar = permissions.includes('administracion-escolar:configurar');

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cursos, setCursos]     = useState<Curso[]>([]);
  const [loading, setLoading]   = useState(true);

  const [form, setForm] = useState({
    nombres: '', apellidos: '', sexo: '', fechaNacimiento: '',
    periodoId: '', cursoId: '', fechaInscripcion: hoy(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Alta inline de periodo/curso (para escuelas sin catálogo previo).
  const [nuevoPeriodo, setNuevoPeriodo] = useState<string | null>(null);
  const [nuevoCurso, setNuevoCurso]     = useState<string | null>(null);
  const [guardandoCat, setGuardandoCat] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        fetch('/api/administracion-escolar/periodos').then((r) => r.json()),
        fetch('/api/administracion-escolar/cursos').then((r) => r.json()),
      ]);
      const per: Periodo[] = p.periodos ?? [];
      setPeriodos(per);
      setCursos(c.cursos ?? []);
      // Preseleccionar el período activo.
      setForm((f) => f.periodoId ? f : { ...f, periodoId: String(per.find((x) => x.activo)?.id ?? '') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const edad = calcularEdad(form.fechaNacimiento);

  async function crearPeriodoInline() {
    if (!nuevoPeriodo?.trim()) return;
    setGuardandoCat(true);
    setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/periodos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoPeriodo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando período');
      await cargar();
      setForm((f) => ({ ...f, periodoId: String(data.periodo.id) }));
      setNuevoPeriodo(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando período');
    } finally {
      setGuardandoCat(false);
    }
  }

  async function crearCursoInline() {
    if (!nuevoCurso?.trim()) return;
    setGuardandoCat(true);
    setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/cursos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoCurso.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando curso');
      await cargar();
      setForm((f) => ({ ...f, cursoId: String(data.curso.id) }));
      setNuevoCurso(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando curso');
    } finally {
      setGuardandoCat(false);
    }
  }

  async function guardar() {
    if (!form.nombres.trim() || !form.apellidos.trim()) {
      setError('Nombres y apellidos son obligatorios'); return;
    }
    if (!form.periodoId || !form.cursoId) {
      setError('Período y curso son obligatorios (definen la primera inscripción)'); return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/estudiantes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombres: form.nombres, apellidos: form.apellidos,
          sexo: form.sexo || null, fechaNacimiento: form.fechaNacimiento || null,
          matricula: {
            periodoId: Number(form.periodoId), cursoId: Number(form.cursoId),
            fechaInscripcion: form.fechaInscripcion || hoy(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando estudiante');
      router.push(`/dashboard/administracion-escolar/estudiantes/${data.estudiante.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando estudiante');
      setSaving(false);
    }
  }

  return (
    <section className="p-6 max-w-2xl mx-auto space-y-5">
      <Link href="/dashboard/administracion-escolar/estudiantes"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-teal-600 transition-colors">
        <ArrowLeft className="h-4 w-4" />Volver a estudiantes
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo estudiante</h1>
        <p className="text-sm text-gray-500 mt-1">
          El código se genera automáticamente (AAAA-####) según el año de esta primera inscripción.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
      ) : (
        <div className="border border-gray-200 rounded-xl bg-white p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}

          {/* Datos del estudiante */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombres *">
              <Input autoFocus value={form.nombres}
                onChange={(e) => setForm((f) => ({ ...f, nombres: e.target.value }))} />
            </Field>
            <Field label="Apellidos *">
              <Input value={form.apellidos}
                onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))} />
            </Field>
            <Field label="Sexo">
              <Select value={form.sexo} onValueChange={(v) => setForm((f) => ({ ...f, sexo: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {SEXOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Fecha de nacimiento${edad != null ? ` · ${edad} años` : ''}`}>
              <Input type="date" value={form.fechaNacimiento}
                onChange={(e) => setForm((f) => ({ ...f, fechaNacimiento: e.target.value }))} />
            </Field>
          </div>

          {/* Primera inscripción */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <p className="text-sm font-semibold text-gray-900">Primera inscripción</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Período *">
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
              </Field>
              <Field label="Curso *">
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
              </Field>
              <Field label="Fecha de inscripción">
                <Input type="date" value={form.fechaInscripcion}
                  onChange={(e) => setForm((f) => ({ ...f, fechaInscripcion: e.target.value }))} />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.back()} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={guardar} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear estudiante'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
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
