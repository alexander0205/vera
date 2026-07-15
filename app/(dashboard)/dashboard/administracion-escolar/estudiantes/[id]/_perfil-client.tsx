'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Receipt, Link2, Wallet, AlertTriangle, ChevronDown, ChevronRight, Pencil, CalendarDays, GraduationCap, FileText, MoreVertical } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { SEXOS, labelSexo, calcularEdad } from '@/lib/administracion-escolar/estudiante-utils';
import { TutoresPanel } from '@/components/administracion-escolar/TutoresPanel';
import { VincularFacturaDialog } from '@/components/administracion-escolar/VincularFacturaDialog';
import { EditarMatriculaDialog } from '@/components/administracion-escolar/EditarMatriculaDialog';
import { PagoModal, type Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from 'sonner';

const ESTADOS_EST = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'retirado', label: 'Retirado' },
  { value: 'graduado', label: 'Graduado' },
];

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface Estudiante {
  id: number;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  estado: string;
  sexo: string | null;
  fechaNacimiento: string | null;
  deudaCentavos: number;
  dependienteId: number | null;
  dependiente: { nombre: string; apellido: string; clienteId: number; clienteRazonSocial: string } | null;
}
interface Matricula {
  id: number;
  periodoId: number;
  periodo: string | null;
  cursoId: number;
  curso: string | null;
  codigoMatricula: string | null;
  fechaInscripcion: string | null;
  estado: string;
  notas: string | null;
}
interface Cargo {
  id: number;
  concepto: string | null;
  matriculaId: number;
  periodoId: number;
  mes: number | null;
  anio: number;
  montoCentavos: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  estado: string;
  ecfDocumentId: number | null;
  facturaEncf: string | null;
  facturaCodigo: string | null;
  facturaEstadoPago: string | null;
}
interface Pago {
  id: number;
  cargoId: number | null;
  concepto: string | null;
  mes: number | null;
  anio: number | null;
  montoCentavos: number;
  fechaPago: string;
  metodo: string | null;
  referencia: string | null;
}
interface TutorVinculo {
  id: number;
  tutorId: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  imagen: string | null;
  clientId: number | null;
  clienteRazonSocial: string | null;
  relacion: string;
  responsablePago: boolean;
}
interface Factura {
  id: number;
  encf: string;
  estado: string;
  montoTotal: number;
  createdAt: string;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function badgeSaldo(c: Cargo) {
  if (c.estado === 'pagado') return <Badge className="bg-teal-50 text-teal-700 border-teal-200">Pagado</Badge>;
  if (c.estado === 'anulado') return <Badge variant="outline" className="text-gray-400">Anulado</Badge>;
  const color = c.estado === 'vencido' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200';
  return <Badge className={color}>{fmtDOP(c.saldoCentavos)}</Badge>;
}

// ─── Página ────────────────────────────────────────────────────────────────

export default function PerfilEstudianteClient({ id }: { id: number }) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedePagos = permissions.includes('administracion-escolar:pagos');
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  // Para el flujo "facturar un cargo" hace falta poder crear facturas Y registrar
  // el pago escolar que lo salda al volver.
  const puedeFacturar = puedePagos && permissions.includes('facturas:crear');

  const [estudiante, setEstudiante] = useState<Estudiante | null>(null);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [cargos, setCargos]         = useState<Cargo[]>([]);
  const [facturasTutor, setFacturasTutor] = useState<Factura[]>([]);
  const [facturasLoading, setFacturasLoading] = useState(false);
  const [pagos, setPagos]           = useState<Pago[]>([]);
  const [tutores, setTutores]       = useState<TutorVinculo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [notFound, setNotFound]     = useState(false);
  const [cargoVincularFactura, setCargoVincularFactura] = useState<Cargo | null>(null);
  const [matriculaEditar, setMatriculaEditar] = useState<Matricula | null>(null);

  // Modal de cobro in-place: reutiliza el PagoModal de Cuentas por Cobrar sin
  // salir del perfil. El flujo de datos es el mismo (registra en la factura).
  const [pagoCuenta, setPagoCuenta] = useState<Cuenta | null>(null);
  const [cargandoPago, setCargandoPago] = useState(false);

  const abrirPago = useCallback(async (ecfDocumentId: number) => {
    setCargandoPago(true);
    try {
      const res = await fetch(`/api/cuentas-por-cobrar/${ecfDocumentId}`);
      const json = await res.json();
      if (!res.ok || !json.cuenta) {
        toast.error(json.error ?? 'No se pudo cargar la factura para cobrar');
        return;
      }
      setPagoCuenta(json.cuenta);
    } catch {
      toast.error('No se pudo cargar la factura para cobrar');
    } finally {
      setCargandoPago(false);
    }
  }, []);

  // Edición inline de la tarjeta del estudiante.
  const [editando, setEditando]   = useState(false);
  const [editForm, setEditForm]   = useState({ nombres: '', apellidos: '', sexo: '', fechaNacimiento: '', estado: 'activo' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function abrirEdicion() {
    if (!estudiante) return;
    setEditForm({
      nombres: estudiante.nombres,
      apellidos: estudiante.apellidos,
      sexo: estudiante.sexo ?? '',
      fechaNacimiento: estudiante.fechaNacimiento ?? '',
      estado: estudiante.estado,
    });
    setEditError(null);
    setEditando(true);
  }

  async function guardarEdicion() {
    if (!estudiante) return;
    if (!editForm.nombres.trim() || !editForm.apellidos.trim()) {
      setEditError('Nombres y apellidos son obligatorios'); return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/administracion-escolar/estudiantes/${estudiante.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombres: editForm.nombres, apellidos: editForm.apellidos,
          sexo: editForm.sexo || null, fechaNacimiento: editForm.fechaNacimiento || null,
          estado: editForm.estado,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando');
      await cargar();
      setEditando(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Error guardando');
    } finally {
      setSavingEdit(false);
    }
  }

  // No pone `loading` en true en recargas posteriores: si lo hiciera, el early
  // return de abajo desmontaría <Tabs> en cada refresh (registrar pago, editar,
  // tutores) y se perdería la pestaña activa del usuario.
  const cargar = useCallback(async () => {
    try {
      const est = await fetch(`/api/administracion-escolar/estudiantes/${id}`).then((r) => r.json());
      if (!est.estudiante) { setNotFound(true); setLoading(false); return; }
      const [m, c, p, t] = await Promise.all([
        fetch(`/api/administracion-escolar/estudiantes/${id}/matriculas`).then((r) => r.json()),
        fetch(`/api/administracion-escolar/estudiantes/${id}/cargos`).then((r) => r.json()),
        fetch(`/api/administracion-escolar/estudiantes/${id}/pagos`).then((r) => r.json()),
        fetch(`/api/administracion-escolar/estudiantes/${id}/tutores`).then((r) => r.json()),
      ]);
      setEstudiante(est.estudiante);
      setMatriculas(m.matriculas ?? []);
      setCargos(c.cargos ?? []);
      setPagos(p.pagos ?? []);
      setTutores(t.tutores ?? []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Facturas del tutor responsable — depende de `tutores`, que ya vive antes
  // de los early return de abajo (no puede ir después: violaría rules-of-hooks).
  const responsableClientId = tutores.find((t) => t.responsablePago)?.clientId ?? null;
  useEffect(() => {
    if (!responsableClientId) { setFacturasTutor([]); return; }
    let cancel = false;
    setFacturasLoading(true);
    // dependienteId afina a las facturas de ESTE estudiante — si el estudiante
    // aún no está vinculado a un dependiente, se mantiene el comportamiento
    // anterior (todas las facturas del tutor, sin poder distinguir por hijo).
    const dependienteParam = estudiante?.dependienteId ? `&dependienteId=${estudiante.dependienteId}` : '';
    fetch(`/api/facturas?clientId=${responsableClientId}${dependienteParam}&limit=50`)
      .then((r) => r.json())
      .then((data) => { if (!cancel) setFacturasTutor(data.docs ?? []); })
      .finally(() => { if (!cancel) setFacturasLoading(false); });
    return () => { cancel = true; };
  }, [responsableClientId, estudiante?.dependienteId]);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>;
  }
  if (notFound || !estudiante) {
    return (
      <section className="p-6">
        <VolverLink />
        <p className="mt-6 text-gray-500">Estudiante no encontrado.</p>
      </section>
    );
  }

  const matriculaActiva = matriculas.find((m) => m.estado === 'activa') ?? null;
  const responsable = tutores.find((t) => t.responsablePago) ?? null;
  const otrosTutores = tutores.filter((t) => !t.responsablePago);
  const cargosPendientes = cargos.filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado));
  const vencidos = cargosPendientes.filter((c) => c.estado === 'vencido').length;
  const cargosVinculadosIds = new Set(cargos.map((c) => c.ecfDocumentId).filter((x): x is number => x !== null));

  return (
    <section className="p-6 space-y-5">
      <VolverLink />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{estudiante.nombres} {estudiante.apellidos}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {estudiante.codigo ?? 'Sin código'}
            {matriculaActiva?.curso ? ` · ${matriculaActiva.curso}` : ''}
            {matriculaActiva?.periodo ? ` · Período ${matriculaActiva.periodo}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {puedeGestionar && !editando && (
            <Button variant="outline" onClick={abrirEdicion}>
              <Pencil className="h-4 w-4 mr-1.5" />Editar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Columna resumen */}
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-xl bg-white p-5 space-y-4">
            {editando ? (
              <div className="space-y-3">
                {editError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{editError}</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nombres *</Label>
                    <Input autoFocus value={editForm.nombres}
                      onChange={(ev) => setEditForm((f) => ({ ...f, nombres: ev.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Apellidos *</Label>
                    <Input value={editForm.apellidos}
                      onChange={(ev) => setEditForm((f) => ({ ...f, apellidos: ev.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sexo</Label>
                    <Select value={editForm.sexo} onValueChange={(v) => setEditForm((f) => ({ ...f, sexo: v }))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        {SEXOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fecha nacimiento</Label>
                    <Input type="date" value={editForm.fechaNacimiento}
                      onChange={(ev) => setEditForm((f) => ({ ...f, fechaNacimiento: ev.target.value }))} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Estado</Label>
                    <Select value={editForm.estado} onValueChange={(v) => setEditForm((f) => ({ ...f, estado: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESTADOS_EST.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Código: {estudiante.codigo ?? '—'} · se genera automáticamente, no se edita.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditando(false)} disabled={savingEdit}>Cancelar</Button>
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={guardarEdicion} disabled={savingEdit}>
                    {savingEdit ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Guardar'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-semibold shrink-0">
                  {`${estudiante.nombres[0] ?? ''}${estudiante.apellidos[0] ?? ''}`.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{estudiante.nombres} {estudiante.apellidos}</p>
                    {estudiante.estado !== 'activo' && (
                      <Badge variant="outline" className="capitalize text-gray-500 shrink-0">{estudiante.estado}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {labelSexo(estudiante.sexo)}
                    {calcularEdad(estudiante.fechaNacimiento) != null ? ` · ${calcularEdad(estudiante.fechaNacimiento)} años` : ''}
                    {estudiante.fechaNacimiento ? ` · Nac. ${fmtFechaCorta(estudiante.fechaNacimiento)}` : ''}
                  </p>
                </div>
              </div>
            )}

            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Balance pendiente</p>
              <p className={`text-2xl font-bold ${estudiante.deudaCentavos > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {fmtDOP(estudiante.deudaCentavos)}
              </p>
            </div>

            <div className="space-y-1.5 text-sm">
              <Row label="Matrícula activa" value={matriculaActiva?.codigoMatricula ?? (matriculaActiva ? `#${matriculaActiva.id}` : '—')} strong />
              <Row label="Período" value={matriculaActiva?.periodo ?? '—'} strong />
              <Row label="Curso" value={matriculaActiva?.curso ?? '—'} strong />
              <Row label="Estado" value={matriculaActiva?.estado ?? '—'} strong capitalize />
            </div>

            {/* Contacto vinculado (derivado del tutor de pago). Ya no se edita a
                mano: se establece automáticamente al asignar el tutor responsable
                de pago, bajo su mismo cliente, para que la factura sea coherente. */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-900 mb-2">Contacto vinculado</p>
              {estudiante.dependiente ? (
                <Link href={`/dashboard/clientes/${estudiante.dependiente.clienteId}/editar`}
                  className="block border border-gray-200 rounded-lg p-3 hover:border-teal-300 hover:bg-teal-50/40 transition-colors">
                  <p className="font-semibold text-gray-900">{estudiante.dependiente.clienteRazonSocial}</p>
                  <span className="inline-flex items-center gap-1 text-[11px] text-teal-700 mt-0.5">
                    <Link2 className="h-3 w-3" />Ver contacto
                  </span>
                </Link>
              ) : (
                <p className="text-sm text-gray-400">Se establece al asignar el tutor de pago.</p>
              )}
            </div>

            {/* Tutor de pago */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-sm font-medium text-gray-900 mb-2">Tutor de pago</p>
              {responsable ? (
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="font-semibold text-gray-900">{responsable.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {responsable.relacion}{responsable.telefono ? ` · ${responsable.telefono}` : ''}
                  </p>
                  {responsable.email && <p className="text-xs text-gray-500">{responsable.email}</p>}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Sin tutor responsable asignado</p>
              )}
            </div>

            {/* Otros tutores */}
            {otrosTutores.length > 0 && (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-sm font-medium text-gray-900 mb-2">Otros tutores</p>
                <div className="space-y-1.5 text-sm">
                  {otrosTutores.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2">
                      <span className="text-gray-700 truncate">{t.nombre}</span>
                      <span className="text-gray-500 capitalize shrink-0">{t.relacion}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Columna tabs */}
        <div className="lg:col-span-2 border border-gray-200 rounded-xl bg-white p-4">
          <Tabs defaultValue="periodos">
            <TabsList variant="line" className="w-full justify-start border-b border-gray-200 rounded-none px-0">
              <TabsTrigger value="deudas">Deudas</TabsTrigger>
              <TabsTrigger value="pagos">Pagos</TabsTrigger>
              <TabsTrigger value="facturas">Facturas</TabsTrigger>
              <TabsTrigger value="periodos">Por período</TabsTrigger>
              <TabsTrigger value="matriculas">Matrículas</TabsTrigger>
              <TabsTrigger value="tutores">Tutores</TabsTrigger>
              <TabsTrigger value="historial">Historial</TabsTrigger>
            </TabsList>

            {/* Deudas */}
            <TabsContent value="deudas" className="pt-4 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-semibold text-gray-900">Cargos pendientes</h2>
                  {vencidos > 0 && <Badge className="bg-red-50 text-red-600 border-red-200">{vencidos} vencido{vencidos !== 1 ? 's' : ''}</Badge>}
                </div>
                {cargosPendientes.length === 0 ? (
                  <EmptyBox text="Sin cargos pendientes" />
                ) : (
                  <SimpleTable head={['Concepto', 'Mes', 'Vencimiento', 'Monto', 'Saldo', 'Factura']}
                    rows={cargosPendientes.map((c) => [
                      c.concepto ?? '—',
                      c.mes ? MESES[c.mes] : '—',
                      c.fechaVencimiento ? fmtFechaCorta(c.fechaVencimiento) : '—',
                      fmtDOP(c.montoCentavos),
                      badgeSaldo(c),
                      <FacturaCell key="f" cargo={c} puedeGestionar={puedeGestionar}
                        puedeFacturar={puedeFacturar} puedePagos={puedePagos}
                        onVincular={() => setCargoVincularFactura(c)}
                        onRegistrarPago={() => c.ecfDocumentId && abrirPago(c.ecfDocumentId)}
                        onFacturar={() => router.push(`/dashboard/facturas/nueva?desdeCargo=${c.id}`)} />,
                    ])} />
                )}
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-2">Todos los cargos</h2>
                {cargos.length === 0 ? (
                  <EmptyBox text="Sin cargos registrados" />
                ) : (
                  <SimpleTable head={['Concepto', 'Mes', 'Año', 'Monto', 'Saldo', 'Factura']}
                    rows={cargos.map((c) => [
                      c.concepto ?? '—',
                      c.mes ? MESES[c.mes] : '—',
                      String(c.anio),
                      fmtDOP(c.montoCentavos),
                      badgeSaldo(c),
                      <FacturaCell key="f" cargo={c} puedeGestionar={puedeGestionar}
                        puedeFacturar={puedeFacturar} puedePagos={puedePagos}
                        onVincular={() => setCargoVincularFactura(c)}
                        onRegistrarPago={() => c.ecfDocumentId && abrirPago(c.ecfDocumentId)}
                        onFacturar={() => router.push(`/dashboard/facturas/nueva?desdeCargo=${c.id}`)} />,
                    ])} />
                )}
              </div>
            </TabsContent>

            {/* Pagos */}
            <TabsContent value="pagos" className="pt-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Pagos recientes</h2>
              {pagos.length === 0 ? (
                <EmptyBox text="Sin pagos registrados" />
              ) : (
                <SimpleTable head={['Fecha', 'Aplicado a', 'Método', 'Monto']}
                  rows={pagos.map((p) => [
                    fmtFechaCorta(p.fechaPago),
                    p.concepto ? `${p.concepto}${p.mes ? ` ${MESES[p.mes]}` : ''}` : 'Sin cargo',
                    <span key="m" className="capitalize">{p.metodo ?? '—'}</span>,
                    fmtDOP(p.montoCentavos),
                  ])} />
              )}
            </TabsContent>

            {/* Facturas del tutor — solo lectura, informativo. La deuda real
                sigue viviendo en los cargos; esto es un reflejo del cliente
                vinculado al tutor responsable. */}
            <TabsContent value="facturas" className="pt-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Facturas del tutor</h2>
              {!responsable?.clientId ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>El tutor responsable no está vinculado a un contacto. Vincúlalo en la pestaña Tutores para ver sus facturas aquí.</span>
                </div>
              ) : facturasLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
              ) : facturasTutor.length === 0 ? (
                <EmptyBox text={`Sin facturas registradas para ${responsable.clienteRazonSocial}`} />
              ) : (
                <FacturasConLineas facturas={facturasTutor} cargosVinculadosIds={cargosVinculadosIds} />
              )}
            </TabsContent>

            {/* Vista estructurada por período/curso. Coexiste con las listas
                globales de arriba: aquí se ordenan cargos, facturas y pagos en
                el contexto académico donde ocurrieron. */}
            <TabsContent value="periodos" className="pt-4">
              <PeriodosAcademicos matriculas={matriculas} cargos={cargos} pagos={pagos} onRegistrarPago={abrirPago} />
            </TabsContent>

            {/* Matrículas */}
            <TabsContent value="matriculas" className="pt-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Historial de matrículas</h2>
              {matriculas.length === 0 ? (
                <EmptyBox text="Sin matrículas registradas" />
              ) : (
                <SimpleTable head={['Período', 'Curso', 'Inscripción', 'Estado', ...(puedeGestionar ? [''] : [])]}
                  rows={matriculas.map((m) => [
                    m.periodo ?? '—',
                    m.curso ?? '—',
                    m.fechaInscripcion ? fmtFechaCorta(m.fechaInscripcion) : '—',
                    m.estado === 'activa'
                      ? <Badge key="e" className="bg-teal-50 text-teal-700 border-teal-200">Activa</Badge>
                      : <span key="e" className="capitalize text-gray-600">{m.estado}</span>,
                    ...(puedeGestionar ? [
                      <button key="ed" onClick={() => setMatriculaEditar(m)}
                        className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors">
                        <Pencil className="h-3 w-3" />Editar
                      </button>,
                    ] : []),
                  ])} />
              )}
            </TabsContent>

            {/* Tutores */}
            <TabsContent value="tutores" className="pt-4">
              {puedeGestionar ? (
                <TutoresPanel estudianteId={estudiante.id} tutores={tutores} onChange={cargar} />
              ) : (
                <>
                  <h2 className="text-base font-semibold text-gray-900 mb-2">Tutores</h2>
                  {tutores.length === 0 ? (
                    <EmptyBox text="Sin tutores asociados" />
                  ) : (
                    <SimpleTable head={['Nombre', 'Relación', 'Teléfono', 'Email', 'Responsable']}
                      rows={tutores.map((t) => [
                        t.nombre,
                        <span key="r" className="capitalize">{t.relacion}</span>,
                        t.telefono ?? '—',
                        t.email ?? '—',
                        t.responsablePago
                          ? <Badge key="p" className="bg-teal-50 text-teal-700 border-teal-200">Pago</Badge>
                          : <span key="p" className="text-gray-300">—</span>,
                      ])} />
                  )}
                </>
              )}
            </TabsContent>

            {/* Historial */}
            <TabsContent value="historial" className="pt-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Historial de actividad</h2>
              <Historial matriculas={matriculas} pagos={pagos} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <EditarMatriculaDialog
        matricula={matriculaEditar}
        open={!!matriculaEditar}
        onClose={() => setMatriculaEditar(null)}
        onSaved={cargar}
      />

      {cargoVincularFactura && (
        <VincularFacturaDialog
          cargoId={cargoVincularFactura.id}
          cargoLabel={`${cargoVincularFactura.concepto ?? 'Cargo'}${cargoVincularFactura.mes ? ` ${MESES[cargoVincularFactura.mes]}` : ''}`}
          clienteId={responsable?.clientId ?? null}
          open={!!cargoVincularFactura}
          onClose={() => setCargoVincularFactura(null)}
          onSaved={cargar}
        />
      )}

      {/* Cobro in-place: mismo modal de Cuentas por Cobrar, sin salir del perfil. */}
      {cargandoPago && !pagoCuenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      )}
      {pagoCuenta && (
        <PagoModal
          cuenta={pagoCuenta}
          onClose={() => setPagoCuenta(null)}
          onSuccess={() => { setPagoCuenta(null); cargar(); }}
        />
      )}
    </section>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

function PeriodosAcademicos({ matriculas, cargos, pagos, onRegistrarPago }: {
  matriculas: Matricula[]; cargos: Cargo[]; pagos: Pago[];
  onRegistrarPago: (ecfDocumentId: number) => void;
}) {
  const router = useRouter();
  const grupos = construirGruposPeriodo(matriculas, cargos);
  const [periodoActivoKey, setPeriodoActivoKey] = useState<string | null>(null);
  const [vista, setVista] = useState<'mensualidades' | 'otros' | 'facturas' | 'pagos'>('mensualidades');
  const grupoActivo = grupos.find((g) => g.key === periodoActivoKey) ?? grupos[0] ?? null;

  if (grupos.length === 0) {
    return <EmptyBox text="Sin períodos, cargos o pagos relacionados" />;
  }

  const cargosPeriodo = grupoActivo?.cargos ?? [];
  const pagosPeriodo = pagos.filter((p) => p.cargoId != null && cargosPeriodo.some((c) => c.id === p.cargoId));
  const facturas = cargosPeriodo.filter((c) => c.ecfDocumentId != null);
  const total = cargosPeriodo.reduce((s, c) => s + c.montoCentavos, 0);
  const saldo = cargosPeriodo
    .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
    .reduce((s, c) => s + c.saldoCentavos, 0);
  const pagado = Math.max(0, total - saldo);
  const otrosCargos = cargosPeriodo.filter((c) => c.mes == null);
  const proximo = cargosPeriodo
    .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
    .sort((a, b) => (a.fechaVencimiento ?? '9999-12-31').localeCompare(b.fechaVencimiento ?? '9999-12-31'))[0] ?? null;
  const facturaPendiente = cargosPeriodo.find((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado) && c.ecfDocumentId);
  const cargoSinFactura = cargosPeriodo.find((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado) && !c.ecfDocumentId);

  function registrarPago() {
    if (facturaPendiente?.ecfDocumentId) {
      onRegistrarPago(facturaPendiente.ecfDocumentId);
    }
  }

  function crearFactura() {
    if (cargoSinFactura) {
      router.push(`/dashboard/facturas/nueva?desdeCargo=${cargoSinFactura.id}`);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Historial financiero por período</h2>
        <p className="text-sm text-gray-500 mt-1">
          Seleccione un período para ver el detalle de facturación, pagos y deuda.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {grupos.map((grupo) => {
          const grupoSaldo = grupo.cargos
            .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
            .reduce((s, c) => s + c.saldoCentavos, 0);
          const activo = grupoActivo?.key === grupo.key;
          return (
            <button
              key={grupo.key}
              type="button"
              onClick={() => setPeriodoActivoKey(grupo.key)}
              className={`text-left border rounded-lg p-4 min-h-[104px] transition-colors ${
                activo
                  ? 'border-gray-400 bg-gray-100 text-gray-900'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">{grupo.periodo}</p>
                  <p className="text-xs text-gray-500 truncate mt-1">{grupo.curso}</p>
                </div>
                {grupo.estado ? (
                  <Badge className={grupo.estado === 'activa' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'}>
                    {grupo.estado === 'activa' ? 'Activa' : 'Finalizada'}
                  </Badge>
                ) : null}
              </div>
              <p className={`text-xs mt-4 font-medium ${grupoSaldo > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                Pendiente: {fmtDOP(grupoSaldo)}
              </p>
            </button>
          );
        })}
      </div>

      {grupoActivo && (
        <div className="border border-gray-200 rounded-xl bg-white p-4 space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold text-gray-900">Período {grupoActivo.periodo}</h3>
                {grupoActivo.estado && (
                  <Badge className={grupoActivo.estado === 'activa' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'}>
                    {grupoActivo.estado === 'activa' ? 'Activa' : 'Finalizada'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">{grupoActivo.curso}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="bg-teal-600 hover:bg-teal-700" onClick={registrarPago} disabled={!facturaPendiente?.ecfDocumentId}>
                <Wallet className="h-4 w-4 mr-1.5" />Registrar pago
              </Button>
              <Button variant="outline" onClick={crearFactura} disabled={!cargoSinFactura}>
                <FileText className="h-4 w-4 mr-1.5" />Crear factura
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Receipt className="h-4 w-4 mr-1.5" />Estado de cuenta
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <PeriodoStat icon={Receipt} label="Facturado" value={fmtDOP(total)} detail="Total del período" tone="blue" />
            <PeriodoStat icon={Wallet} label="Pagado" value={fmtDOP(pagado)} detail="Total del período" tone="teal" />
            <PeriodoStat icon={AlertTriangle} label="Pendiente" value={fmtDOP(saldo)} detail="Saldo por pagar" tone="red" />
            <PeriodoStat
              icon={CalendarDays}
              label="Próximo vencimiento"
              value={proximo?.mes ? MESES[proximo.mes] : proximo ? fmtFechaCorta(proximo.fechaVencimiento) : '—'}
              detail={proximo ? fmtDOP(proximo.saldoCentavos) : 'Sin deuda próxima'}
              tone="gray"
            />
          </div>

          <div>
            <div className="flex gap-8 border-b border-gray-200">
              {[
                ['mensualidades', 'Mensualidades'],
                ['otros', 'Otros cargos'],
                ['facturas', 'Facturas'],
                ['pagos', 'Pagos'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVista(value as typeof vista)}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                    vista === value ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {vista === 'mensualidades' && (
              <MensualidadesTabla cargos={cargosPeriodo.filter((c) => c.mes != null)} pagos={pagos} onAction={(cargo) => {
                if (cargo?.ecfDocumentId && ['pendiente', 'parcial', 'vencido'].includes(cargo.estado)) {
                  onRegistrarPago(cargo.ecfDocumentId);
                } else if (cargo && !cargo.ecfDocumentId) {
                  router.push(`/dashboard/facturas/nueva?desdeCargo=${cargo.id}`);
                } else if (cargo?.ecfDocumentId) {
                  router.push(`/dashboard/facturas/${cargo.ecfDocumentId}`);
                }
              }} />
            )}

            {vista === 'otros' && (
              otrosCargos.length === 0 ? <EmptyBox text="Sin otros cargos" /> : (
                <SimpleTable head={['Concepto', 'Vencimiento', 'Monto', 'Pagado', 'Pendiente', 'Factura']}
                  rows={otrosCargos.map((c) => {
                    const pagadoCargo = Math.max(0, c.montoCentavos - c.saldoCentavos);
                    return [
                      c.concepto ?? '—',
                      c.fechaVencimiento ? fmtFechaCorta(c.fechaVencimiento) : '—',
                      fmtDOP(c.montoCentavos),
                      fmtDOP(pagadoCargo),
                      <span key="saldo" className={c.saldoCentavos > 0 ? 'text-red-600 font-medium' : 'text-teal-700 font-medium'}>{fmtDOP(c.saldoCentavos)}</span>,
                      facturaLink(c),
                    ];
                  })} />
              )
            )}

            {vista === 'facturas' && (
              facturas.length === 0 ? <EmptyBox text="Sin facturas vinculadas" /> : (
                <SimpleTable head={['Mes', 'Concepto', 'Factura', 'Monto', 'Estado']}
                  rows={facturas.map((c) => [
                    c.mes ? `${MESES[c.mes]} ${c.anio}` : String(c.anio),
                    c.concepto ?? '—',
                    facturaLink(c),
                    fmtDOP(c.montoCentavos),
                    c.facturaEstadoPago ?? '—',
                  ])} />
              )
            )}

            {vista === 'pagos' && (
              pagosPeriodo.length === 0 ? <EmptyBox text="Sin pagos registrados" /> : (
                <SimpleTable head={['Fecha', 'Mes', 'Concepto', 'Método', 'Monto']}
                  rows={pagosPeriodo.map((p) => [
                    fmtFechaCorta(p.fechaPago),
                    p.mes ? `${MESES[p.mes]} ${p.anio ?? ''}` : '—',
                    p.concepto ?? '—',
                    <span key="metodo" className="capitalize">{p.metodo ?? '—'}</span>,
                    fmtDOP(p.montoCentavos),
                  ])} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PeriodoStat({ icon: Icon, label, value, detail, tone }: {
  icon: typeof Receipt;
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'teal' | 'red' | 'gray';
}) {
  const toneClass = {
    blue: 'text-blue-600',
    teal: 'text-teal-600',
    red: 'text-red-600',
    gray: 'text-gray-600',
  }[tone];
  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <Icon className={`h-4 w-4 ${toneClass}`} />{label}
      </div>
      <p className="text-xl font-semibold text-gray-900 mt-3">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{detail}</p>
    </div>
  );
}

function MensualidadesTabla({ cargos, pagos, onAction }: {
  cargos: Cargo[];
  pagos: Pago[];
  onAction: (cargo: Cargo | null) => void;
}) {
  const rows = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const cargosMes = cargos.filter((c) => c.mes === mes);
    const total = cargosMes.reduce((s, c) => s + c.montoCentavos, 0);
    const saldo = cargosMes
      .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
      .reduce((s, c) => s + c.saldoCentavos, 0);
    const pagado = Math.max(0, total - saldo);
    const factura = cargosMes.find((c) => c.ecfDocumentId != null) ?? null;
    const accion = cargosMes.find((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado)) ?? factura;
    return { mes, cargosMes, total, saldo, pagado, factura, accion, estado: estadoMes(cargosMes) };
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500">
            <th className="px-3 py-2 font-medium">Mes</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium text-right">Facturado</th>
            <th className="px-3 py-2 font-medium text-right">Pagado</th>
            <th className="px-3 py-2 font-medium text-right">Pendiente</th>
            <th className="px-3 py-2 font-medium">Factura</th>
            <th className="px-3 py-2 font-medium text-right">Acción</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.mes} className="border-t border-gray-100 hover:bg-gray-50/60">
              <td className="px-3 py-2.5 font-medium text-gray-900">{MESES[r.mes]}</td>
              <td className="px-3 py-2.5"><EstadoMesBadge estado={r.estado} /></td>
              <td className="px-3 py-2.5 text-right text-gray-700">{fmtDOP(r.total)}</td>
              <td className="px-3 py-2.5 text-right text-gray-700">{fmtDOP(r.pagado)}</td>
              <td className={`px-3 py-2.5 text-right font-medium ${r.saldo > 0 ? 'text-red-600' : 'text-teal-700'}`}>
                {fmtDOP(r.saldo)}
              </td>
              <td className="px-3 py-2.5">{r.factura ? facturaLink(r.factura) : <span className="text-gray-400">—</span>}</td>
              <td className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => onAction(r.accion ?? null)}
                  disabled={!r.accion}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                  title="Acción del mes"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
        <span>Mostrando 12 de 12 meses</span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-teal-600 text-white">1</span>
      </div>
    </div>
  );
}

function construirGruposPeriodo(matriculas: Matricula[], cargos: Cargo[]) {
  const grupos = new Map<string, {
    key: string;
    periodoId: number | null;
    matriculaId: number | null;
    periodo: string;
    curso: string;
    estado: string | null;
    fecha: string | null;
    cargos: Cargo[];
  }>();

  for (const m of matriculas) {
    const key = `m-${m.id}`;
    grupos.set(key, {
      key,
      periodoId: m.periodoId,
      matriculaId: m.id,
      periodo: m.periodo ?? `Período #${m.periodoId}`,
      curso: m.curso ?? `Curso #${m.cursoId}`,
      estado: m.estado,
      fecha: m.fechaInscripcion,
      cargos: [],
    });
  }

  for (const c of cargos) {
    let grupo = Array.from(grupos.values()).find((g) => g.matriculaId === c.matriculaId);
    if (!grupo) {
      grupo = Array.from(grupos.values()).find((g) => g.periodoId === c.periodoId);
    }
    if (!grupo) {
      const key = `p-${c.periodoId}`;
      grupo = grupos.get(key);
      if (!grupo) {
        grupo = {
          key,
          periodoId: c.periodoId,
          matriculaId: null,
          periodo: `Período #${c.periodoId}`,
          curso: 'Curso no disponible',
          estado: null,
          fecha: null,
          cargos: [],
        };
        grupos.set(key, grupo);
      }
    }
    grupo.cargos.push(c);
  }

  return Array.from(grupos.values())
    .filter((g) => g.matriculaId != null || g.cargos.length > 0)
    .sort((a, b) => {
      const fa = a.fecha ?? '0000-00-00';
      const fb = b.fecha ?? '0000-00-00';
      if (fa !== fb) return fa < fb ? 1 : -1;
      return (b.periodoId ?? 0) - (a.periodoId ?? 0);
    });
}

function MesAcademico({ mes, cargos, pagos }: { mes: number; cargos: Cargo[]; pagos: Pago[] }) {
  if (cargos.length === 0) {
    return (
      <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50 min-h-[112px]">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-gray-700">{MESES[mes]}</p>
          <Badge variant="outline" className="text-gray-400">Sin cargo</Badge>
        </div>
      </div>
    );
  }

  const total = cargos.reduce((s, c) => s + c.montoCentavos, 0);
  const saldo = cargos
    .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
    .reduce((s, c) => s + c.saldoCentavos, 0);
  const pagosMes = pagos.filter((p) => p.cargoId != null && cargos.some((c) => c.id === p.cargoId));
  const estado = estadoMes(cargos);
  const factura = cargos.find((c) => c.ecfDocumentId != null) ?? null;

  return (
    <div className="border border-gray-200 rounded-lg p-3 min-h-[132px] space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-gray-900">{MESES[mes]}</p>
        <EstadoMesBadge estado={estado} />
      </div>
      <div className="text-xs text-gray-500 space-y-1">
        <div className="flex justify-between gap-2"><span>Total</span><span className="font-medium text-gray-700">{fmtDOP(total)}</span></div>
        <div className="flex justify-between gap-2"><span>Saldo</span><span className={saldo > 0 ? 'font-medium text-red-600' : 'font-medium text-teal-700'}>{fmtDOP(saldo)}</span></div>
        {pagosMes.length > 0 && (
          <div className="flex justify-between gap-2"><span>Pagos</span><span className="font-medium text-gray-700">{pagosMes.length}</span></div>
        )}
      </div>
      {factura ? (
        <div className="pt-1">{facturaLink(factura)}</div>
      ) : (
        <p className="text-xs text-gray-300 pt-1">Sin factura vinculada</p>
      )}
    </div>
  );
}

function estadoMes(cargos: Cargo[]): 'pagado' | 'adelantado' | 'vencido' | 'pendiente' | 'parcial' | 'sin-cargo' {
  if (cargos.length === 0) return 'sin-cargo';
  const hoyIso = new Date().toISOString().slice(0, 10);
  const vivos = cargos.filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado));
  if (vivos.length === 0) {
    const futura = cargos.some((c) => c.fechaVencimiento && c.fechaVencimiento >= hoyIso);
    return futura ? 'adelantado' : 'pagado';
  }
  if (vivos.some((c) => c.estado === 'vencido' || (c.fechaVencimiento && c.fechaVencimiento < hoyIso))) return 'vencido';
  if (vivos.some((c) => c.estado === 'parcial')) return 'parcial';
  return 'pendiente';
}

function EstadoMesBadge({ estado }: { estado: ReturnType<typeof estadoMes> }) {
  if (estado === 'pagado') return <Badge className="bg-teal-50 text-teal-700 border-teal-200">Pagado</Badge>;
  if (estado === 'adelantado') return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Adelantado</Badge>;
  if (estado === 'vencido') return <Badge className="bg-red-50 text-red-600 border-red-200">Vencido</Badge>;
  if (estado === 'parcial') return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Parcial</Badge>;
  if (estado === 'sin-cargo') return <Badge variant="outline" className="text-gray-500">Sin cargo</Badge>;
  return <Badge className="bg-gray-50 text-gray-600 border-gray-200">Por vencer</Badge>;
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="border border-gray-100 rounded-lg p-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      <p className={`text-sm font-semibold truncate ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function facturaLink(cargo: Cargo) {
  if (!cargo.ecfDocumentId) return <span className="text-gray-300 text-xs">—</span>;
  const ref = cargo.facturaEncf || cargo.facturaCodigo || `#${cargo.ecfDocumentId}`;
  return (
    <Link href={`/dashboard/facturas/${cargo.ecfDocumentId}`}
      className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 hover:underline">
      <Receipt className="h-3 w-3" />{ref}
    </Link>
  );
}

function FacturaCell({ cargo, puedeGestionar, puedeFacturar, puedePagos, onVincular, onFacturar, onRegistrarPago }: {
  cargo: Cargo; puedeGestionar: boolean; puedeFacturar: boolean; puedePagos: boolean;
  onVincular: () => void; onFacturar: () => void; onRegistrarPago: () => void;
}) {
  // Facturar/pagar solo tiene sentido para un cargo que aún debe algo.
  const facturable = ['pendiente', 'parcial', 'vencido'].includes(cargo.estado);
  if (cargo.ecfDocumentId) {
    // El cobro vive en la factura. El chip enlaza al documento; "Registrar pago"
    // redirige a la factura para cobrar ahí (no hay pago escolar paralelo).
    const ref = cargo.facturaEncf || cargo.facturaCodigo || `#${cargo.ecfDocumentId}`;
    const chip = (
      <Link href={`/dashboard/facturas/${cargo.ecfDocumentId}`}
        className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 hover:underline">
        <Receipt className="h-3 w-3" />{ref}
      </Link>
    );
    // Con factura y saldo pendiente: ir a la factura a registrar el cobro.
    if (puedePagos && facturable) {
      return (
        <span className="inline-flex items-center justify-end gap-3">
          {chip}
          <button onClick={onRegistrarPago} className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors">
            <Wallet className="h-3 w-3" />Registrar pago
          </button>
        </span>
      );
    }
    return chip;
  }
  const acciones: React.ReactNode[] = [];
  if (puedeFacturar && facturable) {
    acciones.push(
      <button key="fac" onClick={onFacturar} className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium transition-colors">
        <Receipt className="h-3 w-3" />Facturar
      </button>,
    );
  }
  if (puedeGestionar) {
    acciones.push(
      <button key="vin" onClick={onVincular} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors">
        <Link2 className="h-3 w-3" />Vincular
      </button>,
    );
  }
  if (acciones.length === 0) return <span className="text-gray-300 text-xs">—</span>;
  return <span className="inline-flex items-center justify-end gap-3">{acciones}</span>;
}

function VolverLink() {
  return (
    <Link href="/dashboard/administracion-escolar/estudiantes"
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-teal-600 transition-colors">
      <ArrowLeft className="h-4 w-4" />Volver a estudiantes
    </Link>
  );
}

function Row({ label, value, strong, capitalize }: { label: string; value: string; strong?: boolean; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right truncate ${strong ? 'font-semibold text-gray-900' : 'text-gray-700'} ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return <div className="text-center py-10 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">{text}</div>;
}

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2 font-medium ${i >= head.length - 1 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-gray-100">
              {r.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2.5 text-gray-700 ${ci >= r.length - 1 ? 'text-right' : ''}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LineaFactura {
  nombreItem: string;
  cantidadItem: number;
  precioUnitarioItem: number;
  dependienteNombre?: string | null;
}

/**
 * Tabla de facturas con detalle expandible por fila (líneas/productos de cada
 * factura). Reusa GET /api/facturas/[id] — endpoint de detalle ya existente
 * que parsea lineasJson — no se agregó nada al motor de facturación, solo se
 * consume lo que ya expone.
 */
function FacturasConLineas({ facturas, cargosVinculadosIds }: { facturas: Factura[]; cargosVinculadosIds: Set<number> }) {
  const [expandidaId, setExpandidaId] = useState<number | null>(null);
  const [lineasPorFactura, setLineasPorFactura] = useState<Record<number, LineaFactura[]>>({});
  const [cargandoId, setCargandoId] = useState<number | null>(null);

  async function toggle(id: number) {
    if (expandidaId === id) { setExpandidaId(null); return; }
    setExpandidaId(id);
    if (lineasPorFactura[id]) return;
    setCargandoId(id);
    try {
      const data = await fetch(`/api/facturas/${id}`).then((r) => r.json());
      setLineasPorFactura((prev) => ({ ...prev, [id]: data.lineas ?? [] }));
    } finally {
      setCargandoId(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <th className="px-3 py-2 font-medium w-6"></th>
            <th className="px-3 py-2 font-medium">NCF</th>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Monto</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium text-right">Cargo</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((f) => {
            const abierta = expandidaId === f.id;
            return (
              <Fragment key={f.id}>
                <tr
                  onClick={() => toggle(f.id)}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
                  <td className="px-3 py-2.5 text-gray-400">
                    {abierta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{f.encf}</td>
                  <td className="px-3 py-2.5 text-gray-700">{fmtFechaCorta(f.createdAt)}</td>
                  <td className="px-3 py-2.5 text-gray-700">{fmtDOP(f.montoTotal)}</td>
                  <td className="px-3 py-2.5"><Badge variant="outline" className="text-xs">{f.estado}</Badge></td>
                  <td className="px-3 py-2.5 text-right">
                    {cargosVinculadosIds.has(f.id)
                      ? <Badge className="bg-teal-50 text-teal-700 border-teal-200">Cubre cargo</Badge>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
                {abierta && (
                  <tr className="border-t border-gray-100 bg-gray-50/50">
                    <td colSpan={6} className="px-3 py-2">
                      {cargandoId === f.id ? (
                        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-teal-600" /></div>
                      ) : (lineasPorFactura[f.id]?.length ?? 0) === 0 ? (
                        <p className="text-xs text-gray-400 py-1 pl-6">Sin líneas registradas</p>
                      ) : (
                        <table className="w-full text-xs ml-6" style={{ width: 'calc(100% - 1.5rem)' }}>
                          <thead>
                            <tr className="text-left text-gray-400">
                              <th className="py-1 font-medium">Producto/servicio</th>
                              <th className="py-1 font-medium text-right">Cant.</th>
                              <th className="py-1 font-medium text-right">Precio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineasPorFactura[f.id].map((l, i) => (
                              <tr key={i} className="border-t border-gray-100">
                                <td className="py-1.5 text-gray-700">
                                  {l.nombreItem}
                                  {l.dependienteNombre && <span className="text-gray-400"> · {l.dependienteNombre}</span>}
                                </td>
                                <td className="py-1.5 text-right text-gray-600">{l.cantidadItem}</td>
                                <td className="py-1.5 text-right text-gray-600">RD${Number(l.precioUnitarioItem).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Historial({ matriculas, pagos }: { matriculas: Matricula[]; pagos: Pago[] }) {
  const eventos = [
    ...matriculas.map((m) => ({
      fecha: m.fechaInscripcion,
      texto: `Matrícula ${m.periodo ?? ''}${m.curso ? ` — ${m.curso}` : ''}`,
      tipo: 'matricula' as const,
    })),
    ...pagos.map((p) => ({
      fecha: p.fechaPago,
      texto: `Pago ${fmtDOP(p.montoCentavos)}${p.concepto ? ` — ${p.concepto}` : ''}`,
      tipo: 'pago' as const,
    })),
  ]
    .filter((e) => e.fecha)
    .sort((a, b) => (a.fecha! < b.fecha! ? 1 : -1));

  if (eventos.length === 0) return <EmptyBox text="Sin actividad registrada" />;

  return (
    <div className="space-y-3">
      {eventos.map((e, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${e.tipo === 'pago' ? 'bg-teal-500' : 'bg-gray-400'}`} />
          <div>
            <p className="text-sm text-gray-800">{e.texto}</p>
            <p className="text-xs text-gray-400">{fmtFechaCorta(e.fecha)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
