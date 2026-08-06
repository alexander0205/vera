'use client';

import React, { useState, useEffect, useCallback, useId } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Loader2, Plus, X, User, ClipboardList, IdCard, Phone, FileText, MapPin, Award,
  type LucideIcon,
} from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { SEXOS, calcularEdad } from '@/lib/administracion-escolar/estudiante-utils';
import {
  CAMPOS_SIGERD_ESTUDIANTE, GRUPOS_SIGERD, type GrupoCampo,
} from '@/lib/administracion-escolar/estudiante-sigerd-campos';

interface Periodo { id: number; nombre: string; activo: boolean }
interface Curso { id: number; nombre: string }

function hoy() { return new Date().toISOString().slice(0, 10); }

/** Ícono + subtítulo de cada categoría de la ficha extendida. */
const CATEGORIA: Record<GrupoCampo, { icon: LucideIcon; hint: string }> = {
  'Identidad':          { icon: IdCard,   hint: 'Nacionalidad, estado civil y RNE' },
  'Contacto':           { icon: Phone,    hint: 'Teléfonos y WhatsApp' },
  'Acta de nacimiento': { icon: FileText, hint: 'Datos de la Junta Central Electoral' },
  'Dirección':          { icon: MapPin,   hint: 'Domicilio del estudiante' },
  'Programa y subsidio':{ icon: Award,    hint: 'Jornada y tarjetas de subsidio' },
};

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
  // Ficha extendida (opcional). Estado aparte del núcleo obligatorio.
  const [extra, setExtra] = useState<Record<string, string>>(
    () => Object.fromEntries(CAMPOS_SIGERD_ESTUDIANTE.map((c) => [c.key, ''])),
  );
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
          ...extra, // ficha extendida (la API recorta/ignora lo vacío)
          matricula: {
            periodoId: Number(form.periodoId), cursoId: Number(form.cursoId),
            fechaInscripcion: form.fechaInscripcion || hoy(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando estudiante');
      router.push(`/escolar/estudiantes/${data.estudiante.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando estudiante');
      setSaving(false);
    }
  }

  const setExtraCampo = (key: string, v: string) => setExtra((x) => ({ ...x, [key]: v }));

  return (
    <section className="mx-auto max-w-4xl space-y-5 p-6">
      <Link href="/escolar/estudiantes"
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-zero-600">
        <ArrowLeft className="h-4 w-4" />Volver a estudiantes
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo estudiante</h1>
        <p className="mt-1 text-sm text-gray-500">
          Completa los datos del estudiante. Solo el nombre y la primera inscripción son obligatorios;
          el resto puedes llenarlo ahora o más tarde. El código se genera automáticamente (AAAA-####).
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* ── Datos del estudiante (obligatorio) ── */}
          <Categoria icon={User} titulo="Datos del estudiante" hint="Información principal" requerido>
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
                <SelectTrigger aria-label="Sexo" className="w-full"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {SEXOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={`Fecha de nacimiento${edad != null ? ` · ${edad} años` : ''}`}>
              <Input type="date" value={form.fechaNacimiento}
                onChange={(e) => setForm((f) => ({ ...f, fechaNacimiento: e.target.value }))} />
            </Field>
          </Categoria>

          {/* ── Primera inscripción (obligatorio) ── */}
          <Categoria icon={ClipboardList} titulo="Primera inscripción"
            hint="Define el código y la primera matrícula" requerido>
            <Field label="Período *">
              {nuevoPeriodo !== null ? (
                <InlineCrear value={nuevoPeriodo} onChange={setNuevoPeriodo} onGuardar={crearPeriodoInline}
                  onCancelar={() => setNuevoPeriodo(null)} saving={guardandoCat} placeholder="Ej: 2026-2027" />
              ) : (
                <div className="flex gap-2">
                  <Select value={form.periodoId} onValueChange={(v) => setForm((f) => ({ ...f, periodoId: v }))}>
                    <SelectTrigger aria-label="Período" className="flex-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
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
                    <SelectTrigger aria-label="Curso" className="flex-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
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
          </Categoria>

          {/* ── Categorías opcionales (una tarjeta por categoría) ── */}
          {GRUPOS_SIGERD.map((grupo) => {
            const meta = CATEGORIA[grupo];
            return (
              <Categoria key={grupo} icon={meta.icon} titulo={grupo} hint={meta.hint}>
                {CAMPOS_SIGERD_ESTUDIANTE.filter((c) => c.grupo === grupo).map((c) => (
                  <Field key={c.key} label={c.label}>
                    <Input
                      type={c.tipo === 'tel' ? 'tel' : 'text'}
                      value={extra[c.key] ?? ''}
                      placeholder={c.placeholder}
                      onChange={(e) => setExtraCampo(c.key, e.target.value)}
                    />
                  </Field>
                ))}
              </Categoria>
            );
          })}

          {/* ── Acciones ── */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => router.back()} disabled={saving}>Cancelar</Button>
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={guardar} disabled={saving}>
              {saving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Guardando…</> : 'Crear estudiante'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Tarjeta de una categoría del formulario. */
function Categoria({ icon: Icon, titulo, hint, requerido, children }: {
  icon: LucideIcon; titulo: string; hint?: string; requerido?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zero-50 text-zero-600">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
            {requerido
              ? <span className="rounded-full bg-zero-50 px-2 py-0.5 text-[10px] font-medium text-zero-700">Obligatorio</span>
              : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Opcional</span>}
          </div>
          {hint && <p className="text-xs text-gray-400">{hint}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

/**
 * Campo con su etiqueta REALMENTE asociada al control (htmlFor ↔ id generado),
 * para que tenga nombre accesible y el clic en la etiqueta enfoque el control.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
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
      <Button type="button" size="icon" className="bg-zero-600 hover:bg-zero-700" onClick={onGuardar} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </Button>
      <Button type="button" variant="outline" size="icon" onClick={onCancelar} disabled={saving}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
