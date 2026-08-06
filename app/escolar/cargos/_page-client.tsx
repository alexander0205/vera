'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { NativeSelect } from '@/components/ui/native-select';
import { Paginador } from '@/components/ui/paginador';
import { ModalHeaderIcon } from '@/components/ui/modal-header-icon';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { mesesDelPeriodo, type MesDelPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import { AlertTriangle, CalendarDays, Loader2, Plus, Receipt, Search, Wallet } from 'lucide-react';

interface Cargo {
  id: number;
  estudianteId: number;
  estudiante: string | null;
  estudianteApellidos: string | null;
  matriculaId: number;
  periodoId: number;
  conceptoId: number;
  concepto: string | null;
  mes: number | null;
  anio: number;
  montoCentavos: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  estado: string;
}
interface Periodo { id: number; nombre: string; fechaInicio: string | null; fechaFin: string | null; activo: boolean; }
interface Curso { id: number; nombre: string; activo: boolean; }
interface Concepto { id: number; nombre: string; tipo: string; recurrente: boolean; activo: boolean; }
interface Matricula { id: number; estudianteId: number; periodoId: number; cursoId: number; estado: string; }
interface Estudiante { id: number; nombres: string; apellidos: string; }

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ESTADOS = [
  { value: 'todos', label: 'Estado: Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'pagado', label: 'Pagado' },
];

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
  const hoy = new Date();
  return meses.find((m) => m.mes === hoy.getMonth() + 1 && m.anio === hoy.getFullYear()) ?? meses[0] ?? null;
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

function estadoBadge(estado: string, saldoCentavos: number) {
  if (estado === 'pagado') return <Badge className="bg-zero-50 text-zero-700 border-zero-200">Pagado</Badge>;
  if (estado === 'parcial') return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Parcial · {fmtDOP(saldoCentavos)}</Badge>;
  if (estado === 'vencido') return <Badge className="bg-red-50 text-red-600 border-red-200">Vencido · {fmtDOP(saldoCentavos)}</Badge>;
  if (estado === 'anulado') return <Badge variant="outline" className="text-gray-400">Anulado</Badge>;
  return <Badge className="bg-gray-50 text-gray-700 border-gray-200">Pendiente · {fmtDOP(saldoCentavos)}</Badge>;
}

export default function CargosClient() {
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');

  const [cargos, setCargos] = useState<Cargo[]>([]);
  // El listado viene paginado del servidor: un colegio genera miles de cargos
  // al año y traerlos todos dejaba la pantalla en blanco varios segundos.
  const [pagina, setPagina] = useState(1);
  const [paginaInfo, setPaginaInfo] = useState({ total: 0, paginas: 1, porPagina: 50 });
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ creados: number; omitidos: number; total: number } | null>(null);

  // Cargo individual (un estudiante) — dialog aparte del masivo.
  const [openInd, setOpenInd] = useState(false);
  const [formInd, setFormInd] = useState({
    periodoId: '', cursoId: 'todos', estudianteId: '', matriculaId: '',
    conceptoId: '', mes: '', anio: String(new Date().getFullYear()), monto: '', fechaVencimiento: hoy(),
  });
  const [queryEst, setQueryEst] = useState('');
  const [savingInd, setSavingInd] = useState(false);
  const [errInd, setErrInd] = useState<string | null>(null);
  const [okInd, setOkInd] = useState<string | null>(null);

  const cargarCargos = useCallback(async () => {
    const params = new URLSearchParams();
    if (filtroPeriodo !== 'todos') params.set('periodoId', filtroPeriodo);
    if (filtroEstado !== 'todos') params.set('estado', filtroEstado);
    params.set('pagina', String(pagina));
    const res = await fetch(`/api/administracion-escolar/cargos?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error cargando cargos');
    setCargos(data.cargos ?? []);
    setPaginaInfo({
      total: data.total ?? 0,
      paginas: data.paginas ?? 1,
      porPagina: data.porPagina ?? 50,
    });
  }, [filtroEstado, filtroPeriodo, pagina]);

  const cargarCatalogos = useCallback(async () => {
    const [periodosRes, cursosRes, conceptosRes, matriculasRes, estudiantesRes] = await Promise.all([
      fetch('/api/administracion-escolar/periodos'),
      fetch('/api/administracion-escolar/cursos'),
      fetch('/api/administracion-escolar/conceptos'),
      fetch('/api/administracion-escolar/matriculas'),
      fetch('/api/administracion-escolar/estudiantes/opciones'),
    ]);
    const [p, c, k, m, e] = await Promise.all([
      periodosRes.json(), cursosRes.json(), conceptosRes.json(), matriculasRes.json(), estudiantesRes.json(),
    ]);
    if (!periodosRes.ok) throw new Error(p.error ?? 'Error cargando períodos');
    if (!cursosRes.ok) throw new Error(c.error ?? 'Error cargando cursos');
    if (!conceptosRes.ok) throw new Error(k.error ?? 'Error cargando conceptos');
    if (!matriculasRes.ok) throw new Error(m.error ?? 'Error cargando matrículas');
    setPeriodos(p.periodos ?? []);
    setCursos(c.cursos ?? []);
    setConceptos(k.conceptos ?? []);
    setMatriculas(m.matriculas ?? []);
    setEstudiantes(e.estudiantes ?? []);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([cargarCargos(), cargarCatalogos()]);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Error cargando cargos');
    } finally {
      setLoading(false);
    }
  }, [cargarCatalogos, cargarCargos]);

  useEffect(() => { cargar(); }, [cargar]);

  const periodosById = useMemo(() => new Map(periodos.map((p) => [p.id, p.nombre])), [periodos]);
  const cursosActivos = useMemo(() => cursos.filter((c) => c.activo !== false), [cursos]);
  const conceptosActivos = useMemo(() => conceptos.filter((c) => c.activo !== false), [conceptos]);
  const conceptoSeleccionado = conceptos.find((c) => String(c.id) === form.conceptoId) ?? null;
  const periodoForm = periodos.find((p) => String(p.id) === form.periodoId);
  const mesesForm = mesesDelPeriodo(periodoForm?.fechaInicio, periodoForm?.fechaFin);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cargos;
    return cargos.filter((c) =>
      `${c.estudiante ?? ''} ${c.estudianteApellidos ?? ''} ${c.concepto ?? ''} ${periodosById.get(c.periodoId) ?? ''}`.toLowerCase().includes(q),
    );
  }, [cargos, periodosById, query]);

  const pendientes = cargos.filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado));
  const saldoPendiente = pendientes.reduce((sum, c) => sum + c.saldoCentavos, 0);
  const vencidos = cargos.filter((c) => c.estado === 'vencido').length;
  const cobrado = cargos.reduce((sum, c) => sum + (c.montoCentavos - c.saldoCentavos), 0);

  const objetivo = useMemo(() => {
    if (!form.periodoId) return 0;
    return matriculas.filter((m) => (
      m.estado === 'activa'
      && String(m.periodoId) === form.periodoId
      && (form.cursoId === 'todos' || String(m.cursoId) === form.cursoId)
    )).length;
  }, [form.cursoId, form.periodoId, matriculas]);

  function abrirGenerar() {
    const periodoActivo = periodos.find((p) => p.activo);
    const mensualidad = conceptosActivos.find((c) => c.tipo === 'mensualidad') ?? conceptosActivos[0];
    const primerMes = mesInicial(periodoActivo);
    setForm({
      ...EMPTY_FORM,
      periodoId: periodoActivo ? String(periodoActivo.id) : '',
      conceptoId: mensualidad ? String(mensualidad.id) : '',
      mes: mensualidad?.tipo === 'mensualidad' ? String(primerMes?.mes ?? '') : '',
      anio: String(primerMes?.anio ?? new Date().getFullYear()),
    });
    setResultado(null);
    setOpError(null);
    setOpen(true);
  }

  async function handleGenerar() {
    const montoCentavos = toCentavos(form.monto);
    if (!form.periodoId || !form.conceptoId || !form.anio || montoCentavos <= 0) {
      setOpError('Período, concepto, año y monto son obligatorios');
      return;
    }
    if (conceptoSeleccionado?.tipo === 'mensualidad' && !form.mes) {
      setOpError('Selecciona el mes de la mensualidad');
      return;
    }
    setSaving(true);
    setOpError(null);
    setResultado(null);
    try {
      const res = await fetch('/api/administracion-escolar/cargos/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodoId: Number.parseInt(form.periodoId),
          cursoId: form.cursoId === 'todos' ? null : Number.parseInt(form.cursoId),
          conceptoId: Number.parseInt(form.conceptoId),
          mes: form.mes ? Number.parseInt(form.mes) : null,
          anio: Number.parseInt(form.anio),
          montoCentavos,
          fechaVencimiento: form.fechaVencimiento || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error generando cargos');
      setResultado(data);
      await cargarCargos();
      await cargarCatalogos();
    } catch (e: unknown) {
      setOpError(e instanceof Error ? e.message : 'Error generando cargos');
    } finally {
      setSaving(false);
    }
  }

  // ── Cargo individual ──────────────────────────────────────────────────────
  const estNombre = useMemo(
    () => new Map(estudiantes.map((e) => [e.id, `${e.nombres} ${e.apellidos}`])),
    [estudiantes],
  );
  const conceptoIndSel = conceptos.find((c) => String(c.id) === formInd.conceptoId) ?? null;
  const periodoInd = periodos.find((p) => String(p.id) === formInd.periodoId);
  const mesesInd = mesesDelPeriodo(periodoInd?.fechaInicio, periodoInd?.fechaFin);

  // Estudiantes con matrícula activa en el período (y curso, si se filtró) elegido.
  const estudiantesDelCurso = useMemo(() => {
    if (!formInd.periodoId) return [];
    const q = queryEst.trim().toLowerCase();
    return matriculas
      .filter((m) => (
        m.estado === 'activa'
        && String(m.periodoId) === formInd.periodoId
        && (formInd.cursoId === 'todos' || String(m.cursoId) === formInd.cursoId)
      ))
      .map((m) => ({ matriculaId: m.id, estudianteId: m.estudianteId, cursoId: m.cursoId, nombre: estNombre.get(m.estudianteId) ?? `#${m.estudianteId}` }))
      .filter((x) => !q || x.nombre.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [matriculas, formInd.periodoId, formInd.cursoId, queryEst, estNombre]);

  function abrirIndividual() {
    const periodoActivo = periodos.find((p) => p.activo);
    const primerMes = mesInicial(periodoActivo);
    setFormInd({
      periodoId: periodoActivo ? String(periodoActivo.id) : '',
      cursoId: 'todos', estudianteId: '', matriculaId: '',
      conceptoId: '', mes: '', anio: String(primerMes?.anio ?? new Date().getFullYear()), monto: '', fechaVencimiento: hoy(),
    });
    setQueryEst('');
    setErrInd(null);
    setOkInd(null);
    setOpenInd(true);
  }

  async function handleCrearIndividual() {
    const montoCentavos = toCentavos(formInd.monto);
    if (!formInd.periodoId || !formInd.estudianteId || !formInd.matriculaId || !formInd.conceptoId || montoCentavos <= 0) {
      setErrInd('Estudiante, concepto y monto son obligatorios');
      return;
    }
    if (conceptoIndSel?.tipo === 'mensualidad' && !formInd.mes) {
      setErrInd('Selecciona el mes de la mensualidad');
      return;
    }
    setSavingInd(true);
    setErrInd(null);
    setOkInd(null);
    try {
      const res = await fetch('/api/administracion-escolar/cargos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estudianteId: Number.parseInt(formInd.estudianteId),
          matriculaId: Number.parseInt(formInd.matriculaId),
          periodoId: Number.parseInt(formInd.periodoId),
          conceptoId: Number.parseInt(formInd.conceptoId),
          mes: formInd.mes ? Number.parseInt(formInd.mes) : null,
          anio: Number.parseInt(formInd.anio),
          montoCentavos,
          fechaVencimiento: formInd.fechaVencimiento || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando el cargo');
      setOkInd(`Cargo creado para ${estNombre.get(Number.parseInt(formInd.estudianteId)) ?? 'el estudiante'}.`);
      setFormInd((f) => ({ ...f, estudianteId: '', matriculaId: '', monto: '' }));
      setQueryEst('');
      await cargarCargos();
    } catch (e: unknown) {
      setErrInd(e instanceof Error ? e.message : 'Error creando el cargo');
    } finally {
      setSavingInd(false);
    }
  }

  const sinCatalogos = periodos.length === 0 || conceptosActivos.length === 0 || matriculas.length === 0;

  return (
    <section className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cargos y deudas</h1>
          <p className="text-sm text-gray-500 mt-1">Inscripción, mensualidades y otros cargos por estudiante</p>
        </div>
        {puedeGestionar && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={abrirIndividual} disabled={loading || sinCatalogos}>
              <Plus className="h-4 w-4 mr-2" />Cargo individual
            </Button>
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={abrirGenerar} disabled={loading || sinCatalogos}>
              <Plus className="h-4 w-4 mr-2" />Generar cargos
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Receipt} label="Cargos" value={String(cargos.length)} />
        <StatCard icon={Wallet} label="Saldo pendiente" value={fmtDOP(saldoPendiente)} accent={saldoPendiente > 0} />
        <StatCard icon={AlertTriangle} label="Vencidos" value={String(vencidos)} accent={vencidos > 0} />
        <StatCard icon={CalendarDays} label="Cobrado" value={fmtDOP(cobrado)} />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-8" placeholder="Buscar por estudiante, concepto o período..."
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={filtroPeriodo} onValueChange={(v: string) => { setPagina(1); setFiltroPeriodo(v); }}>
              <SelectTrigger className="lg:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Período: Todos</SelectItem>
                {periodos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={(v: string) => { setPagina(1); setFiltroEstado(v); }}>
              <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loadError ? (
            <EmptyState text={loadError} error onRetry={cargar} />
          ) : loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16">
              <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{cargos.length === 0 ? 'Aún no hay cargos generados' : 'Sin resultados'}</p>
              {cargos.length === 0 && puedeGestionar && !sinCatalogos && (
                <Button className="mt-4 bg-zero-600 hover:bg-zero-700" size="sm" onClick={abrirGenerar}>
                  <Plus className="h-4 w-4 mr-1" />Generar cargos
                </Button>
              )}
              {sinCatalogos && (
                <p className="text-sm text-gray-400 mt-2">
                  Primero crea conceptos en{' '}
                  <Link href="/escolar/configuracion" className="text-zero-600 hover:underline">Configuración</Link>
                  {' '}y matrículas activas en{' '}
                  <Link href="/escolar/matriculas" className="text-zero-600 hover:underline">Matrículas</Link>.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-2 font-medium">Estudiante</th>
                    <th className="px-3 py-2 font-medium">Concepto</th>
                    <th className="px-3 py-2 font-medium">Período</th>
                    <th className="px-3 py-2 font-medium">Mes</th>
                    <th className="px-3 py-2 font-medium text-right">Monto</th>
                    <th className="px-3 py-2 font-medium">Vence</th>
                    <th className="px-3 py-2 font-medium text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c) => (
                    <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <Link href={`/escolar/estudiantes/${c.estudianteId}`}
                          className="font-medium text-gray-900 hover:text-zero-600">
                          {c.estudiante} {c.estudianteApellidos}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{c.concepto ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600">{periodosById.get(c.periodoId) ?? `#${c.periodoId}`}</td>
                      <td className="px-3 py-2.5 text-gray-600">{c.mes ? `${MESES[c.mes]} ${c.anio}` : String(c.anio)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-900">{fmtDOP(c.montoCentavos)}</td>
                      <td className="px-3 py-2.5 text-gray-600">{fmtFechaCorta(c.fechaVencimiento)}</td>
                      <td className="px-3 py-2.5 text-right">{estadoBadge(c.estado, c.saldoCentavos)}</td>
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

      <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) setOpen(false); }}>
        <DialogContent className="max-w-lg">
          <ModalHeaderIcon icon={Receipt} title="Generar cargos masivos"
            subtitle="Crea el mismo cargo para todas las matrículas del filtro." />
          <div className="space-y-4 px-6 py-4">
            {opError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>}
            {resultado && (
              <div className="bg-zero-50 border border-zero-200 text-zero-800 text-sm rounded-lg p-3">
                Creados: {resultado.creados}. Omitidos por duplicado: {resultado.omitidos}. Total evaluado: {resultado.total}.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Período *</Label>
                <NativeSelect value={form.periodoId} onChange={(e) => {
                  const periodo = periodos.find((p) => String(p.id) === e.target.value);
                  const siguiente = mesInicial(periodo);
                  setForm((f) => ({
                    ...f,
                    periodoId: e.target.value,
                    ...(perteneceMes(periodo, f.mes, f.anio) ? {} : { mes: String(siguiente?.mes ?? ''), anio: String(siguiente?.anio ?? f.anio) }),
                  }));
                }}>
                  <option value="" disabled>Período</option>
                  {periodos.map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Curso</Label>
                <NativeSelect value={form.cursoId} onChange={(e) => setForm((f) => ({ ...f, cursoId: e.target.value }))}>
                  <option value="todos">Todos los cursos</option>
                  {cursosActivos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
                </NativeSelect>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Concepto *</Label>
              <NativeSelect value={form.conceptoId} onChange={(e) => {
                const concepto = conceptos.find((c) => String(c.id) === e.target.value);
                const siguiente = mesInicial(periodoForm);
                setForm((f) => ({
                  ...f,
                  conceptoId: e.target.value,
                  ...(concepto?.tipo === 'mensualidad'
                    ? (perteneceMes(periodoForm, f.mes, f.anio) ? {} : { mes: String(siguiente?.mes ?? ''), anio: String(siguiente?.anio ?? f.anio) })
                    : { mes: '' }),
                }));
              }}>
                <option value="" disabled>Concepto</option>
                {conceptosActivos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
              </NativeSelect>
            </div>

            {conceptoSeleccionado?.tipo === 'mensualidad' ? (
              <MesAcademicoSelect periodo={periodoForm} meses={mesesForm} mes={form.mes} anio={form.anio}
                onChange={(seleccion) => setForm((f) => ({ ...f, mes: String(seleccion.mes), anio: String(seleccion.anio) }))} />
            ) : (
              <div className="space-y-1.5">
                <Label>Año *</Label>
                <Input type="number" value={form.anio}
                  onChange={(e) => setForm((f) => ({ ...f, anio: e.target.value }))} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monto por estudiante (RD$) *</Label>
                <Input type="number" step="0.01" placeholder="3500.00" value={form.monto}
                  onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha vencimiento</Label>
                <Input type="date" value={form.fechaVencimiento}
                  onChange={(e) => setForm((f) => ({ ...f, fechaVencimiento: e.target.value }))} />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              Matrículas activas objetivo: <span className="font-semibold text-gray-900">{objetivo}</span>.
              {' '}Duplicados existentes se omiten automáticamente.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cerrar</Button>
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={handleGenerar} disabled={saving || objetivo === 0}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Generando...</> : 'Generar cargos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cargo individual — un estudiante */}
      <Dialog open={openInd} onOpenChange={(o: boolean) => { if (!o) setOpenInd(false); }}>
        <DialogContent className="max-w-lg">
          <ModalHeaderIcon icon={Receipt} title="Cargo individual"
            subtitle="Un cargo para un estudiante en específico." />
          <div className="space-y-4 px-6 py-4">
            {errInd && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{errInd}</div>}
            {okInd && <div className="bg-zero-50 border border-zero-200 text-zero-800 text-sm rounded-lg p-3">{okInd}</div>}

            {/* Filtros para encontrar al estudiante */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Período *</Label>
                <NativeSelect value={formInd.periodoId} onChange={(e) => {
                  const periodo = periodos.find((p) => String(p.id) === e.target.value);
                  const siguiente = mesInicial(periodo);
                  setFormInd((f) => ({
                    ...f,
                    periodoId: e.target.value,
                    estudianteId: '',
                    matriculaId: '',
                    ...(perteneceMes(periodo, f.mes, f.anio) ? {} : { mes: String(siguiente?.mes ?? ''), anio: String(siguiente?.anio ?? f.anio) }),
                  }));
                }}>
                  <option value="" disabled>Período</option>
                  {periodos.map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Curso</Label>
                <NativeSelect value={formInd.cursoId} onChange={(e) => setFormInd((f) => ({ ...f, cursoId: e.target.value, estudianteId: '', matriculaId: '' }))}>
                  <option value="todos">Todos los cursos</option>
                  {cursosActivos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
                </NativeSelect>
              </div>
            </div>

            {/* Estudiante: búsqueda + lista */}
            <div className="space-y-1.5">
              <Label>Estudiante *</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="pl-8" placeholder="Buscar por nombre…" value={queryEst}
                  onChange={(e) => setQueryEst(e.target.value)} disabled={!formInd.periodoId} />
              </div>
              {!formInd.periodoId ? (
                <p className="text-xs text-gray-400">Elige un período para ver los estudiantes.</p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {estudiantesDelCurso.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Sin matrículas activas en ese filtro.</p>
                  ) : estudiantesDelCurso.map((e) => {
                    const sel = String(e.estudianteId) === formInd.estudianteId;
                    return (
                      <button key={e.matriculaId} type="button"
                        onClick={() => setFormInd((f) => ({ ...f, estudianteId: String(e.estudianteId), matriculaId: String(e.matriculaId) }))}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${sel ? 'bg-zero-50 text-zero-800 font-medium' : 'hover:bg-gray-50 text-gray-800'}`}>
                        {e.nombre}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Concepto */}
            <div className="space-y-1.5">
              <Label>Concepto *</Label>
              <NativeSelect value={formInd.conceptoId} onChange={(e) => {
                const concepto = conceptos.find((c) => String(c.id) === e.target.value);
                const siguiente = mesInicial(periodoInd);
                setFormInd((f) => ({
                  ...f,
                  conceptoId: e.target.value,
                  ...(concepto?.tipo === 'mensualidad'
                    ? (perteneceMes(periodoInd, f.mes, f.anio) ? {} : { mes: String(siguiente?.mes ?? ''), anio: String(siguiente?.anio ?? f.anio) })
                    : { mes: '' }),
                }));
              }}>
                <option value="" disabled>Concepto</option>
                {conceptosActivos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
              </NativeSelect>
            </div>

            {conceptoIndSel?.tipo === 'mensualidad' ? (
              <MesAcademicoSelect periodo={periodoInd} meses={mesesInd} mes={formInd.mes} anio={formInd.anio}
                onChange={(seleccion) => setFormInd((f) => ({ ...f, mes: String(seleccion.mes), anio: String(seleccion.anio) }))} />
            ) : (
              <div className="space-y-1.5">
                <Label>Año *</Label>
                <Input type="number" value={formInd.anio}
                  onChange={(e) => setFormInd((f) => ({ ...f, anio: e.target.value }))} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monto (RD$) *</Label>
                <Input type="number" step="0.01" placeholder="3500.00" value={formInd.monto}
                  onChange={(e) => setFormInd((f) => ({ ...f, monto: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha vencimiento</Label>
                <Input type="date" value={formInd.fechaVencimiento}
                  onChange={(e) => setFormInd((f) => ({ ...f, fechaVencimiento: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenInd(false)} disabled={savingInd}>Cerrar</Button>
            <Button className="bg-zero-600 hover:bg-zero-700" onClick={handleCrearIndividual}
              disabled={savingInd || !formInd.estudianteId || !formInd.conceptoId}>
              {savingInd ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Creando...</> : 'Crear cargo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MesAcademicoSelect({ periodo, meses, mes, anio, onChange }: {
  periodo: Periodo | undefined;
  meses: MesDelPeriodo[];
  mes: string;
  anio: string;
  onChange: (mes: MesDelPeriodo) => void;
}) {
  if (!periodo) {
    return <p className="text-xs text-gray-400">Elige un período para seleccionar la mensualidad.</p>;
  }
  if (meses.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        Configura fecha de inicio y fin del período antes de crear una mensualidad.
      </p>
    );
  }
  const value = `${anio}-${String(mes).padStart(2, '0')}`;
  return (
    <div className="space-y-1.5">
      <Label>Mes de la mensualidad *</Label>
      <NativeSelect value={value} onChange={(e) => {
        const seleccionado = meses.find((m) => m.key === e.target.value);
        if (seleccionado) onChange(seleccionado);
      }}>
        {meses.map((m) => <option key={m.key} value={m.key}>{MESES[m.mes]} {m.anio}</option>)}
      </NativeSelect>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Receipt; label: string; value: string; accent?: boolean }) {
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

function EmptyState({ text, error, onRetry }: { text: string; error?: boolean; onRetry: () => void }) {
  return (
    <div className="text-center py-16">
      <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-3" />
      <p className={`font-medium ${error ? 'text-red-600' : 'text-gray-500'}`}>{text}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>Reintentar</Button>
    </div>
  );
}
