'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { SelectorCurso } from '@/components/administracion-escolar/SelectorCurso';
import { ConceptoPicker } from '@/components/administracion-escolar/ConceptoPicker';
import { fmtDOP } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { mesesDelPeriodo, type MesDelPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import { ArrowLeft, Check, Loader2, Plus, Search, Users } from 'lucide-react';

/**
 * Cobrarle lo mismo a un grupo: la excursión, el día de cine, la evaluación
 * del período.
 *
 * Tiene pantalla propia y no un diálogo porque lo que se decide aquí es una
 * LISTA de ciento cuarenta y cinco alumnos, no un formulario: dentro de un
 * modal cabían cinco nombres con scroll, y revisar a quién se le va a cobrar
 * —que es justo lo que hay que mirar antes de crear la deuda— se volvía
 * arrastrar una ventanita. Aquí el formulario ocupa una columna y la lista la
 * otra, con el alto de la pantalla.
 */

interface Periodo { id: number; nombre: string; fechaInicio: string | null; fechaFin: string | null; activo: boolean }
interface Curso {
  id: number; nombre: string; activo: boolean;
  gradoId: number; gradoNombre: string; gradoActivo: boolean;
  servicioId: number; servicioNombre: string; servicioTanda: string | null; servicioActivo: boolean;
  periodoId: number;
}
interface Concepto { id: number; nombre: string; tipo: string; activo: boolean }

/** Una línea de la revisión: a quién se le crearía el cargo y a quién no. */
interface DetalleGeneracion {
  estudianteId: number;
  matriculaId: number;
  nombre: string;
  codigo: string | null;
  resultado: 'crear' | 'creado' | 'duplicado';
}
interface Revision {
  creados: number;
  omitidos: number;
  total: number;
  detalles: DetalleGeneracion[];
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const hoy = () => new Date().toISOString().split('T')[0];

const EMPTY_FORM = {
  periodoId: '',
  cursoId: 'todos',
  conceptoId: '',
  mes: '',
  anio: String(new Date().getFullYear()),
  monto: '',
  fechaVencimiento: hoy(),
};

function mesInicial(periodo: Periodo | undefined): MesDelPeriodo | null {
  if (!periodo) return null;
  const meses = mesesDelPeriodo(periodo.fechaInicio, periodo.fechaFin);
  const ahora = new Date();
  return meses.find((m) => m.mes === ahora.getMonth() + 1 && m.anio === ahora.getFullYear()) ?? meses[0] ?? null;
}

function perteneceMes(periodo: Periodo | undefined, mes: string, anio: string) {
  if (!periodo) return false;
  return mesesDelPeriodo(periodo.fechaInicio, periodo.fechaFin)
    .some((m) => m.mes === Number(mes) && m.anio === Number(anio));
}

function toCentavos(value: string): number {
  const n = Number.parseFloat(value.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export default function CargoLoteClient() {
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  // Crear el concepto toca el CATÁLOGO del colegio, no solo la deuda de este
  // mes: va con el permiso de configurar, como en Configuración → Conceptos.
  const puedeConfigurar = permissions.includes('administracion-escolar:configurar');

  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [cargandoCat, setCargandoCat] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  /**
   * La revisión antes de crear: quién recibe el cargo y quién se omite.
   *
   * El botón creaba deuda sobre las matrículas del filtro de un clic y el
   * resultado se leía DESPUÉS, en el listado. Ahora el primero solo lee
   * (`dryRun`) y el segundo escribe exactamente lo que quedó marcado.
   */
  const [revision, setRevision] = useState<Revision | null>(null);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [revisando, setRevisando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState<{ creados: number; omitidos: number; total: number } | null>(null);
  /**
   * Inventar el cobro aquí mismo: nombre y precio.
   *
   * Lo que se cobra de esto no está en ningún catálogo cuando hace falta —«día
   * de cine, cien pesos», decidido el lunes para el viernes—, y mandar a la
   * secretaria a Configuración → Conceptos a darlo de alta, volver, y recordar
   * cuál era, es el motivo por el que estos cobros terminaban en una libreta.
   */
  const [nuevoNombre, setNuevoNombre] = useState<string | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [creandoConcepto, setCreandoConcepto] = useState(false);

  const cargarCatalogos = useCallback(async () => {
    setCargandoCat(true);
    try {
      const [p, c, k] = await Promise.all([
        fetch('/api/administracion-escolar/periodos').then((r) => r.json()),
        fetch('/api/administracion-escolar/cursos').then((r) => r.json()),
        fetch('/api/administracion-escolar/conceptos').then((r) => r.json()),
      ]);
      const listaPeriodos: Periodo[] = p.periodos ?? [];
      const listaConceptos: Concepto[] = k.conceptos ?? [];
      setPeriodos(listaPeriodos);
      setCursos(c.cursos ?? []);
      setConceptos(listaConceptos);

      // El año en curso y el primer mes puestos de entrada: es lo que se va a
      // elegir el noventa por ciento de las veces, y teclearlo cada vez solo
      // añade dos clics al mismo resultado.
      const activo = listaPeriodos.find((x) => x.activo);
      const primerMes = mesInicial(activo);
      setForm((f) => ({
        ...f,
        periodoId: activo ? String(activo.id) : f.periodoId,
        mes: String(primerMes?.mes ?? ''),
        anio: String(primerMes?.anio ?? f.anio),
      }));
    } catch {
      setError('No se pudieron cargar los catálogos del colegio');
    } finally {
      setCargandoCat(false);
    }
  }, []);

  useEffect(() => { void cargarCatalogos(); }, [cargarCatalogos]);

  const cursosActivos = useMemo(
    () => cursos.filter((c) => c.activo !== false && c.gradoActivo !== false && c.servicioActivo !== false),
    [cursos],
  );
  const conceptosActivos = useMemo(() => conceptos.filter((c) => c.activo !== false), [conceptos]);
  const conceptoSeleccionado = conceptos.find((c) => String(c.id) === form.conceptoId) ?? null;
  const periodoForm = periodos.find((p) => String(p.id) === form.periodoId);
  const mesesForm = mesesDelPeriodo(periodoForm?.fechaInicio, periodoForm?.fechaFin);
  const montoCentavos = toCentavos(form.monto);

  /** Cambiar cualquier dato del cargo invalida lo revisado: se vuelve a pedir. */
  const limpiarRevision = useCallback(() => {
    setRevision(null);
    setSeleccion(new Set());
    setQuery('');
  }, []);

  function cuerpo(dryRun: boolean) {
    return JSON.stringify({
      dryRun,
      periodoId: Number.parseInt(form.periodoId),
      cursoId: form.cursoId === 'todos' ? null : Number.parseInt(form.cursoId),
      conceptoId: Number.parseInt(form.conceptoId),
      mes: form.mes ? Number.parseInt(form.mes) : null,
      anio: Number.parseInt(form.anio),
      montoCentavos,
      fechaVencimiento: form.fechaVencimiento || null,
      // Lo que se marcó en la revisión, no el filtro: un cobro eventual casi
      // nunca es «toda la sección», es la lista de los que van.
      ...(dryRun ? {} : { estudianteIds: [...seleccion] }),
    });
  }

  async function revisar() {
    if (!form.periodoId || !form.conceptoId || !form.anio || montoCentavos <= 0) {
      setError('Período, concepto, año y monto son obligatorios');
      return;
    }
    if (conceptoSeleccionado?.tipo === 'mensualidad' && !form.mes) {
      setError('Selecciona el mes de la mensualidad');
      return;
    }
    setRevisando(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch('/api/administracion-escolar/cargos/generar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo(true),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo revisar');
      setRevision(data as Revision);
      // Vienen marcados los que pueden recibirlo. Los duplicados no: marcarlos
      // sugeriría que se les va a cobrar otra vez.
      setSeleccion(new Set(
        (data.detalles as DetalleGeneracion[]).filter((d) => d.resultado === 'crear').map((d) => d.estudianteId),
      ));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo revisar');
    } finally {
      setRevisando(false);
    }
  }

  async function crear() {
    if (seleccion.size === 0) { setError('No hay ningún alumno marcado'); return; }
    setCreando(true);
    setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/cargos/generar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo(false),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando los cargos');
      setResultado(data);
      limpiarRevision();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error creando los cargos');
    } finally {
      setCreando(false);
    }
  }

  async function crearConcepto() {
    const nombre = (nuevoNombre ?? '').trim();
    if (!nombre) { setError('Ponle un nombre al cobro'); return; }
    const precioCentavos = toCentavos(nuevoPrecio);
    setCreandoConcepto(true);
    setError(null);
    try {
      const res = await fetch('/api/administracion-escolar/conceptos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // 'otro' y no 'mensualidad': esto es un cobro suelto. El tipo decide la
        // frecuencia —la mensualidad nace mensual y generaría once cuotas— y
        // decide también en qué pestaña de la ficha aparece el cargo.
        body: JSON.stringify({ nombre, tipo: 'otro' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear el concepto');
      const creado: Concepto = data.concepto;
      setConceptos((lista) => [...lista, creado]);
      limpiarRevision();
      // Queda elegido y con su precio puesto: escribirlo dos veces es la forma
      // de que el cargo salga con un monto distinto del que se acaba de decir.
      setForm((f) => ({
        ...f,
        conceptoId: String(creado.id),
        mes: '',
        ...(precioCentavos > 0 ? { monto: String(precioCentavos / 100) } : {}),
      }));
      setNuevoNombre(null);
      setNuevoPrecio('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el concepto');
    } finally {
      setCreandoConcepto(false);
    }
  }

  const visibles = useMemo(() => {
    if (!revision) return [];
    const q = query.trim().toLowerCase();
    if (!q) return revision.detalles;
    return revision.detalles.filter((d) => `${d.nombre} ${d.codigo ?? ''}`.toLowerCase().includes(q));
  }, [revision, query]);

  const marcables = revision?.detalles.filter((d) => d.resultado !== 'duplicado') ?? [];
  const todosMarcados = marcables.length > 0 && marcables.every((d) => seleccion.has(d.estudianteId));

  function alternar(id: number) {
    const siguiente = new Set(seleccion);
    if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
    setSeleccion(siguiente);
  }

  if (!puedeGestionar) {
    return (
      <section className="p-6">
        <Volver />
        <p className="mt-6 text-gray-500">No tienes permiso para crear cargos.</p>
      </section>
    );
  }

  return (
    <section className="p-6 space-y-5">
      <Volver />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cargo a varios alumnos</h1>
        <p className="mt-1 text-sm text-gray-500">
          El mismo cargo para un grupo: la excursión, el día de cine, la evaluación del período.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {resultado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zero-200 bg-zero-50 p-3 text-sm text-zero-800">
          <span>
            Creados: <b>{resultado.creados}</b>. Omitidos por duplicado: {resultado.omitidos}.
            {' '}Total evaluado: {resultado.total}.
          </span>
          <Link href="/escolar/cargos" className="font-medium text-zero-700 hover:underline">
            Ver los cargos
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        {/* Qué se cobra. Se queda a la vista mientras se repasa la lista: sin
            esto, comprobar el monto obligaba a cerrar la revisión. */}
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 lg:sticky lg:top-6">
          <div className="space-y-1.5">
            <Label>Período *</Label>
            <NativeSelect value={form.periodoId} disabled={cargandoCat} onChange={(e) => {
              const periodo = periodos.find((p) => String(p.id) === e.target.value);
              const siguiente = mesInicial(periodo);
              limpiarRevision();
              setForm((f) => ({
                ...f,
                periodoId: e.target.value,
                cursoId: 'todos',
                ...(perteneceMes(periodo, f.mes, f.anio)
                  ? {}
                  : { mes: String(siguiente?.mes ?? ''), anio: String(siguiente?.anio ?? f.anio) }),
              }));
            }}>
              <option value="" disabled>Período</option>
              {periodos.map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
            </NativeSelect>
          </div>

          {/* Servicio → grado → sección. Acota a quién se le pregunta; quién
              lo recibe se decide marcando en la lista. */}
          <SelectorCurso
            permitirTodos
            cursos={cursosActivos}
            periodoId={Number(form.periodoId) || null}
            valor={form.cursoId}
            onChange={(v) => { limpiarRevision(); setForm((f) => ({ ...f, cursoId: v || 'todos' })); }}
          />

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label>Concepto *</Label>
              {puedeConfigurar && nuevoNombre === null && (
                <button type="button" onClick={() => setNuevoNombre('')}
                  className="text-xs font-medium text-zero-600 hover:text-zero-800">
                  + Crear uno nuevo
                </button>
              )}
            </div>

            {/* Nombre y precio, y ya está cobrando. El precio no se guarda como
                tarifa del concepto —una tarifa cuelga de un servicio o un
                grado, y esto no es de ninguno— sino que queda puesto como monto
                por estudiante, que es lo que se va a cobrar. */}
            {nuevoNombre !== null && (
              <div className="space-y-2 rounded-lg border border-zero-200 bg-zero-50/60 p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nombre del cobro</Label>
                  <Input autoFocus placeholder="Ej: Día de cine" value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void crearConcepto(); }
                      if (e.key === 'Escape') { e.preventDefault(); setNuevoNombre(null); }
                    }} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Precio por estudiante (RD$)</Label>
                  <Input type="number" step="0.01" placeholder="100.00" value={nuevoPrecio}
                    onChange={(e) => setNuevoPrecio(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crearConcepto(); } }} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-zero-600 hover:bg-zero-700"
                    onClick={() => void crearConcepto()} disabled={creandoConcepto}>
                    {creandoConcepto
                      ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Creando…</>
                      : <><Plus className="mr-1.5 h-4 w-4" />Crear y usarlo</>}
                  </Button>
                  <Button size="sm" variant="outline" disabled={creandoConcepto}
                    onClick={() => { setNuevoNombre(null); setNuevoPrecio(''); }}>
                    Cancelar
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Queda en el catálogo del colegio como cobro suelto, listo para volver a usarlo.
                </p>
              </div>
            )}

            <ConceptoPicker
              conceptos={conceptosActivos}
              value={form.conceptoId}
              onConceptoCreado={() => void cargarCatalogos()}
              onChange={(id) => {
                const concepto = conceptos.find((c) => String(c.id) === id);
                const siguiente = mesInicial(periodoForm);
                limpiarRevision();
                setForm((f) => ({
                  ...f,
                  conceptoId: id,
                  ...(concepto?.tipo === 'mensualidad'
                    ? (perteneceMes(periodoForm, f.mes, f.anio)
                      ? {}
                      : { mes: String(siguiente?.mes ?? ''), anio: String(siguiente?.anio ?? f.anio) })
                    : { mes: '' }),
                }));
              }}
            />
          </div>

          {conceptoSeleccionado?.tipo === 'mensualidad' ? (
            <div className="space-y-1.5">
              <Label>Mes de la mensualidad *</Label>
              {mesesForm.length === 0 ? (
                <p className="text-xs text-amber-700">
                  Configura fecha de inicio y fin del período antes de crear una mensualidad.
                </p>
              ) : (
                <NativeSelect
                  value={`${form.anio}-${String(form.mes).padStart(2, '0')}`}
                  onChange={(e) => {
                    const elegido = mesesForm.find((m) => m.key === e.target.value);
                    if (!elegido) return;
                    limpiarRevision();
                    setForm((f) => ({ ...f, mes: String(elegido.mes), anio: String(elegido.anio) }));
                  }}>
                  {mesesForm.map((m) => <option key={m.key} value={m.key}>{MESES[m.mes]} {m.anio}</option>)}
                </NativeSelect>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Año *</Label>
              <Input type="number" value={form.anio}
                onChange={(e) => { limpiarRevision(); setForm((f) => ({ ...f, anio: e.target.value })); }} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monto por estudiante (RD$) *</Label>
              <Input type="number" step="0.01" placeholder="200.00" value={form.monto}
                onChange={(e) => { limpiarRevision(); setForm((f) => ({ ...f, monto: e.target.value })); }} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha vencimiento</Label>
              <Input type="date" value={form.fechaVencimiento}
                onChange={(e) => { limpiarRevision(); setForm((f) => ({ ...f, fechaVencimiento: e.target.value })); }} />
            </div>
          </div>

          <Button className="w-full bg-zero-600 hover:bg-zero-700" onClick={() => void revisar()}
            disabled={revisando || cargandoCat}>
            {revisando
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Revisando…</>
              : <><Users className="mr-1.5 h-4 w-4" />{revision ? 'Volver a revisar' : 'Revisar a quién se le cobra'}</>}
          </Button>
        </div>

        {/* A quién se le cobra. Ocupa dos tercios y el alto de la pantalla:
            son ciento cuarenta y cinco nombres que hay que repasar, no un
            resumen que se lee de un vistazo. */}
        <div className="flex min-h-[32rem] flex-col rounded-xl border border-gray-200 bg-white lg:col-span-2 lg:h-[calc(100vh-13rem)]">
          {revision === null ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <Users className="h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">Aquí sale la lista de alumnos</p>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Llena lo que se cobra y pulsa «Revisar»: verás uno por uno a quién se le crea el cargo,
                podrás quitar a los que no van, y solo entonces se crea.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-600">
                  <span className="text-base font-semibold text-gray-900">{seleccion.size}</span>
                  {' '}marcado(s) de {revision.total}
                  {revision.omitidos > 0 && (
                    <span className="text-gray-500"> · {revision.omitidos} ya lo tienen</span>
                  )}
                </span>
                <span className="text-base font-semibold text-gray-900">
                  {fmtDOP(seleccion.size * montoCentavos)}
                </span>
              </div>

              <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input className="pl-8" placeholder="Buscar en la lista…" value={query}
                    onChange={(e) => setQuery(e.target.value)} />
                </div>
                <Button type="button" variant="outline"
                  onClick={() => setSeleccion(todosMarcados
                    ? new Set()
                    : new Set(marcables.map((d) => d.estudianteId)))}>
                  {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {visibles.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-500">Ningún alumno con ese nombre.</p>
                ) : visibles.map((d) => {
                  const duplicado = d.resultado === 'duplicado';
                  return (
                    <label key={d.estudianteId}
                      className={`flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-b-0 ${
                        duplicado ? 'bg-gray-50' : 'cursor-pointer hover:bg-gray-50'}`}>
                      <input type="checkbox" className="h-4 w-4 rounded border-gray-300"
                        disabled={duplicado}
                        checked={seleccion.has(d.estudianteId)}
                        onChange={() => alternar(d.estudianteId)} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${duplicado ? 'text-gray-400' : 'text-gray-900'}`}>
                          {d.nombre}
                        </span>
                        {d.codigo && <span className="block text-xs text-gray-400">{d.codigo}</span>}
                      </span>
                      {duplicado && (
                        <Badge variant="outline" className="shrink-0 text-gray-400">Ya lo tiene</Badge>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* La barra de crear vive abajo y fija: con ciento cuarenta y
                  cinco nombres, un botón al final de la lista queda a seis
                  pantallas de scroll de lo que se acaba de marcar. */}
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">
                  Los que ya lo tienen no se pueden marcar: no se les cobra dos veces.
                </p>
                <Button className="bg-zero-600 hover:bg-zero-700" onClick={() => void crear()}
                  disabled={creando || seleccion.size === 0}>
                  {creando
                    ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Creando…</>
                    : <><Check className="mr-1.5 h-4 w-4" />Crear {seleccion.size} cargo{seleccion.size === 1 ? '' : 's'}</>}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Volver() {
  return (
    <Link href="/escolar/cargos"
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900">
      <ArrowLeft className="h-4 w-4" />Volver a cargos
    </Link>
  );
}
