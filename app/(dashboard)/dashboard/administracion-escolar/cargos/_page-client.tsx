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
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
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
interface Periodo { id: number; nombre: string; activo: boolean; }
interface Curso { id: number; nombre: string; activo: boolean; }
interface Concepto { id: number; nombre: string; tipo: string; recurrente: boolean; activo: boolean; }
interface Matricula { id: number; estudianteId: number; periodoId: number; cursoId: number; estado: string; }

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

function toCentavos(value: string): number {
  const n = Number.parseFloat(value.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function estadoBadge(estado: string, saldoCentavos: number) {
  if (estado === 'pagado') return <Badge className="bg-teal-50 text-teal-700 border-teal-200">Pagado</Badge>;
  if (estado === 'parcial') return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Parcial · {fmtDOP(saldoCentavos)}</Badge>;
  if (estado === 'vencido') return <Badge className="bg-red-50 text-red-600 border-red-200">Vencido · {fmtDOP(saldoCentavos)}</Badge>;
  if (estado === 'anulado') return <Badge variant="outline" className="text-gray-400">Anulado</Badge>;
  return <Badge className="bg-gray-50 text-gray-700 border-gray-200">Pendiente · {fmtDOP(saldoCentavos)}</Badge>;
}

export default function CargosClient() {
  const { permissions } = usePermissions();
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');

  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
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

  const cargarCargos = useCallback(async () => {
    const params = new URLSearchParams();
    if (filtroPeriodo !== 'todos') params.set('periodoId', filtroPeriodo);
    if (filtroEstado !== 'todos') params.set('estado', filtroEstado);
    const url = `/api/administracion-escolar/cargos${params.toString() ? `?${params}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error cargando cargos');
    setCargos(data.cargos ?? []);
  }, [filtroEstado, filtroPeriodo]);

  const cargarCatalogos = useCallback(async () => {
    const [periodosRes, cursosRes, conceptosRes, matriculasRes] = await Promise.all([
      fetch('/api/administracion-escolar/periodos'),
      fetch('/api/administracion-escolar/cursos'),
      fetch('/api/administracion-escolar/conceptos'),
      fetch('/api/administracion-escolar/matriculas'),
    ]);
    const [p, c, k, m] = await Promise.all([
      periodosRes.json(), cursosRes.json(), conceptosRes.json(), matriculasRes.json(),
    ]);
    if (!periodosRes.ok) throw new Error(p.error ?? 'Error cargando períodos');
    if (!cursosRes.ok) throw new Error(c.error ?? 'Error cargando cursos');
    if (!conceptosRes.ok) throw new Error(k.error ?? 'Error cargando conceptos');
    if (!matriculasRes.ok) throw new Error(m.error ?? 'Error cargando matrículas');
    setPeriodos(p.periodos ?? []);
    setCursos(c.cursos ?? []);
    setConceptos(k.conceptos ?? []);
    setMatriculas(m.matriculas ?? []);
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
    setForm({
      ...EMPTY_FORM,
      periodoId: periodoActivo ? String(periodoActivo.id) : '',
      conceptoId: mensualidad ? String(mensualidad.id) : '',
      mes: mensualidad?.tipo === 'mensualidad' ? String(new Date().getMonth() + 1) : '',
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

  const sinCatalogos = periodos.length === 0 || conceptosActivos.length === 0 || matriculas.length === 0;

  return (
    <section className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cargos y deudas</h1>
          <p className="text-sm text-gray-500 mt-1">Inscripción, mensualidades y otros cargos por estudiante</p>
        </div>
        {puedeGestionar && (
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={abrirGenerar} disabled={loading || sinCatalogos}>
            <Plus className="h-4 w-4 mr-2" />Generar cargos
          </Button>
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
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="lg:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Período: Todos</SelectItem>
                {periodos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loadError ? (
            <EmptyState text={loadError} error onRetry={cargar} />
          ) : loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16">
              <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{cargos.length === 0 ? 'Aún no hay cargos generados' : 'Sin resultados'}</p>
              {cargos.length === 0 && puedeGestionar && !sinCatalogos && (
                <Button className="mt-4 bg-teal-600 hover:bg-teal-700" size="sm" onClick={abrirGenerar}>
                  <Plus className="h-4 w-4 mr-1" />Generar cargos
                </Button>
              )}
              {sinCatalogos && (
                <p className="text-sm text-gray-400 mt-2">
                  Primero crea conceptos en{' '}
                  <Link href="/dashboard/administracion-escolar/configuracion" className="text-teal-600 hover:underline">Configuración</Link>
                  {' '}y matrículas activas en{' '}
                  <Link href="/dashboard/administracion-escolar/matriculas" className="text-teal-600 hover:underline">Matrículas</Link>.
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
                        <Link href={`/dashboard/administracion-escolar/estudiantes/${c.estudianteId}`}
                          className="font-medium text-gray-900 hover:text-teal-600">
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
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) setOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Generar cargos masivos</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {opError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{opError}</div>}
            {resultado && (
              <div className="bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-lg p-3">
                Creados: {resultado.creados}. Omitidos por duplicado: {resultado.omitidos}. Total evaluado: {resultado.total}.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Período *</Label>
                <Select value={form.periodoId} onValueChange={(v) => setForm((f) => ({ ...f, periodoId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
                  <SelectContent>
                    {periodos.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Curso</Label>
                <Select value={form.cursoId} onValueChange={(v) => setForm((f) => ({ ...f, cursoId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los cursos</SelectItem>
                    {cursosActivos.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Concepto *</Label>
              <Select value={form.conceptoId} onValueChange={(v) => {
                const concepto = conceptos.find((c) => String(c.id) === v);
                setForm((f) => ({ ...f, conceptoId: v, mes: concepto?.tipo === 'mensualidad' ? (f.mes || String(new Date().getMonth() + 1)) : '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="Concepto" /></SelectTrigger>
                <SelectContent>
                  {conceptosActivos.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mes</Label>
                <Select value={form.mes || 'sin-mes'} onValueChange={(v) => setForm((f) => ({ ...f, mes: v === 'sin-mes' ? '' : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sin-mes">Sin mes</SelectItem>
                    {MESES.slice(1).map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Año *</Label>
                <Input type="number" value={form.anio}
                  onChange={(e) => setForm((f) => ({ ...f, anio: e.target.value }))} />
              </div>
            </div>

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
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleGenerar} disabled={saving || objetivo === 0}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Generando...</> : 'Generar cargos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
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
