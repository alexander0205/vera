'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Users, CalendarDays, Wallet, AlertTriangle, Plus, Search, Loader2,
  ChevronLeft, ChevronRight, UserPlus, Download, Contact, CloudDownload, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { fmtDOP } from '@/lib/utils/format';
import { EstudianteFicha, type EstudianteEnriquecido } from '@/components/administracion-escolar/EstudianteFicha';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useUrlParams } from '@/lib/hooks/useUrlEstado';
import { TraerDeContactosDialog } from '@/components/administracion-escolar/TraerDeContactosDialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ModalHeader } from '@/components/ui/modal-header';

const ESTADOS = ['activo', 'inactivo', 'retirado', 'graduado'];
const PAGE_SIZE = 25;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ListaResp {
  estudiantes: EstudianteEnriquecido[];
  total: number;
  /** Beneficiarios de Contactos que aún no son alumnos, filtre la pantalla o no. */
  sinMatricular: number;
  stats: { activos: number; balancePendienteCentavos: number; morosos: number };
}
interface Curso { id: number; nombre: string }
interface Periodo { activo: boolean; nombre: string }

function iniciales(nombres: string, apellidos: string): string {
  return `${nombres[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase();
}

export default function EstudiantesClient() {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  const irANuevo = () => router.push('/escolar/estudiantes/nuevo');

  /**
   * Filtros y alumno seleccionado viven en la URL, no en `useState`.
   *
   * Con estado local, recargar perdía lo que estabas mirando, el enlace a un
   * listado filtrado no le servía a nadie más, y el botón de atrás —que el
   * usuario usa para deshacer el filtro— te sacaba de la pantalla entera.
   *
   * Los valores por defecto (estado «activo», curso «todos», página 1) NO se
   * escriben: la URL normal se queda limpia y solo dice lo que se ha tocado.
   */
  const { params: urlParams, setParams } = useUrlParams();

  const qUrl = urlParams.get('q') ?? '';
  const filtroCurso = urlParams.get('curso') ?? 'todos';
  const estadoCrudo = urlParams.get('estado') ?? 'activo';
  // Lo que venga de fuera se valida: un ?estado=cualquiercosa escrito a mano
  // llegaría tal cual a la consulta del servidor.
  const filtroEstado = estadoCrudo === 'todos' || ESTADOS.includes(estadoCrudo) ? estadoCrudo : 'activo';
  // La página se enseña en base 1 (es la que se ve al lado del paginador) y por
  // dentro se usa en base 0, que es el offset.
  const paginaUrl = Number(urlParams.get('page'));
  const page = Number.isFinite(paginaUrl) && paginaUrl > 1 ? Math.floor(paginaUrl) - 1 : 0;
  // `Number(null)` es 0 y `Number('abc')` es NaN: los dos caen en null.
  const selectedId = Number(urlParams.get('alumno')) || null;

  /**
   * El texto del buscador SÍ es estado local, además del de la URL.
   *
   * Lo que se escribe en la URL es el valor ya rebotado (300 ms); si fuera cada
   * tecla, buscar un apellido dejaría ocho entradas de basura por las que el
   * usuario tendría que pasar. El input se alimenta de este estado para no ir a
   * tirones mientras se teclea.
   */
  const [query, setQuery] = useState(qUrl);
  const [traerAbierto, setTraerAbierto] = useState(false);
  // Se enseña cuando se pide traer de SIGERD sin sesión con el portal.
  const [sigerdSinSesion, setSigerdSinSesion] = useState(false);

  /**
   * Traer de SIGERD exige estar dentro del portal del MINERD, y esa sesión no
   * es la de Zero: caduca por su cuenta. Se comprueba al pulsar y no al pintar
   * la pantalla —una llamada al portal por cada visita al listado sería un
   * peaje que casi nadie usa— y si no hay, se manda a conectarla en vez de
   * dejar que falle a mitad.
   */
  async function irASigerd() {
    try {
      const r = await fetch('/api/sigerd/sesion');
      const j = await r.json().catch(() => ({}));
      if (j?.conectado) { router.push('/escolar/sigerd'); return; }
    } catch { /* sin conexión con el portal = sin sesión */ }
    setSigerdSinSesion(true);
  }

  // Debounce de la búsqueda (300 ms) — evita una llamada por tecla y, ahora,
  // una entrada de historial por tecla. Cambiar la búsqueda vuelve a la
  // página 1: los resultados son otros y el offset viejo no significa nada.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = query.trim();
      if (v === qUrl) return;
      setParams({ q: v || null, page: null });
    }, 300);
    return () => clearTimeout(t);
  }, [query, qUrl, setParams]);

  /**
   * Atrás/adelante cambian la URL sin pasar por el input: hay que bajar el
   * valor al recuadro o se quedaría enseñando lo que ya no se está buscando.
   *
   * Se compara contra el texto RECORTADO porque lo que va a la URL va recortado:
   * sin eso, escribir «juan » y parar un segundo borraba el espacio final
   * mientras el usuario seguía tecleando el apellido.
   */
  useEffect(() => {
    setQuery((actual) => (actual.trim() === qUrl ? actual : qUrl));
  }, [qUrl]);

  // Key del listado — SWR cachea por combinación de filtros+página.
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    estado: filtroEstado,
  });
  if (qUrl) params.set('q', qUrl);
  if (filtroCurso !== 'todos') params.set('cursoId', filtroCurso);
  const listaKey = `/api/administracion-escolar/estudiantes?${params.toString()}`;

  const { data, isLoading, mutate } = useSWR<ListaResp>(listaKey, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  const { data: cursosData } = useSWR<{ cursos: Curso[] }>(
    '/api/administracion-escolar/cursos', fetcher, { revalidateOnFocus: false });
  const { data: periodosData } = useSWR<{ periodos: Periodo[] }>(
    '/api/administracion-escolar/periodos', fetcher, { revalidateOnFocus: false });

  const estudiantes = data?.estudiantes ?? [];
  const total = data?.total ?? 0;
  const stats = data?.stats;
  const cursos = cursosData?.cursos ?? [];
  const periodoActivo = periodosData?.periodos?.find((p) => p.activo)?.nombre ?? null;

  // Los beneficiarios sin ficha escolar no tienen curso ni estado, así que el
  // servidor los deja fuera en cuanto se filtra por uno de los dos. El aviso de
  // abajo existe porque el estado viene en 'activo' por defecto: sin él, esos
  // beneficiarios seguirían siendo invisibles.
  const sinMatricular = data?.sinMatricular ?? 0;

  // La ficha lateral solo aplica a alumnos del módulo: el id de un beneficiario
  // es de otra tabla y pedir sus cargos traería los de un alumno cualquiera.
  const seleccionado = estudiantes.find((e) => e.origen === 'estudiante' && e.id === selectedId) ?? null;

  // Alta express del beneficiario como alumno (sin matrícula: eso viene después).
  const [creando, setCreando] = useState<number | null>(null);
  async function crearAlumnoDesdeContacto(dependienteId: number) {
    setCreando(dependienteId);
    try {
      const r = await fetch('/api/administracion-escolar/estudiantes/desde-dependiente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependienteId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo crear el alumno');
      toast.success('Alumno creado. Falta inscribirlo: usa «Inscribir» en su perfil.');
      await mutate();
      if (j.estudiante?.id) setParams({ alumno: j.estudiante.id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el alumno');
    } finally {
      setCreando(null);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const hasta = Math.min((page + 1) * PAGE_SIZE, total);
  const filtrosActivos = qUrl !== '' || filtroCurso !== 'todos';

  // Curso y estado van con la página en la MISMA escritura: son un solo cambio
  // para el usuario, y en dos llamadas seguidas la segunda pisaba a la primera
  // (las dos parten de la query de este render).
  const cambiarCurso  = (v: string) => setParams({ curso: v === 'todos' ? null : v, page: null });
  const cambiarEstado = (v: string) => setParams({ estado: v === 'activo' ? null : v, page: null });
  // Recibe el índice en base 0 y escribe la página tal como se ve, en base 1.
  const irAPagina = (i: number) => setParams({ page: i <= 0 ? null : i + 1 });

  return (
    <section className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estudiantes</h1>
          <p className="text-sm text-gray-500 mt-1">Matrículas, tutores, pagos y deudas por estudiante</p>
        </div>
        {puedeGestionar && (
          <div className="flex shrink-0 items-center gap-2">
            {/* El censo del colegio ya existe en Contactos: los beneficiarios a
                los que se les factura SON los alumnos. Esto los trae en lote,
                que uno a uno son cientos de clics. */}
            {/* Dos fuentes para lo mismo: el padrón del MINERD y los
                beneficiarios a los que ya se les factura. Se agrupan porque son
                la misma pregunta —«¿de dónde saco los alumnos?»— y tenerlas
                sueltas en la cabecera obligaba a elegir antes de entender. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={() => void irASigerd()}>
                  <CloudDownload className="h-4 w-4" />
                  <span className="flex-1">Desde SIGERD</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTraerAbierto(true)}>
                  <Contact className="h-4 w-4" />
                  <span className="flex-1">Desde Contactos</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={irANuevo}>
              <Plus className="h-4 w-4 mr-2" />Nuevo estudiante
            </Button>
          </div>
        )}
      </div>


      {/* Stat cards — globales del team (no dependen de la página) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Estudiantes activos" value={stats ? String(stats.activos) : '—'} />
        <StatCard icon={CalendarDays} label="Período activo" value={periodoActivo ?? '—'} />
        <StatCard icon={Wallet} label="Balance pendiente" value={stats ? fmtDOP(stats.balancePendienteCentavos) : '—'} />
        <StatCard icon={AlertTriangle} label="Morosos" value={stats ? String(stats.morosos) : '—'} accent={(stats?.morosos ?? 0) > 0} />
      </div>

      {/* Directorio + ficha */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Directorio. Sin nadie seleccionado ocupa el ancho entero: la ficha
            lateral vacía se comía un tercio de la pantalla y la tabla salía
            cortada por la derecha con las columnas apretadas. */}
        <Card className={seleccionado ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Directorio de estudiantes</h2>
              <Badge variant="outline" className="text-zero-700 border-zero-200 bg-zero-50">
                {total} registro{total !== 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="pl-8" placeholder="Buscar por nombre, código o tutor…"
                  value={query} onChange={(e) => setQuery(e.target.value)} />
                {isLoading && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-zero-500" />
                )}
              </div>
              <Select value={filtroCurso} onValueChange={cambiarCurso}>
                <SelectTrigger className="sm:w-40"><SelectValue placeholder="Curso" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Curso: Todos</SelectItem>
                  {cursos.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroEstado} onValueChange={cambiarEstado}>
                <SelectTrigger className="sm:w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Estado: Todos</SelectItem>
                  {ESTADOS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Los beneficiarios de Contactos NO se listan aquí: este es el
                directorio de alumnos. Solo se avisa de cuántos hay por traer y
                se manda al diálogo, que además deja elegir cuáles. */}
            {sinMatricular > 0 && puedeGestionar && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-zero-200 bg-zero-50 px-3 py-2 text-sm text-zero-800">
                <span>
                  Hay {sinMatricular} beneficiario{sinMatricular !== 1 ? 's' : ''} en Contactos
                  {sinMatricular !== 1 ? ' que no son alumnos' : ' que no es alumno'} todavía.
                </span>
                <Button variant="outline" size="sm" className="shrink-0"
                  onClick={() => setTraerAbierto(true)}>
                  Traerlos
                </Button>
              </div>
            )}

            {/* Tabla */}
            {isLoading && !data ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>
            ) : total === 0 ? (
              <div className="text-center py-16">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">
                  {filtrosActivos ? 'Sin resultados para los filtros' : 'Aún no hay estudiantes registrados'}
                </p>
                {!filtrosActivos && puedeGestionar && (
                  <Button className="mt-4 bg-zero-600 hover:bg-zero-700" size="sm" onClick={irANuevo}>
                    <Plus className="h-4 w-4 mr-1" />Nuevo estudiante
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                        <th className="px-3 py-2 font-medium">Estudiante</th>
                        <th className="px-3 py-2 font-medium">Curso</th>
                        <th className="px-3 py-2 font-medium">Contacto</th>
                        <th className="px-3 py-2 font-medium">Tutor</th>
                        <th className="px-3 py-2 font-medium text-right">Balance</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estudiantes.map((e) => {
                        // Beneficiario de Contactos sin ficha escolar: su `id` es
                        // de otra tabla, así que ni abre ficha ni tiene derivados.
                        const deContactos = e.origen === 'dependiente';
                        return (
                        <tr key={`${e.origen}-${e.id}`}
                          onClick={deContactos ? undefined : () => setParams({ alumno: e.id })}
                          className={`border-t border-gray-100 transition-colors ${
                            deContactos
                              ? 'bg-amber-50/40'
                              : e.id === selectedId ? 'bg-zero-50 cursor-pointer' : 'hover:bg-gray-50 cursor-pointer'
                          }`}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                                deContactos ? 'bg-amber-100 text-amber-700' : 'bg-zero-100 text-zero-700'
                              }`}>
                                {iniciales(e.nombres, e.apellidos)}
                              </div>
                              <div className="min-w-0">
                                {/* En div y no en <p>: el Badge es un Chip de MUI
                                    (un div) y dentro de un párrafo el HTML queda
                                    inválido y React avisa al hidratar. */}
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-medium text-gray-900 truncate">{e.nombres} {e.apellidos}</span>
                                  {deContactos && (
                                    <Badge variant="outline" className="shrink-0 text-amber-700 border-amber-200 bg-amber-50">
                                      De Contactos
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">{e.codigo ?? '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">{e.cursoActual ?? '—'}</td>
                          <td className="max-w-[12rem] truncate px-3 py-2.5 text-gray-600"
                            title={e.contacto ?? undefined}>
                            {e.contacto ?? '—'}
                          </td>
                          <td className="max-w-[12rem] truncate px-3 py-2.5 text-gray-600"
                            title={e.tutorResponsable ?? undefined}>
                            {e.tutorResponsable ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            {deContactos
                              ? <span className="text-gray-400">—</span>
                              : (e.deudaCentavos ?? 0) > 0
                                ? <Badge className="bg-red-50 text-red-600 border-red-200">{fmtDOP(e.deudaCentavos ?? 0)}</Badge>
                                : <Badge className="bg-zero-50 text-zero-700 border-zero-200">Al día</Badge>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {!deContactos ? (
                              <span className="text-xs capitalize text-gray-600">{e.estado}</span>
                            ) : puedeGestionar ? (
                              <Button variant="outline" size="sm" className="text-xs"
                                disabled={creando === e.id}
                                onClick={() => crearAlumnoDesdeContacto(e.id)}>
                                {creando === e.id
                                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                  : <UserPlus className="h-3.5 w-3.5 mr-1" />}
                                Crear alumno
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-500">Sin matricular</span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>



                {/* Paginación */}
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Mostrando {desde}–{hasta} de {total}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0}
                      onClick={() => irAPagina(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="tabular-nums">{page + 1} / {totalPaginas}</span>
                    <Button variant="outline" size="sm" disabled={page + 1 >= totalPaginas}
                      onClick={() => irAPagina(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Ficha lateral: solo cuando hay a quién enseñar. */}
        {seleccionado && (
          <div>
            <EstudianteFicha key={seleccionado.id} estudiante={seleccionado} />
          </div>
        )}
      </div>
      {/* Va al FINAL del árbol a propósito, aunque su botón esté arriba.
          MUI y Radix generan sus `id` y `aria-controls` con `useId`, que
          numera por posición: colgado entre la cabecera y los filtros, este
          diálogo corría la numeración del buscador y de los dos selects y el
          HTML del servidor dejaba de cuadrar con el del cliente. Detrás de
          todo no hay a quién correr. */}
      <TraerDeContactosDialog
        open={traerAbierto}
        onOpenChange={setTraerAbierto}
        onImportado={() => void mutate()}
      />

      <Dialog open={sigerdSinSesion} onOpenChange={setSigerdSinSesion}>
        <DialogContent className="max-w-sm">
          <ModalHeader
            title="Primero entra a SIGERD"
            subtitle="Para traer alumnos del padrón hay que estar dentro del portal del MINERD con la cuenta del centro."
          />
          <p className="px-6 py-2 text-sm text-gray-500">
            Es una sesión aparte de la de Zero y caduca sola, así que hay que
            volver a entrar cada cierto tiempo.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSigerdSinSesion(false)}>Cancelar</Button>
            <Button onClick={() => router.push('/escolar/configuracion/sigerd')}>
              <ExternalLink className="mr-1.5 h-4 w-4" />Conectar SIGERD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />{label}
        </div>
        <p className={`text-2xl font-bold mt-1 truncate ${accent ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
