'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Paginador } from '@/components/ui/paginador';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MatriculaDialog } from '@/components/administracion-escolar/MatriculaDialog';
import { MatriculaFicha, EstadoMatriculaBadge } from '@/components/administracion-escolar/MatriculaFicha';
import { ModalHeader } from '@/components/ui/modal-header';
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
  grado: string | null;
  servicio: string | null;
  tanda: string | null;
  codigoMatricula: string | null;
  fechaInscripcion: string | null;
  estado: string;
  notas: string | null;
}
interface Periodo  { id: number; nombre: string; activo: boolean; }
/**
 * El curso de una matrícula, escrito completo.
 *
 * La sección se llama "A" a secas, así que la columna del listado decía lo
 * mismo para todo el colegio. El grado va delante y la tanda detrás, que es lo
 * que distingue dos secciones "A" de servicios distintos.
 */
function nombreCurso(m: { curso: string | null; grado: string | null; tanda: string | null }): string {
  if (!m.curso && !m.grado) return '—';
  const partes = [m.grado, m.curso].filter(Boolean).join(' — ');
  return m.tanda ? `${partes} · ${m.tanda}` : partes;
}

interface Curso    {
  id: number; nombre: string; activo: boolean;
  gradoId: number; gradoNombre: string; gradoActivo: boolean;
  servicioId: number; servicioNombre: string; servicioTanda: string | null;
  servicioActivo: boolean; periodoId: number;
}
interface Estudiante { id: number; nombres: string; apellidos: string; codigo: string | null; estado: string; }

const hoy = () => new Date().toISOString().split('T')[0];

/** Las iniciales del alumno, para el avatar de la fila. */
function iniciales(nombres: string | null, apellidos: string | null): string {
  return `${nombres?.[0] ?? ''}${apellidos?.[0] ?? ''}`.toUpperCase() || '—';
}
const ESTADOS = [
  { valor: 'activa',     etiqueta: 'Activa' },
  { valor: 'finalizada', etiqueta: 'Finalizada' },
  { valor: 'retirada',   etiqueta: 'Retirada' },
  { valor: 'anulada',    etiqueta: 'Anulada' },
];

// El badge de estado vive en MatriculaFicha: fila y ficha comparten definición.

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
  const [filtroEstado, setFiltroEstado]   = useState<string>('todos');
  /** `query` es lo que se teclea; `qDebounced` es lo que viaja al servidor. */
  const [query, setQuery]           = useState('');
  const [qDebounced, setQDebounced] = useState('');
  /** La fila abierta en la ficha lateral. */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [stats, setStats] = useState({ total: 0, activas: 0, cursos: 0 });

  const [showForm, setShowForm]     = useState(false);
  /** La matrícula que se está editando; `null` mientras se crea una nueva. */
  const [editando, setEditando]     = useState<Matricula | null>(null);
  const [porBorrar, setPorBorrar]   = useState<Matricula | null>(null);
  const [borrando, setBorrando]     = useState(false);
  const [borrarError, setBorrarError] = useState<string | null>(null);

  // Paginado en el servidor: las matrículas se acumulan curso tras curso.
  const [pagina, setPagina] = useState(1);
  const [paginaInfo, setPaginaInfo] = useState({ total: 0, paginas: 1, porPagina: 50 });

  const cargarMatriculas = useCallback(async () => {
    const params = new URLSearchParams({ pagina: String(pagina) });
    if (filtroPeriodo !== 'todos') params.set('periodoId', filtroPeriodo);
    if (filtroEstado !== 'todos') params.set('estado', filtroEstado);
    if (qDebounced) params.set('q', qDebounced);
    const res = await fetch(`/api/administracion-escolar/matriculas?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error cargando matrículas');
    setMatriculas(data.matriculas ?? []);
    setPaginaInfo({ total: data.total ?? 0, paginas: data.paginas ?? 1, porPagina: data.porPagina ?? 50 });
    setStats(data.stats ?? { total: 0, activas: 0, cursos: 0 });
  }, [filtroPeriodo, filtroEstado, qDebounced, pagina]);

  const cargarCatalogos = useCallback(async () => {
    const [periodosRes, cursosRes, estudiantesRes] = await Promise.all([
      fetch('/api/administracion-escolar/periodos'),
      fetch('/api/administracion-escolar/cursos'),
      fetch('/api/administracion-escolar/estudiantes/opciones'),
    ]);
    const [p, c, e] = await Promise.all([periodosRes.json(), cursosRes.json(), estudiantesRes.json()]);
    if (!periodosRes.ok) throw new Error(p.error ?? 'Error cargando períodos');
    if (!cursosRes.ok) throw new Error(c.error ?? 'Error cargando cursos');
    if (!estudiantesRes.ok) throw new Error(e.error ?? 'Error cargando estudiantes');
    setPeriodos(p.periodos ?? []);
    setCursos(c.cursos ?? []);
    setEstudiantes(e.estudiantes ?? []);
  }, []);

  // Debounce de la búsqueda (300 ms): sin él sale una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Cambiar de filtro vuelve a la primera página: quedarse en la siete de un
  // listado que ahora tiene dos deja la pantalla vacía sin explicar por qué.
  useEffect(() => { setPagina(1); }, [qDebounced, filtroPeriodo, filtroEstado]);

  /**
   * Los catálogos, UNA vez.
   *
   * Estaban en el mismo `Promise.all` que el listado, en un efecto que depende
   * de `cargarMatriculas` —y esa función se rehace con cada filtro, cada página
   * y cada tecla del buscador—. Resultado: escribir en el buscador volvía a
   * pedir períodos, cursos y la lista ENTERA de estudiantes (466 filas) además
   * de las matrículas. `cargarCatalogos` no depende de nada, así que aquí solo
   * corre al montar.
   */
  useEffect(() => {
    cargarCatalogos().catch((e: unknown) =>
      setLoadError(e instanceof Error ? e.message : 'Error cargando los catálogos'));
  }, [cargarCatalogos]);

  // El listado, cada vez que cambian los filtros o la página. No borra lo que
  // ya está en pantalla: la tabla anterior se queda hasta que llega la nueva,
  // igual que en Estudiantes, en vez de parpadear a vacío.
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    cargarMatriculas()
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Error cargando matrículas'))
      .finally(() => setLoading(false));
  }, [cargarMatriculas]);

  const estudiantesActivos = useMemo(
    () => estudiantes.filter((e) => e.estado === 'activo'),
    [estudiantes],
  );
  // Una sección de un grado o servicio dado de baja tampoco se ofrece:
  // matricular ahí dejaría al alumno colgando de una estructura que ya nadie
  // mantiene.
  const cursosActivos = useMemo(
    () => cursos.filter((c) =>
      c.activo !== false && c.gradoActivo !== false && c.servicioActivo !== false),
    [cursos],
  );

  async function handleBorrar() {
    if (!porBorrar) return;
    setBorrando(true);
    setBorrarError(null);
    try {
      const res = await fetch(`/api/administracion-escolar/matriculas/${porBorrar.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo borrar la matrícula');
      setPorBorrar(null);
      if (selectedId === porBorrar.id) setSelectedId(null);
      // La última de la página deja la página vacía: se retrocede una.
      if (matriculas.length === 1 && pagina > 1) setPagina((p) => p - 1);
      else await cargarMatriculas();
    } catch (e: unknown) {
      setBorrarError(e instanceof Error ? e.message : 'No se pudo borrar la matrícula');
    } finally {
      setBorrando(false);
    }
  }

  const seleccionada = matriculas.find((m) => m.id === selectedId) ?? null;

  function abrirNueva() {
    setEditando(null);
    setShowForm(true);
  }

  function abrirEdicion(m: Matricula) {
    setEditando(m);
    setShowForm(true);
  }

  const sinCatalogos = estudiantesActivos.length === 0 || periodos.length === 0 || cursosActivos.length === 0;
  const periodoActivo = periodos.find((p) => p.activo);
  const filtrosActivos = qDebounced !== '' || filtroPeriodo !== 'todos' || filtroEstado !== 'todos';

  return (
    <section className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matriculación</h1>
          <p className="text-sm text-gray-500 mt-1">Quién está inscrito en qué curso, y qué debe de ese período</p>
        </div>
        {puedeGestionar && (
          <Button className="bg-zero-600 hover:bg-zero-700" onClick={abrirNueva} disabled={loading || sinCatalogos}>
            <Plus className="h-4 w-4 mr-2" />Nueva matrícula
          </Button>
        )}
      </div>

      {/* Contadores del team, no de la página: los cuenta el servidor sobre
          todo lo filtrado. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Matrículas" value={String(stats.total)} />
        <StatCard icon={Users} label="Activas" value={String(stats.activas)} />
        <StatCard icon={CalendarDays} label="Período activo" value={periodoActivo?.nombre ?? '—'} />
        <StatCard icon={GraduationCap} label="Cursos con matrícula" value={String(stats.cursos)} />
      </div>

      {/* Listado + ficha, como en Estudiantes: se recorre a la izquierda y se
          mira el detalle a la derecha sin perder el sitio en la lista. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Matrículas</h2>
            <Badge variant="outline" className="text-zero-700 border-zero-200 bg-zero-50">
              {paginaInfo.total} registro{paginaInfo.total !== 1 ? 's' : ''}
            </Badge>
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-8" placeholder="Buscar por estudiante o código…"
                value={query} onChange={(e) => setQuery(e.target.value)} />
              {loading && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-zero-500" />
              )}
            </div>
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="sm:w-44"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Período: Todos</SelectItem>
                {periodos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="sm:w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Estado: Todos</SelectItem>
                {ESTADOS.map((e) => <SelectItem key={e.valor} value={e.valor}>{e.etiqueta}</SelectItem>)}
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
          ) : loading && matriculas.length === 0 ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>
          ) : matriculas.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {filtrosActivos ? 'Sin resultados para los filtros' : 'Aún no hay matrículas registradas'}
              </p>
              {!filtrosActivos && puedeGestionar && !sinCatalogos && (
                <Button className="mt-4 bg-zero-600 hover:bg-zero-700" size="sm" onClick={abrirNueva}>
                  <Plus className="h-4 w-4 mr-1" />Nueva matrícula
                </Button>
              )}
              {sinCatalogos && (
                <p className="text-sm text-gray-400 mt-2">
                  Primero crea estudiantes activos en{' '}
                  <Link href="/escolar/estudiantes" className="text-zero-600 hover:underline">Estudiantes</Link>
                  {' '}y períodos/cursos en{' '}
                  <Link href="/escolar/configuracion" className="text-zero-600 hover:underline">Configuración</Link>.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              {/* `min-w` para que el contenedor DESPLACE en vez de estrujar:
                  sin él las columnas se comprimían hasta partir cada celda en
                  varias líneas y Estado se salía de la vista. */}
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2 font-medium">Estudiante</th>
                    <th className="px-3 py-2 font-medium">Curso</th>
                    <th className="px-3 py-2 font-medium">Período</th>
                    <th className="px-3 py-2 font-medium">Inscripción</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {matriculas.map((m) => (
                    <tr key={m.id}
                      onClick={() => setSelectedId(m.id)}
                      className={`cursor-pointer border-t border-gray-100 transition-colors ${
                        m.id === selectedId ? 'bg-zero-50' : 'hover:bg-gray-50'
                      }`}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zero-100 text-xs font-semibold text-zero-700">
                            {iniciales(m.estudiante, m.estudianteApellidos)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">
                              {m.estudiante} {m.estudianteApellidos}
                            </p>
                            <p className="text-xs text-gray-400">{m.codigoMatricula ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      {/* Sin la tanda: en la fila lo que hace falta es el grado
                          y la sección. La tanda va en la ficha, bajo Servicio,
                          y aquí solo servía para partir la celda en seis
                          líneas. El título completo queda al pasar el ratón. */}
                      <td className="max-w-[15rem] px-3 py-2.5 text-gray-600">
                        <span className="block truncate" title={nombreCurso(m)}>
                          {[m.grado, m.curso].filter(Boolean).join(' — ') || '—'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{m.periodo ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{m.fechaInscripcion ? fmtFechaCorta(m.fechaInscripcion) : '—'}</td>
                      <td className="px-3 py-2.5"><EstadoMatriculaBadge estado={m.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginador
            pagina={pagina}
            paginas={paginaInfo.paginas}
            total={paginaInfo.total}
            porPagina={paginaInfo.porPagina}
            onCambiar={setPagina}
            cargando={loading}
          />
        </CardContent>
      </Card>

      {/* Ficha lateral */}
      <div>
        {seleccionada ? (
          <MatriculaFicha
            key={seleccionada.id}
            matricula={seleccionada}
            onEditar={abrirEdicion}
            onBorrar={(m) => { setPorBorrar(m); setBorrarError(null); }}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Selecciona una matrícula para ver su período
          </div>
        )}
      </div>
      </div>

      {/* Modal nueva matrícula */}
      {/* El MISMO diálogo que la ficha del alumno: uno solo, para que las dos
          pantallas matriculen igual. */}
      <MatriculaDialog
        open={showForm}
        matricula={editando}
        estudianteFijoNombre={editando ? `${editando.estudiante ?? ''} ${editando.estudianteApellidos ?? ''}`.trim() : null}
        onClose={() => { setShowForm(false); setEditando(null); }}
        onSaved={() => { setShowForm(false); setEditando(null); void cargarMatriculas(); }}
      />

      {/* Borrar es para deshacer un error de dedo. Si la matrícula ya movió
          dinero el servidor lo niega y explica que se cambie el estado. */}
      <Dialog open={porBorrar !== null} onOpenChange={(o: boolean) => { if (!o) setPorBorrar(null); }}>
        <DialogContent className="max-w-md">
          <ModalHeader title="Borrar matrícula"
            subtitle="Se elimina del historial y no se puede deshacer." />
          <div className="space-y-4 px-6 py-4">
            {borrarError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{borrarError}</div>
            )}
            {porBorrar && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
                <p className="font-medium text-gray-900">
                  {porBorrar.estudiante} {porBorrar.estudianteApellidos}
                </p>
                <p className="text-gray-600">{nombreCurso(porBorrar)} · {porBorrar.periodo}</p>
              </div>
            )}
            <p className="text-sm text-gray-600">
              Si el alumno se fue del colegio no lo borres: edítala y ponla como{' '}
              <span className="font-medium">retirada</span>, así queda el rastro de que estuvo inscrito.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPorBorrar(null)} disabled={borrando}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleBorrar} disabled={borrando}>
              {borrando ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Borrando…</> : 'Borrar'}
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
