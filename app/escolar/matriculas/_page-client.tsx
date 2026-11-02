'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Paginador } from '@/components/ui/paginador';
import { ExportarListado } from '@/components/reportes/exportar-listado';
import { armarEnvioTabla, type ExportTabla } from '@/lib/export/tabla';
import { traerPaginas, notaDeCorte } from '@/lib/export/paginas';
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
import { MatriculaLoteDialog } from '@/components/administracion-escolar/MatriculaLoteDialog';
import { BotonMatricular } from '@/components/administracion-escolar/BotonMatricular';
import { MatriculaFicha, EstadoMatriculaBadge } from '@/components/administracion-escolar/MatriculaFicha';
import { ModalHeader } from '@/components/ui/modal-header';
import { CalendarDays, ClipboardList, GraduationCap, Loader2, Plus, Search, Users } from 'lucide-react';
import { fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useUrlParams } from '@/lib/hooks/useUrlEstado';
import {
  idDeRuta, rutaEditarMatricula, rutaNuevaMatricula,
} from '@/lib/administracion-escolar/matricula-pantalla';
import { textoDeCurso } from '@/lib/administracion-escolar/sin-grado';

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
  const partes = textoDeCurso(m.grado, m.curso, ' — ');
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

/**
 * Imprimir / PDF / Excel de las matrículas filtradas (todas las páginas). Sin
 * filtro de fecha: el período escolar es el filtro de tiempo, y la fecha de
 * inscripción falta en casi todas las matrículas migradas.
 */
const EXPORTAR: ExportTabla<Matricula> = {
  titulo: 'Matrículas',
  archivo: 'matriculas',
  tachada: m => m.estado === 'anulada',
  columnas: [
    { titulo: 'Estudiante', valor: m => `${m.estudiante ?? ''} ${m.estudianteApellidos ?? ''}`.trim() || null, sub: m => m.codigoMatricula, ancho: 2 },
    { titulo: 'Período', valor: m => m.periodo, ancho: 0.9 },
    { titulo: 'Curso', valor: m => nombreCurso(m), ancho: 1.8 },
    { titulo: 'Servicio', valor: m => m.servicio, ancho: 1.1 },
    { titulo: 'Inscripción', valor: m => (m.fechaInscripcion ? fmtFechaCorta(m.fechaInscripcion) : null), ancho: 0.8 },
    { titulo: 'Estado', valor: m => ESTADOS.find(e => e.valor === m.estado)?.etiqueta ?? m.estado, ancho: 0.8 },
  ],
};

export default function MatriculasClient() {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');

  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [periodos, setPeriodos]     = useState<Periodo[]>([]);
  const [cursos, setCursos]         = useState<Curso[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState<string | null>(null);

  /**
   * Filtros, página y matrícula seleccionada viven en la URL, no en `useState`,
   * igual que en el listado de Estudiantes.
   *
   * Hacía falta desde que «Nueva matrícula» y «Editar matrícula» son pantallas
   * aparte: con estado local, volver de editar la matrícula de la página tres
   * de un período dejaba en la página uno, sin filtro y con la ficha cerrada.
   * Con la URL, esta pantalla se pasa a sí misma como sitio al que volver y se
   * regresa a lo que se estaba mirando.
   *
   * Los valores por defecto («todos», página 1) NO se escriben: la URL normal
   * se queda limpia y solo dice lo que se ha tocado.
   */
  const { params: urlParams, setParams } = useUrlParams();

  /** Lo que viaja al servidor: el texto ya rebotado. */
  const qUrl = urlParams.get('q') ?? '';
  // Lo que venga de fuera se valida: un ?periodo= o ?estado= escrito a mano
  // llegaría tal cual a la consulta del servidor.
  const periodoUrl = idDeRuta(urlParams.get('periodo'));
  const filtroPeriodo = periodoUrl != null ? String(periodoUrl) : 'todos';
  const estadoUrl = urlParams.get('estado') ?? '';
  const filtroEstado = ESTADOS.some((e) => e.valor === estadoUrl) ? estadoUrl : 'todos';
  // Paginado en el servidor: las matrículas se acumulan curso tras curso.
  const pagina = idDeRuta(urlParams.get('page')) ?? 1;
  /** La fila abierta en la ficha lateral. */
  const selectedId = idDeRuta(urlParams.get('matricula'));

  /**
   * El texto del buscador SÍ es estado local, además del de la URL: a la URL
   * va el valor ya rebotado (300 ms), y el recuadro se alimenta de este para
   * no ir a tirones mientras se teclea.
   */
  const [query, setQuery] = useState(qUrl);
  const [stats, setStats] = useState({ total: 0, activas: 0, cursos: 0 });

  const [showLote, setShowLote]     = useState(false);
  const [porBorrar, setPorBorrar]   = useState<Matricula | null>(null);
  const [borrando, setBorrando]     = useState(false);
  const [borrarError, setBorrarError] = useState<string | null>(null);

  const [paginaInfo, setPaginaInfo] = useState({ total: 0, paginas: 1, porPagina: 50 });

  const cargarMatriculas = useCallback(async () => {
    const params = new URLSearchParams({ pagina: String(pagina) });
    if (filtroPeriodo !== 'todos') params.set('periodoId', filtroPeriodo);
    if (filtroEstado !== 'todos') params.set('estado', filtroEstado);
    if (qUrl) params.set('q', qUrl);
    const res = await fetch(`/api/administracion-escolar/matriculas?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error cargando matrículas');
    setMatriculas(data.matriculas ?? []);
    setPaginaInfo({ total: data.total ?? 0, paginas: data.paginas ?? 1, porPagina: data.porPagina ?? 50 });
    setStats(data.stats ?? { total: 0, activas: 0, cursos: 0 });
  }, [filtroPeriodo, filtroEstado, qUrl, pagina]);

  // Para el export: todas las páginas con el filtro de la pantalla.
  async function armarExport() {
    const { filas: todas, total, truncado } = await traerPaginas<Matricula>((pag) => {
      const params = new URLSearchParams({ pagina: String(pag), porPagina: '200' });
      if (filtroPeriodo !== 'todos') params.set('periodoId', filtroPeriodo);
      if (filtroEstado !== 'todos') params.set('estado', filtroEstado);
      if (qUrl) params.set('q', qUrl);
      return `/api/administracion-escolar/matriculas?${params}`;
    }, 'matriculas');
    const partes = [
      filtroPeriodo !== 'todos' ? `Período: ${periodos.find(x => String(x.id) === filtroPeriodo)?.nombre ?? filtroPeriodo}` : 'Todos los períodos',
      filtroEstado !== 'todos' ? `Estado: ${ESTADOS.find(e => e.valor === filtroEstado)?.etiqueta ?? filtroEstado}` : null,
      qUrl ? `Búsqueda: «${qUrl}»` : null,
      truncado ? notaDeCorte(todas.length, total) : null,
    ];
    return armarEnvioTabla(EXPORTAR, todas, partes.filter(Boolean).join(' · '));
  }

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
  //
  // Cambiar de filtro vuelve a la primera página: quedarse en la siete de un
  // listado que ahora tiene dos deja la pantalla vacía sin explicar por qué.
  // Va en el MISMO cambio de URL que el filtro: en dos, el segundo pisa al
  // primero (ver `useUrlParams`).
  const ultimoEnviado = useRef<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const v = query.trim();
      if (v === qUrl) return;
      ultimoEnviado.current = v;
      setParams({ q: v || null, page: null });
    }, 300);
    return () => clearTimeout(t);
  }, [query, qUrl, setParams]);

  // Atrás/adelante cambian la URL sin pasar por el recuadro: hay que bajarle el
  // valor. Se compara recortado, que es como va a la URL, para no comerle el
  // espacio final a quien sigue tecleando.
  //
  // Lo que llega de vuelta por haberlo mandado este mismo recuadro NO se baja:
  // quien escribe «mar», duda y sigue con «ia» mientras la dirección se
  // actualiza, perdía la «ia» al confirmarse «mar».
  useEffect(() => {
    if (ultimoEnviado.current === qUrl) { ultimoEnviado.current = null; return; }
    setQuery((actual) => (actual.trim() === qUrl ? actual : qUrl));
  }, [qUrl]);

  const cambiarPeriodo = (v: string) => setParams({ periodo: v === 'todos' ? null : v, page: null });
  const cambiarEstado  = (v: string) => setParams({ estado: v === 'todos' ? null : v, page: null });
  const irAPagina      = (p: number) => setParams({ page: p <= 1 ? null : p });

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
      // La última de la página deja la página vacía: se retrocede una.
      const retrocede = matriculas.length === 1 && pagina > 1;
      // La fila elegida y la página, en un solo cambio de URL.
      const cambios: Record<string, number | null> = {};
      if (selectedId === porBorrar.id) cambios.matricula = null;
      if (retrocede) cambios.page = pagina - 1 <= 1 ? null : pagina - 1;
      setParams(cambios);
      // Al retroceder, el cambio de página ya vuelve a pedir el listado.
      if (!retrocede) await cargarMatriculas();
    } catch (e: unknown) {
      setBorrarError(e instanceof Error ? e.message : 'No se pudo borrar la matrícula');
    } finally {
      setBorrando(false);
    }
  }

  const seleccionada = matriculas.find((m) => m.id === selectedId) ?? null;

  /**
   * «Nueva matrícula» y «Editar matrícula» son pantallas aparte. Se les pasa
   * ESTA, con sus filtros, su página y su fila elegida, para volver a ella.
   */
  const qs = urlParams.toString();
  const volverAqui = qs ? `/escolar/matriculas?${qs}` : '/escolar/matriculas';

  function abrirNueva() {
    router.push(rutaNuevaMatricula({ volver: volverAqui }));
  }

  function abrirEdicion(m: Matricula) {
    router.push(rutaEditarMatricula(m.id, volverAqui));
  }

  const sinCatalogos = estudiantesActivos.length === 0 || periodos.length === 0 || cursosActivos.length === 0;
  const periodoActivo = periodos.find((p) => p.activo);
  const filtrosActivos = qUrl !== '' || filtroPeriodo !== 'todos' || filtroEstado !== 'todos';

  return (
    <section className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matriculación</h1>
          <p className="text-sm text-gray-500 mt-1">Quién está inscrito en qué curso, y qué debe de ese período</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <ExportarListado armar={armarExport} deshabilitado={loading || paginaInfo.total === 0} testId="exportar-matriculas" />
        {/* Una sola entrada para matricular: «Nueva matrícula» y, en su flecha,
            en lote, desde SIGERD (con cuántos faltan) y servicios por alumno. */}
        {puedeGestionar && (
          <BotonMatricular onNueva={abrirNueva} onLote={() => setShowLote(true)}
            deshabilitado={loading || sinCatalogos} />
        )}
        </div>
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
            <Select value={filtroPeriodo} onValueChange={cambiarPeriodo}>
              <SelectTrigger className="sm:w-44"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Período: Todos</SelectItem>
                {periodos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={cambiarEstado}>
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
                      onClick={() => setParams({ matricula: m.id })}
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
                          {textoDeCurso(m.grado, m.curso, ' — ') || '—'}
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
            onCambiar={irAPagina}
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

      {/* Matricular a varios alumnos de la misma sección de una pasada. No se
          cierra al confirmar: enseña el resultado —quién entró, quién chocaba—
          antes de cerrarse. */}
      <MatriculaLoteDialog
        open={showLote}
        onClose={() => setShowLote(false)}
        onSaved={() => { void cargarMatriculas(); }}
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
