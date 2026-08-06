'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { NativeSelect } from '@/components/ui/native-select';
import { ModalHeaderIcon } from '@/components/ui/modal-header-icon';
import { CalendarDays, ClipboardList, GraduationCap, Loader2, Plus, Search, Users } from 'lucide-react';
import { fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';

interface Matricula {
  id: number;
  estudianteId: number;
  estudiante: string | null;
  estudianteApellidos: string | null;
  periodoId: number;
  periodo: string | null;
  cursoId: number;
  curso: string | null;
  codigoMatricula: string | null;
  fechaInscripcion: string | null;
  estado: string;
  notas: string | null;
}
interface Periodo  { id: number; nombre: string; activo: boolean; }
interface Curso    { id: number; nombre: string; activo: boolean; }
interface Estudiante { id: number; nombres: string; apellidos: string; codigo: string | null; estado: string; }

const hoy = () => new Date().toISOString().split('T')[0];
const EMPTY_FORM = { estudianteId: '', periodoId: '', cursoId: '', codigoMatricula: '', fechaInscripcion: hoy(), notas: '' };

function estadoBadge(estado: string) {
  if (estado === 'activa') return <Badge className="bg-teal-50 text-teal-700 border-teal-200">Activa</Badge>;
  if (estado === 'retirada') return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Retirada</Badge>;
  if (estado === 'finalizada') return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Finalizada</Badge>;
  if (estado === 'anulada') return <Badge className="bg-red-50 text-red-700 border-red-200">Anulada</Badge>;
  return <span className="text-xs capitalize text-gray-600">{estado}</span>;
}

export default function MatriculasClient() {
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');

  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [periodos, setPeriodos]     = useState<Periodo[]>([]);
  const [cursos, setCursos]         = useState<Curso[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState<string | null>(null);

  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('todos');
  const [query, setQuery]           = useState('');

  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [opError, setOpError]       = useState<string | null>(null);

  const cargarMatriculas = useCallback(async () => {
    const url = filtroPeriodo === 'todos'
      ? '/api/administracion-escolar/matriculas'
      : `/api/administracion-escolar/matriculas?periodoId=${filtroPeriodo}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error cargando matrículas');
    setMatriculas(data.matriculas ?? []);
  }, [filtroPeriodo]);

  const cargarCatalogos = useCallback(async () => {
    const [periodosRes, cursosRes, estudiantesRes] = await Promise.all([
      fetch('/api/administracion-escolar/periodos'),
      fetch('/api/administracion-escolar/cursos'),
      fetch('/api/administracion-escolar/estudiantes'),
    ]);
    const [p, c, e] = await Promise.all([periodosRes.json(), cursosRes.json(), estudiantesRes.json()]);
    if (!periodosRes.ok) throw new Error(p.error ?? 'Error cargando períodos');
    if (!cursosRes.ok) throw new Error(c.error ?? 'Error cargando cursos');
    if (!estudiantesRes.ok) throw new Error(e.error ?? 'Error cargando estudiantes');
    setPeriodos(p.periodos ?? []);
    setCursos(c.cursos ?? []);
    setEstudiantes(e.estudiantes ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([cargarMatriculas(), cargarCatalogos()])
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Error cargando matrículas'))
      .finally(() => setLoading(false));
  }, [cargarMatriculas, cargarCatalogos]);

  const estudiantesActivos = useMemo(
    () => estudiantes.filter((e) => e.estado === 'activo'),
    [estudiantes],
  );
  const cursosActivos = useMemo(
    () => cursos.filter((c) => c.activo !== false),
    [cursos],
  );

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return matriculas;
    return matriculas.filter((m) =>
      `${m.estudiante ?? ''} ${m.estudianteApellidos ?? ''} ${m.curso ?? ''} ${m.codigoMatricula ?? ''}`.toLowerCase().includes(q),
    );
  }, [matriculas, query]);

  function abrirNueva() {
    const periodoActivo = periodos.find((p) => p.activo);
    setForm({ ...EMPTY_FORM, periodoId: periodoActivo ? String(periodoActivo.id) : '' });
    setOpError(null);
    setShowForm(true);
  }

  async function handleCrear() {
    if (!form.estudianteId || !form.periodoId || !form.cursoId) {
      setOpError('Estudiante, período y curso son obligatorios'); return;
    }
    setSaving(true);
    setOpError(null);
    try {
      const res = await fetch('/api/administracion-escolar/matriculas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estudianteId: parseInt(form.estudianteId),
          periodoId: parseInt(form.periodoId),
          cursoId: parseInt(form.cursoId),
          codigoMatricula: form.codigoMatricula || null,
          fechaInscripcion: form.fechaInscripcion || null,
          notas: form.notas || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando matrícula');
      setShowForm(false);
      setForm(EMPTY_FORM);
      await cargarMatriculas();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error creando matrícula');
    } finally {
      setSaving(false);
    }
  }

  const sinCatalogos = estudiantesActivos.length === 0 || periodos.length === 0 || cursosActivos.length === 0;
  const periodoActivo = periodos.find((p) => p.activo);
  const activas = matriculas.filter((m) => m.estado === 'activa').length;
  const cursosConMatricula = new Set(matriculas.map((m) => m.curso).filter(Boolean)).size;

  return (
    <section className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matrículas</h1>
          <p className="text-sm text-gray-500 mt-1">Matrícula de estudiantes por período escolar y curso</p>
        </div>
        {puedeGestionar && (
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirNueva} disabled={loading || sinCatalogos}>
            <Plus className="h-4 w-4 mr-2" />Nueva matrícula
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Matrículas" value={String(matriculas.length)} />
        <StatCard icon={Users} label="Activas" value={String(activas)} />
        <StatCard icon={CalendarDays} label="Período activo" value={periodoActivo?.nombre ?? '—'} />
        <StatCard icon={GraduationCap} label="Cursos con matrícula" value={String(cursosConMatricula)} />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-8" placeholder="Buscar por estudiante, curso o código…"
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="sm:w-48"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Período: Todos</SelectItem>
                {periodos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Tabla */}
          {loadError ? (
            <div className="text-center py-16">
              <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-red-600 font-medium">{loadError}</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => {
                setLoading(true);
                setLoadError(null);
                Promise.all([cargarMatriculas(), cargarCatalogos()])
                  .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Error cargando matrículas'))
                  .finally(() => setLoading(false));
              }}>
                Reintentar
              </Button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {matriculas.length === 0 ? 'Aún no hay matrículas registradas' : 'Sin resultados'}
              </p>
              {matriculas.length === 0 && puedeGestionar && !sinCatalogos && (
                <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm" onClick={abrirNueva}>
                  <Plus className="h-4 w-4 mr-1" />Nueva matrícula
                </Button>
              )}
              {sinCatalogos && (
                <p className="text-sm text-gray-400 mt-2">
                  Primero crea estudiantes activos en{' '}
                  <Link href="/escolar/estudiantes" className="text-teal-600 hover:underline">Estudiantes</Link>
                  {' '}y períodos/cursos en{' '}
                  <Link href="/escolar/configuracion" className="text-teal-600 hover:underline">Configuración</Link>.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2 font-medium">Estudiante</th>
                    <th className="px-3 py-2 font-medium">Curso</th>
                    <th className="px-3 py-2 font-medium">Período</th>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Inscripción</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <Link href={`/escolar/estudiantes/${m.estudianteId}`}
                          className="font-medium text-gray-900 hover:text-teal-600">
                          {m.estudiante} {m.estudianteApellidos}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{m.curso ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{m.periodo ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500">{m.codigoMatricula ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{m.fechaInscripcion ? fmtFechaCorta(m.fechaInscripcion) : '—'}</td>
                      <td className="px-3 py-2.5">{estadoBadge(m.estado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal nueva matrícula */}
      <Dialog open={showForm} onOpenChange={(o: boolean) => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-md">
          <ModalHeaderIcon icon={ClipboardList} title="Nueva matrícula"
            subtitle="Inscribe un estudiante en un período y curso." />
          <div className="space-y-4 px-6 py-4">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}
            <div className="space-y-1.5">
              <Label>Estudiante *</Label>
              <NativeSelect value={form.estudianteId} onChange={(e) => setForm((f) => ({ ...f, estudianteId: e.target.value }))}>
                <option value="" disabled>Selecciona un estudiante</option>
                {estudiantesActivos.map((es) => (
                  <option key={es.id} value={String(es.id)}>
                    {es.nombres} {es.apellidos}{es.codigo ? ` (${es.codigo})` : ''}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Período *</Label>
                <NativeSelect value={form.periodoId} onChange={(e) => setForm((f) => ({ ...f, periodoId: e.target.value }))}>
                  <option value="" disabled>Período</option>
                  {periodos.map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Curso *</Label>
                <NativeSelect value={form.cursoId} onChange={(e) => setForm((f) => ({ ...f, cursoId: e.target.value }))}>
                  <option value="" disabled>Curso</option>
                  {cursosActivos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
                </NativeSelect>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código matrícula</Label>
                <Input placeholder="Opcional" value={form.codigoMatricula}
                  onChange={(e) => setForm((f) => ({ ...f, codigoMatricula: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha inscripción</Label>
                <Input type="date" value={form.fechaInscripcion}
                  onChange={(e) => setForm((f) => ({ ...f, fechaInscripcion: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input placeholder="Opcional" value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleCrear} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear matrícula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof ClipboardList; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />{label}
        </div>
        <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{value}</p>
      </CardContent>
    </Card>
  );
}
