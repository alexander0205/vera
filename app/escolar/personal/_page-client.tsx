'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import {
  Users, GraduationCap, Search, Loader2, IdCard, Cake, Phone, Mail, Globe, Briefcase,
  Plus, Pencil, Trash2, StickyNote, UserPlus,
} from 'lucide-react';

interface Persona {
  key: string;
  origen: 'sigerd' | 'manual';
  id: number;
  sigerdIdPersona: number | null;
  cedula: string | null;
  nombres: string | null;
  apellidos: string | null;
  cargo: string | null;
  tipo: string | null;
  estado: string | null;
  sexo: string | null;
  fechaNacimiento: string | null;
  nacionalidad: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  esProfesor: boolean;
  editable: boolean;
}

interface Respuesta {
  personal: Persona[];
  totales: { total: number; profesores: number; otros: number; activos: number; manual: number };
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Filtro = 'todos' | 'profesores' | 'otros' | 'manual';

function iniciales(p: Persona): string {
  const n = (p.nombres ?? '').trim().split(/\s+/)[0]?.[0] ?? '';
  const a = (p.apellidos ?? '').trim().split(/\s+/)[0]?.[0] ?? '';
  return (n + a).toUpperCase() || '·';
}

function nombreCompleto(p: Persona): string {
  return [p.nombres, p.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';
}

/** Activo = "activ" pero NO "inactiv" (`/activ/` matchea "Inactivo": in-ACTIV-o). */
function esActivo(estado: string | null): boolean {
  const e = estado ?? '';
  return /activ/i.test(e) && !/inactiv/i.test(e);
}

// ── Formulario (alta / edición) ───────────────────────────────────────────────
type FormState = {
  nombres: string; apellidos: string; cedula: string; cargo: string;
  tipo: 'auto' | 'maestro' | 'otro'; estado: string; sexo: string;
  fechaNacimiento: string; nacionalidad: string; telefono: string; email: string; notas: string;
};

const FORM_VACIO: FormState = {
  nombres: '', apellidos: '', cedula: '', cargo: '', tipo: 'auto', estado: 'Activo',
  sexo: '', fechaNacimiento: '', nacionalidad: '', telefono: '', email: '', notas: '',
};

function personaAForm(p: Persona): FormState {
  const tipo: FormState['tipo'] = p.tipo === 'maestro' ? 'maestro' : p.tipo === 'otro' ? 'otro' : 'auto';
  return {
    nombres: p.nombres ?? '', apellidos: p.apellidos ?? '', cedula: p.cedula ?? '',
    cargo: p.cargo ?? '', tipo, estado: p.estado ?? 'Activo', sexo: p.sexo ?? '',
    fechaNacimiento: p.fechaNacimiento ?? '', nacionalidad: p.nacionalidad ?? '',
    telefono: p.telefono ?? '', email: p.email ?? '', notas: p.notas ?? '',
  };
}

/** Estilo de los <select> nativos, ~igual a los Input MUI (outlined, small). */
const SELECT_CLS =
  'h-10 w-full cursor-pointer rounded-lg border border-black/25 bg-transparent px-3 text-sm ' +
  'outline-none transition-colors hover:border-black/50 focus:border-primary focus:ring-1 focus:ring-primary ' +
  'dark:border-white/25 dark:hover:border-white/40';

export default function PersonalClient() {
  const { data, isLoading, mutate } = useSWR<Respuesta>('/api/escolar/personal', fetcher);
  const [q, setQ] = useState('');
  const [dlgAbierto, setDlgAbierto] = useState(false);
  // Catálogo de cargos (sugerencias del SIGERD descargado); se pide al abrir.
  const { data: cat } = useSWR<{ cargos: string[] }>(
    dlgAbierto ? '/api/escolar/personal/catalogo' : null,
    fetcher,
  );
  const cargosSugeridos = cat?.cargos ?? [];
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [selKey, setSelKey] = useState<string | null>(null);

  // Estado del diálogo de alta/edición.
  const [editId, setEditId] = useState<number | null>(null); // null = alta
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Persona | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lista = useMemo(() => {
    const base = data?.personal ?? [];
    const term = q.trim().toLowerCase();
    return base.filter((p) => {
      if (filtro === 'profesores' && !p.esProfesor) return false;
      if (filtro === 'otros' && p.esProfesor) return false;
      if (filtro === 'manual' && p.origen !== 'manual') return false;
      if (!term) return true;
      return (
        nombreCompleto(p).toLowerCase().includes(term) ||
        (p.cedula ?? '').toLowerCase().includes(term) ||
        (p.cargo ?? '').toLowerCase().includes(term)
      );
    });
  }, [data, q, filtro]);

  const sel = useMemo(() => lista.find((p) => p.key === selKey) ?? lista[0] ?? null, [lista, selKey]);
  const t = data?.totales;

  function abrirAlta() {
    setEditId(null);
    setForm(FORM_VACIO);
    setError(null);
    setDlgAbierto(true);
  }

  function abrirEdicion(p: Persona) {
    setEditId(p.id);
    setForm(personaAForm(p));
    setError(null);
    setDlgAbierto(true);
  }

  async function guardar() {
    if (!form.nombres.trim() && !form.apellidos.trim()) {
      setError('Indica al menos el nombre o el apellido.');
      return;
    }
    setGuardando(true);
    setError(null);
    const payload = {
      ...form,
      tipo: form.tipo === 'auto' ? null : form.tipo,
    };
    try {
      const res = await fetch('/api/escolar/personal', {
        method: editId === null ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editId === null ? payload : { ...payload, id: editId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'No se pudo guardar.');
      }
      setDlgAbierto(false);
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Borra a una persona añadida a mano, con confirmación propia.
   *
   * No con `window.confirm`: en el navegador embebido de la app devuelve
   * `false` al instante y sin enseñar nada, así que el botón no hacía nada.
   */
  async function confirmarBorrado() {
    const p = porBorrar;
    if (!p) return;
    setBorrando(true);
    try {
      const res = await fetch(`/api/escolar/personal?id=${p.id}`, { method: 'DELETE' });
      if (!res.ok) { setErrorBorrado('No se pudo eliminar.'); return; }
      setPorBorrar(null);
      setErrorBorrado(null);
      if (selKey === p.key) setSelKey(null);
      await mutate();
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Personal</h1>
          <p className="text-sm text-muted-foreground">
            Personal del centro. Lo de SIGERD es solo lectura; puedes agregar personal a mano y editarlo.
          </p>
        </div>
        <Button onClick={abrirAlta} className="shrink-0">
          <Plus className="mr-1.5 h-4 w-4" /> Agregar personal
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total" valor={t?.total} icon={Users} />
        <Kpi label="Maestros / Profesores" valor={t?.profesores} icon={GraduationCap} />
        <Kpi label="Otro personal" valor={t?.otros} icon={Briefcase} />
        <Kpi label="Agregados a mano" valor={t?.manual} icon={UserPlus} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Lista */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por nombre, cédula o cargo…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['todos', 'profesores', 'otros', 'manual'] as Filtro[]).map((f) => (
                <Button key={f} size="sm" variant={filtro === f ? 'default' : 'outline'} onClick={() => setFiltro(f)}>
                  {f === 'todos' ? 'Todos' : f === 'profesores' ? 'Maestros' : f === 'otros' ? 'Otros' : 'A mano'}
                </Button>
              ))}
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando personal…
              </div>
            ) : lista.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {data?.personal.length
                  ? 'Sin coincidencias.'
                  : 'No hay personal. Corre "Obtener información" en SIGERD o agrega personal a mano.'}
              </p>
            ) : (
              <div className="max-h-[26rem] space-y-1 overflow-auto pr-1">
                <p className="text-xs text-muted-foreground">{lista.length} persona(s)</p>
                {lista.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSelKey(p.key)}
                    className={`flex w-full items-center gap-3 rounded-md border p-2 text-left transition ${
                      sel?.key === p.key ? 'border-primary bg-muted' : 'hover:bg-muted/50'
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {iniciales(p)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{nombreCompleto(p)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.cargo ?? '—'}</span>
                    </span>
                    {p.origen === 'manual' && <Badge variant="outline" className="shrink-0">A mano</Badge>}
                    {p.esProfesor && <Badge variant="secondary" className="shrink-0">Maestro</Badge>}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detalle */}
        <Card>
          <CardContent className="p-4">
            {!sel ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Selecciona una persona para ver su ficha.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                    {iniciales(sel)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">{nombreCompleto(sel)}</h2>
                    <p className="text-sm text-muted-foreground">{sel.cargo ?? '—'}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {sel.estado && <Badge variant={esActivo(sel.estado) ? 'default' : 'secondary'}>{sel.estado}</Badge>}
                      <Badge variant="outline">{sel.esProfesor ? 'Maestro / Profesor' : 'Otro personal'}</Badge>
                      <Badge variant="outline">{sel.origen === 'manual' ? 'Agregado a mano' : 'De SIGERD'}</Badge>
                    </div>
                  </div>
                  {sel.editable && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => abrirEdicion(sel)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setPorBorrar(sel)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-md border">
                  <p className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                    {sel.origen === 'manual' ? 'Datos del personal' : 'Datos de SIGERD (solo lectura)'}
                  </p>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-3 p-3 sm:grid-cols-2">
                    <Campo icon={IdCard} label="Cédula" valor={sel.cedula} />
                    <Campo icon={Briefcase} label="Cargo" valor={sel.cargo} />
                    <Campo icon={Users} label="Sexo" valor={sel.sexo} />
                    <Campo icon={Cake} label="Fecha de nacimiento" valor={sel.fechaNacimiento} />
                    <Campo icon={Globe} label="Nacionalidad" valor={sel.nacionalidad} />
                    <Campo icon={Phone} label="Teléfono" valor={sel.telefono} />
                    <Campo icon={Mail} label="Correo" valor={sel.email} />
                    {sel.notas && <Campo icon={StickyNote} label="Notas" valor={sel.notas} />}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {sel.origen === 'manual'
                    ? 'Este registro lo agregaste a mano. Se conserva al re-sincronizar SIGERD.'
                    : 'Estos datos se actualizan al correr “Obtener información” en SIGERD. No se editan aquí.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diálogo alta / edición */}
      <Dialog open={dlgAbierto} onOpenChange={setDlgAbierto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId === null ? 'Agregar personal' : 'Editar personal'}</DialogTitle>
            <DialogDescription>
              Personal agregado a mano. No se envía a SIGERD y se conserva al re-sincronizar.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoForm label="Nombres" id="nombres">
              <Input id="nombres" value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
            </CampoForm>
            <CampoForm label="Apellidos" id="apellidos">
              <Input id="apellidos" value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
            </CampoForm>
            <CampoForm label="Cédula" id="cedula">
              <Input id="cedula" value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} placeholder="000-0000000-0" />
            </CampoForm>
            <CampoForm label="Cargo" id="cargo">
              <Input
                id="cargo"
                list="personal-cargos"
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                placeholder="Ej. Maestro, Conserje, Director"
              />
              <datalist id="personal-cargos">
                {cargosSugeridos.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </CampoForm>
            <CampoForm label="Tipo" id="tipo">
              <select
                id="tipo"
                className={SELECT_CLS}
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as FormState['tipo'] })}
              >
                <option value="auto">Según el cargo</option>
                <option value="maestro">Maestro / Profesor</option>
                <option value="otro">Otro personal</option>
              </select>
            </CampoForm>
            <CampoForm label="Estado" id="estado">
              <select
                id="estado"
                className={SELECT_CLS}
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </CampoForm>
            <CampoForm label="Sexo" id="sexo">
              <Input id="sexo" value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value })} placeholder="Masculino / Femenino" />
            </CampoForm>
            <CampoForm label="Fecha de nacimiento" id="fnac">
              <Input id="fnac" type="date" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })} />
            </CampoForm>
            <CampoForm label="Nacionalidad" id="nac">
              <Input id="nac" value={form.nacionalidad} onChange={(e) => setForm({ ...form, nacionalidad: e.target.value })} placeholder="Dominicana" />
            </CampoForm>
            <CampoForm label="Teléfono" id="tel">
              <Input id="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="809-000-0000" />
            </CampoForm>
            <CampoForm label="Correo" id="email">
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </CampoForm>
            <CampoForm label="Notas" id="notas" full>
              <Textarea id="notas" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} />
            </CampoForm>
          </DialogBody>

          {error && <p className="px-1 text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgAbierto(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editId === null ? 'Agregar' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={porBorrar !== null}
        onOpenChange={(o: boolean) => { if (!o) { setPorBorrar(null); setErrorBorrado(null); } }}
        title={`Eliminar a ${porBorrar ? nombreCompleto(porBorrar) : ''}`}
        description={
          <>
            Esta persona se agregó a mano, así que no vuelve al re-sincronizar SIGERD.
            {errorBorrado && (
              <span className="mt-2 block rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                {errorBorrado}
              </span>
            )}
          </>
        }
        confirmLabel="Eliminar"
        destructive
        loading={borrando}
        onConfirm={() => void confirmarBorrado()} />
    </div>
  );
}

function Kpi({ label, valor, icon: Icon }: { label: string; valor: number | undefined; icon: typeof Users }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{valor ?? '—'}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Campo({ icon: Icon, label, valor }: { icon: typeof Users; label: string; valor: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{valor?.trim() || <span className="text-muted-foreground">—</span>}</p>
      </div>
    </div>
  );
}

function CampoForm({ label, id, full, children }: { label: string; id: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
