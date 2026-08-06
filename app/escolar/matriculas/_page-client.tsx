'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Paginador } from '@/components/ui/paginador';
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
import { BuscadorSelect, type OpcionBuscador } from '@/components/ui/buscador-select';
import { ModalHeaderIcon } from '@/components/ui/modal-header-icon';
import { AlertTriangle, CalendarDays, ClipboardList, GraduationCap, Loader2, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
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
/** El grado y la tanda a los que pertenece una sección, para leerla sola. */
function etiquetaGrado(c: Curso): string {
  const tanda = c.servicioTanda ? ` · ${c.servicioTanda}` : '';
  return `${c.gradoNombre} — ${c.servicioNombre}${tanda}`;
}

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
/** Un cargo ya creado, tal como está en la cuenta del alumno. */
interface CargoMatricula {
  id: number;
  concepto: string | null;
  mes: number | null;
  anio: number;
  montoCentavos: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  estado: string;
}

interface CuotaPlan {
  cuotaId: number; numero: number; etiqueta: string; mes: number | null;
  fechaVencimiento: string; montoCentavos: number; vencida: boolean;
}
interface LineaPlan {
  conceptoId: number; nombre: string; tipo: string; porDefecto: boolean;
  admiteBeca: boolean; montoCentavos: number; origen: string;
  cuotas: CuotaPlan[]; totalCentavos: number; omitidas: number;
}

/** Último día del mes de una fecha ISO: hasta ahí se cobra al matricular. */
function finDeMes(fecha: string): string {
  const [anio, mes] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

const fmtRD = (centavos: number) =>
  `RD$${(centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "2 cuotas · 15 ago y 15 ene" — el calendario en una línea. */
function resumenCuotas(l: LineaPlan): string {
  const vigentes = l.cuotas.filter((c) => !c.vencida);
  if (vigentes.length === 0) return 'sin cuotas pendientes';
  if (vigentes.length === 1) return `1 pago · vence ${fmtFechaCorta(vigentes[0].fechaVencimiento)}`;
  const iguales = vigentes.every((c) => c.montoCentavos === vigentes[0].montoCentavos);
  const monto = iguales ? ` de ${fmtRD(vigentes[0].montoCentavos)}` : '';
  return `${vigentes.length} cuotas${monto} · desde ${fmtFechaCorta(vigentes[0].fechaVencimiento)}`;
}

const EMPTY_FORM = { estudianteId: '', periodoId: '', cursoId: '', codigoMatricula: '', fechaInscripcion: hoy(), notas: '', estado: 'activa' };

const ESTADOS = [
  { valor: 'activa',     etiqueta: 'Activa' },
  { valor: 'finalizada', etiqueta: 'Finalizada' },
  { valor: 'retirada',   etiqueta: 'Retirada' },
  { valor: 'anulada',    etiqueta: 'Anulada' },
];

function estadoBadge(estado: string) {
  if (estado === 'activa') return <Badge className="bg-zero-50 text-zero-700 border-zero-200">Activa</Badge>;
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
  /** La matrícula que se está editando; `null` mientras se crea una nueva. */
  const [editando, setEditando]     = useState<Matricula | null>(null);
  const [porBorrar, setPorBorrar]   = useState<Matricula | null>(null);
  /** Lo que va a deber el alumno según el curso elegido. */
  const [plan, setPlan]             = useState<LineaPlan[]>([]);
  const [planCargando, setPlanCargando] = useState(false);
  const [planError, setPlanError]   = useState<string | null>(null);
  /** Conceptos marcados. Se guarda aparte del plan para no perder lo que el
   *  usuario desmarcó cuando el plan se recarga por cambiar de curso. */
  const [marcados, setMarcados]     = useState<Set<number>>(new Set());
  /** Los cargos que YA tiene la matrícula que se está editando. */
  const [cargosActuales, setCargosActuales] = useState<CargoMatricula[]>([]);
  const [cargosCargando, setCargosCargando] = useState(false);
  const [borrando, setBorrando]     = useState(false);
  const [borrarError, setBorrarError] = useState<string | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [opError, setOpError]       = useState<string | null>(null);

  // Paginado en el servidor: las matrículas se acumulan curso tras curso.
  const [pagina, setPagina] = useState(1);
  const [paginaInfo, setPaginaInfo] = useState({ total: 0, paginas: 1, porPagina: 50 });

  const cargarMatriculas = useCallback(async () => {
    const params = new URLSearchParams({ pagina: String(pagina) });
    if (filtroPeriodo !== 'todos') params.set('periodoId', filtroPeriodo);
    const res = await fetch(`/api/administracion-escolar/matriculas?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error cargando matrículas');
    setMatriculas(data.matriculas ?? []);
    setPaginaInfo({ total: data.total ?? 0, paginas: data.paginas ?? 1, porPagina: data.porPagina ?? 50 });
  }, [filtroPeriodo, pagina]);

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
  // Una sección de un grado o servicio dado de baja tampoco se ofrece:
  // matricular ahí dejaría al alumno colgando de una estructura que ya nadie
  // mantiene.
  const cursosActivos = useMemo(
    () => cursos.filter((c) =>
      c.activo !== false && c.gradoActivo !== false && c.servicioActivo !== false),
    [cursos],
  );

  /**
   * Las secciones del período elegido, agrupadas por grado.
   *
   * Se filtran por período porque cada servicio cuelga de un año escolar: sin
   * el filtro el desplegable ofrecía secciones de años pasados, y matricular
   * ahí es un error que después nadie encuentra.
   *
   * Se agrupan porque el nombre de una sección es solo la letra: una lista
   * plana salía como "A, A, A, B, B…" sin forma de elegir. Y el grado por sí
   * solo no basta —dos tandas tienen grados que se llaman igual—, así que la
   * etiqueta lleva también el servicio.
   */
  /** Los alumnos, con el código debajo para separar a los que se llaman igual. */
  const opcionesEstudiante = useMemo<OpcionBuscador[]>(
    () => estudiantesActivos.map((e) => ({
      valor: String(e.id),
      etiqueta: `${e.nombres} ${e.apellidos}`,
      detalle: e.codigo ?? undefined,
    })),
    [estudiantesActivos],
  );

  const cursosPorGrado = useMemo(() => {
    const periodo = Number(form.periodoId) || null;
    const grupos: { clave: string; etiqueta: string; cursos: Curso[] }[] = [];
    for (const c of cursosActivos) {
      if (periodo && c.periodoId !== periodo) continue;
      const clave = String(c.gradoId);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.clave === clave) ultimo.cursos.push(c);
      else grupos.push({ clave, etiqueta: etiquetaGrado(c), cursos: [c] });
    }
    return grupos;
  }, [cursosActivos, form.periodoId]);

  /** Las secciones aplanadas, cada una bajo el encabezado de su grado. */
  const opcionesCurso = useMemo<OpcionBuscador[]>(
    () => cursosPorGrado.flatMap((g) =>
      g.cursos.map((c) => ({
        valor: String(c.id),
        etiqueta: `${g.etiqueta} — ${c.nombre}`,
        etiquetaLista: c.nombre,
        grupo: g.etiqueta,
      })),
    ),
    [cursosPorGrado],
  );

  /**
   * Al editar se traen los cargos REALES de la matrícula.
   *
   * No el plan: el plan dice lo que tocaría cobrar hoy según la configuración,
   * y eso ya no describe a un alumno matriculado hace meses —le han podido
   * anular una cuota, cambiarle el monto o facturarle a mano. Lo que hay que
   * enseñar al editar es su cuenta, no la teoría.
   */
  useEffect(() => {
    if (!showForm || !editando) { setCargosActuales([]); return; }
    let vigente = true;
    setCargosCargando(true);
    fetch(`/api/administracion-escolar/cargos?matriculaId=${editando.id}&porPagina=200`)
      .then((res) => res.json())
      .then((data) => { if (vigente) setCargosActuales(data.cargos ?? []); })
      .catch(() => { if (vigente) setCargosActuales([]); })
      .finally(() => { if (vigente) setCargosCargando(false); });
    return () => { vigente = false; };
  }, [showForm, editando]);

  /**
   * Trae el plan cada vez que cambia la sección, el período o la fecha.
   *
   * Solo al crear: en una matrícula ya existente los cargos ya están hechos y
   * volver a enseñar el plan invitaría a duplicarlos.
   */
  useEffect(() => {
    if (!showForm || editando || !form.periodoId || !form.cursoId) {
      setPlan([]); setPlanError(null); return;
    }
    let vigente = true;
    setPlanCargando(true);
    setPlanError(null);
    const params = new URLSearchParams({
      periodoId: form.periodoId,
      cursoId: form.cursoId,
      desde: form.fechaInscripcion || hoy(),
    });
    fetch(`/api/administracion-escolar/matriculas/plan-cobro?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'No se pudo calcular el plan de cobro');
        return data.lineas as LineaPlan[];
      })
      .then((lineas) => {
        if (!vigente) return;
        setPlan(lineas);
        // Al cambiar de curso se respeta lo que el usuario ya tocó; los
        // conceptos nuevos entran con lo que diga la configuración.
        setMarcados((antes) => {
          const vistos = new Set(plan.map((l) => l.conceptoId));
          const siguiente = new Set<number>();
          for (const l of lineas) {
            const yaSeVio = vistos.has(l.conceptoId);
            if (yaSeVio ? antes.has(l.conceptoId) : l.porDefecto) siguiente.add(l.conceptoId);
          }
          return siguiente;
        });
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        setPlan([]);
        setPlanError(e instanceof Error ? e.message : 'No se pudo calcular el plan de cobro');
      })
      .finally(() => { if (vigente) setPlanCargando(false); });
    return () => { vigente = false; };
    // `plan` se lee dentro para conservar lo desmarcado, pero no dispara la
    // recarga: si estuviera en las dependencias entraría en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, editando, form.periodoId, form.cursoId, form.fechaInscripcion]);

  /**
   * Lo que se cobra ahora y lo que queda para después.
   *
   * Al matricular solo nacen las cuotas que vencen dentro del mes en curso; el
   * resto del año lo va creando el devengo mensual cuando llega su fecha. La
   * pantalla enseña las dos cifras porque el compromiso del año es lo que la
   * familia quiere saber, y la deuda de hoy es lo que va a cobrar la caja.
   */
  const resumenPlan = useMemo(() => {
    const corte = finDeMes(form.fechaInscripcion || hoy());
    let ahora = 0, ahoraCargos = 0, despues = 0, despuesCargos = 0;
    for (const l of plan) {
      if (!marcados.has(l.conceptoId)) continue;
      for (const c of l.cuotas) {
        if (c.vencida) continue;
        if (c.fechaVencimiento <= corte) { ahora += c.montoCentavos; ahoraCargos++; }
        else { despues += c.montoCentavos; despuesCargos++; }
      }
    }
    return { ahora, ahoraCargos, despues, despuesCargos, total: ahora + despues };
  }, [plan, marcados, form.fechaInscripcion]);

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
      if (filtradas.length === 1 && pagina > 1) setPagina((p) => p - 1);
      else await cargarMatriculas();
    } catch (e: unknown) {
      setBorrarError(e instanceof Error ? e.message : 'No se pudo borrar la matrícula');
    } finally {
      setBorrando(false);
    }
  }

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return matriculas;
    return matriculas.filter((m) =>
      `${m.estudiante ?? ''} ${m.estudianteApellidos ?? ''} ${nombreCurso(m)} ${m.codigoMatricula ?? ''}`.toLowerCase().includes(q),
    );
  }, [matriculas, query]);

  function abrirNueva() {
    const periodoActivo = periodos.find((p) => p.activo);
    setEditando(null);
    setPlan([]); setMarcados(new Set()); setPlanError(null);
    setForm({ ...EMPTY_FORM, periodoId: periodoActivo ? String(periodoActivo.id) : '' });
    setOpError(null);
    setShowForm(true);
  }

  function abrirEdicion(m: Matricula) {
    setEditando(m);
    setForm({
      estudianteId: String(m.estudianteId),
      periodoId: String(m.periodoId),
      cursoId: String(m.cursoId),
      codigoMatricula: m.codigoMatricula ?? '',
      fechaInscripcion: m.fechaInscripcion ?? hoy(),
      notas: m.notas ?? '',
      estado: m.estado,
    });
    setOpError(null);
    setShowForm(true);
  }

  async function handleGuardar() {
    if (!form.estudianteId || !form.periodoId || !form.cursoId) {
      setOpError('Estudiante, período y curso son obligatorios'); return;
    }
    setSaving(true);
    setOpError(null);
    try {
      // El estudiante no se manda al editar: cambiar de alumno una matrícula ya
      // creada no es una corrección, es otra matrícula.
      const res = await fetch(
        editando
          ? `/api/administracion-escolar/matriculas/${editando.id}`
          : '/api/administracion-escolar/matriculas',
        {
          method: editando ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(editando ? {} : { estudianteId: parseInt(form.estudianteId) }),
            periodoId: parseInt(form.periodoId),
            cursoId: parseInt(form.cursoId),
            codigoMatricula: form.codigoMatricula || null,
            fechaInscripcion: form.fechaInscripcion || null,
            notas: form.notas || null,
            ...(editando ? { estado: form.estado } : { conceptos: [...marcados] }),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando la matrícula');
      setShowForm(false);
      setEditando(null);
      setForm(EMPTY_FORM);
      await cargarMatriculas();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error guardando la matrícula');
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
          <Button className="bg-zero-600 hover:bg-zero-700" onClick={abrirNueva} disabled={loading || sinCatalogos}>
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
            <Select value={filtroPeriodo} onValueChange={(v: string) => { setPagina(1); setFiltroPeriodo(v); }}>
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
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {matriculas.length === 0 ? 'Aún no hay matrículas registradas' : 'Sin resultados'}
              </p>
              {matriculas.length === 0 && puedeGestionar && !sinCatalogos && (
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2 font-medium">Estudiante</th>
                    <th className="px-3 py-2 font-medium">Curso</th>
                    <th className="px-3 py-2 font-medium">Período</th>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Inscripción</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    {puedeGestionar && <th className="px-3 py-2 font-medium text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <Link href={`/escolar/estudiantes/${m.estudianteId}`}
                          className="font-medium text-gray-900 hover:text-zero-600">
                          {m.estudiante} {m.estudianteApellidos}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{nombreCurso(m)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{m.periodo ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500">{m.codigoMatricula ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{m.fechaInscripcion ? fmtFechaCorta(m.fechaInscripcion) : '—'}</td>
                      <td className="px-3 py-2.5">{estadoBadge(m.estado)}</td>
                      {puedeGestionar && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" aria-label="Editar matrícula"
                              onClick={() => abrirEdicion(m)}
                              className="h-8 w-8 p-0 text-gray-500 hover:text-zero-600">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" aria-label="Borrar matrícula"
                              onClick={() => { setPorBorrar(m); setBorrarError(null); }}
                              className="h-8 w-8 p-0 text-gray-500 hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
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

      {/* Modal nueva matrícula */}
      <Dialog open={showForm} onOpenChange={(o: boolean) => { if (!o) { setShowForm(false); setEditando(null); } }}>
        <DialogContent className="max-w-md">
          <ModalHeaderIcon icon={ClipboardList}
            title={editando ? 'Editar matrícula' : 'Nueva matrícula'}
            subtitle={editando
              ? 'Corrige el curso, la fecha o el estado de esta inscripción.'
              : 'Inscribe un estudiante en un período y curso.'} />
          <div className="space-y-4 px-6 py-4">
            {opError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>
            )}
            <div className="space-y-1.5">
              <Label>Estudiante *</Label>
              {editando ? (
                <div className="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                  {editando.estudiante} {editando.estudianteApellidos}
                </div>
              ) : (
                <BuscadorSelect
                  value={form.estudianteId}
                  onChange={(v) => setForm((f) => ({ ...f, estudianteId: v }))}
                  opciones={opcionesEstudiante}
                  placeholder="Escribe el nombre o el código…"
                  vacio="Ningún alumno con ese nombre"
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Período *</Label>
                {/* Al cambiar de período se suelta el curso: las secciones son de
                    otro año escolar y la elegida ya no está en la lista. */}
                <NativeSelect value={form.periodoId}
                  onChange={(e) => setForm((f) => ({ ...f, periodoId: e.target.value, cursoId: '' }))}>
                  <option value="" disabled>Período</option>
                  {periodos.map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Curso *</Label>
                <BuscadorSelect
                  value={form.cursoId}
                  onChange={(v) => setForm((f) => ({ ...f, cursoId: v }))}
                  opciones={opcionesCurso}
                  placeholder="Escribe el grado o la sección…"
                  vacio="Ninguna sección de este período coincide"
                />
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
            {editando && (
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <NativeSelect value={form.estado}
                  onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}>
                  {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.etiqueta}</option>)}
                </NativeSelect>
                <p className="text-xs text-gray-500">
                  Retirada o anulada conservan el historial; solo una puede estar activa por año.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input placeholder="Opcional" value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
            </div>

            {/* Al editar: lo que ya se le está cobrando de verdad. Se enseña
                para que quien corrige una matrícula vea las consecuencias —si
                le cambia el curso, estos montos ya no corresponden. */}
            {editando && (
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-baseline justify-between border-b border-gray-100 px-3 py-2">
                  <span className="text-sm font-medium text-gray-900">Cargos de esta matrícula</span>
                  <span className="text-xs text-gray-500">
                    {cargosActuales.length} cargo(s)
                  </span>
                </div>
                {cargosCargando ? (
                  <p className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />Cargando…
                  </p>
                ) : cargosActuales.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-500">
                    Todavía no tiene cargos. Se irán generando cada mes según el calendario.
                  </p>
                ) : (
                  <>
                    <div className="max-h-48 overflow-y-auto">
                      {cargosActuales.map((c) => {
                        const anulado = c.estado === 'anulado';
                        return (
                          <div key={c.id}
                            className="flex items-baseline justify-between gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0">
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm ${anulado ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                {c.concepto ?? 'Sin concepto'}
                              </span>
                              <span className="block text-xs text-gray-500">
                                {c.fechaVencimiento ? `vence ${fmtFechaCorta(c.fechaVencimiento)}` : 'sin vencimiento'}
                                {' · '}{anulado ? 'anulado' : c.saldoCentavos === 0 ? 'pagado' : 'pendiente'}
                              </span>
                            </span>
                            <span className={`whitespace-nowrap text-sm ${anulado ? 'text-gray-400 line-through' : 'font-medium text-gray-900'}`}>
                              {fmtRD(c.montoCentavos)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-baseline justify-between bg-gray-50 px-3 py-2.5">
                      <span className="text-sm font-medium text-gray-900">Pendiente de pago</span>
                      <span className="text-base font-semibold text-gray-900">
                        {fmtRD(cargosActuales
                          .filter((c) => c.estado !== 'anulado')
                          .reduce((a, c) => a + c.saldoCentavos, 0))}
                      </span>
                    </div>
                    <p className="px-3 pb-2.5 pt-2 text-xs text-gray-500">
                      Para quitar uno, anúlalo desde Cargos o desde la ficha del estudiante.
                      Cambiar el curso aquí no recalcula los cargos ya creados.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Al crear: lo que va a deber el alumno. No se cobra nada aquí:
                los cargos nacen pendientes y salen en su estado de cuenta. */}
            {!editando && form.cursoId && (
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-baseline justify-between border-b border-gray-100 px-3 py-2">
                  <span className="text-sm font-medium text-gray-900">Cargos del año</span>
                  <span className="text-xs text-gray-500">desmarca lo que no aplique</span>
                </div>

                {planCargando ? (
                  <p className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />Calculando…
                  </p>
                ) : planError ? (
                  <p className="px-3 py-4 text-sm text-red-600">{planError}</p>
                ) : plan.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-500">
                    Este curso no tiene tarifas configuradas. La matrícula se crea igual, sin deuda.
                  </p>
                ) : (
                  <>
                    {plan.map((l) => {
                      const activo = marcados.has(l.conceptoId);
                      return (
                        <label key={l.conceptoId}
                          className="flex cursor-pointer gap-2.5 border-b border-gray-100 px-3 py-2.5 last:border-b-0 hover:bg-gray-50">
                          <input type="checkbox" checked={activo}
                            onChange={() => setMarcados((s) => {
                              const n = new Set(s);
                              if (n.has(l.conceptoId)) n.delete(l.conceptoId); else n.add(l.conceptoId);
                              return n;
                            })}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-zero-600" />
                          <span className={`min-w-0 flex-1 ${activo ? '' : 'opacity-50'}`}>
                            <span className="flex justify-between gap-2">
                              <span className="text-sm text-gray-900">{l.nombre}</span>
                              <span className="whitespace-nowrap text-sm font-medium text-gray-900">
                                {fmtRD(l.totalCentavos)}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500">{resumenCuotas(l)}</span>
                            {l.origen === 'beca' && (
                              <span className="mt-1 inline-block rounded bg-zero-50 px-2 py-0.5 text-[11px] text-zero-700">
                                con beca
                              </span>
                            )}
                            {l.omitidas > 0 && (
                              <span className="mt-1 block text-xs text-amber-700">
                                se omiten {l.omitidas} cuota(s) ya vencida(s)
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                    <div className="bg-gray-50 px-3 py-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium text-gray-900">Se le carga ahora</span>
                        <span className="text-base font-semibold text-gray-900">{fmtRD(resumenPlan.ahora)}</span>
                      </div>
                      {resumenPlan.despues > 0 && (
                        <div className="mt-1 flex items-baseline justify-between text-gray-500">
                          <span className="text-xs">
                            Resto del año ({resumenPlan.despuesCargos} cuota(s), mes a mes)
                          </span>
                          <span className="text-xs">{fmtRD(resumenPlan.despues)}</span>
                        </div>
                      )}
                      <div className="mt-1 flex items-baseline justify-between border-t border-gray-200 pt-1 text-gray-600">
                        <span className="text-xs">Compromiso del año</span>
                        <span className="text-xs font-medium">{fmtRD(resumenPlan.total)}</span>
                      </div>
                    </div>
                    <p className="px-3 pb-2.5 pt-2 text-xs text-gray-500">
                      {resumenPlan.ahoraCargos === 0
                        ? 'No se genera ningún cargo todavía.'
                        : `Se generan ${resumenPlan.ahoraCargos} cargo(s) pendientes. No se cobra nada ahora.`}
                      {resumenPlan.despues > 0 && ' Las demás cuotas se generan al llegar su mes.'}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditando(null); }} disabled={saving}>Cancelar</Button>
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={handleGuardar} disabled={saving}>
              {saving
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
                : (editando ? 'Guardar cambios' : 'Crear matrícula')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Borrar es para deshacer un error de dedo. Si la matrícula ya movió
          dinero el servidor lo niega y explica que se cambie el estado. */}
      <Dialog open={porBorrar !== null} onOpenChange={(o: boolean) => { if (!o) setPorBorrar(null); }}>
        <DialogContent className="max-w-md">
          <ModalHeaderIcon icon={AlertTriangle} title="Borrar matrícula"
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
