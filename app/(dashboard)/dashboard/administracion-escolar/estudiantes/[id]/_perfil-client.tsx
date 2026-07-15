'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Loader2, Receipt, Link2, Wallet, AlertTriangle, Pencil, CalendarDays, FileText, MoreVertical, Plus } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { SEXOS, labelSexo, calcularEdad } from '@/lib/administracion-escolar/estudiante-utils';
import { TutoresPanel } from '@/components/administracion-escolar/TutoresPanel';
import { VincularFacturaDialog } from '@/components/administracion-escolar/VincularFacturaDialog';
import { EditarMatriculaDialog } from '@/components/administracion-escolar/EditarMatriculaDialog';
import { PagoModal, type Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';
import { CrearCargoEstudianteDialog } from '@/components/administracion-escolar/CrearCargoEstudianteDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { mesesDelPeriodo } from '@/lib/administracion-escolar/periodo-utils';
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
  periodoFechaInicio: string | null;
  periodoFechaFin: string | null;
  cursoId: number;
  curso: string | null;
  codigoMatricula: string | null;
  fechaInscripcion: string | null;
  estado: string;
  facturaRecurrenteId: number | null;
  notas: string | null;
}
interface Cargo {
  id: number;
  concepto: string | null;
  conceptoTipo: string | null;
  matriculaId: number;
  periodoId: number;
  mes: number | null;
  anio: number;
  montoCentavos: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  estado: string;
  ecfDocumentId: number | null;
  facturaClientId: number | null;
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
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
  const [pagos, setPagos]           = useState<Pago[]>([]);
  const [tutores, setTutores]       = useState<TutorVinculo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [notFound, setNotFound]     = useState(false);
  const [cargoVincularFactura, setCargoVincularFactura] = useState<Cargo | null>(null);
  const [matriculaEditar, setMatriculaEditar] = useState<Matricula | null>(null);
  // Reinscripción: crea una matrícula nueva (período/curso) para el estudiante.
  const [reinscribirAbierto, setReinscribirAbierto] = useState(false);
  // Período seleccionado en el filtro padre global (null = el primero/activo).
  const [periodoKey, setPeriodoKey] = useState<string | null>(null);

  // Modal de cobro in-place: reutiliza el PagoModal de Cuentas por Cobrar sin
  // salir del perfil. El flujo de datos es el mismo (registra en la factura).
  const [pagoCuenta, setPagoCuenta] = useState<Cuenta | null>(null);
  const [cargandoPago, setCargandoPago] = useState(false);
  const [aplicandoMoraFacturaId, setAplicandoMoraFacturaId] = useState<number | null>(null);

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

  // La mora pertenece al motor de facturación: crea una ND tipo 33 sobre la
  // factura del cargo. El perfil escolar nunca calcula ni persiste mora propia.
  const aplicarMora = useCallback(async (ecfDocumentId: number) => {
    setAplicandoMoraFacturaId(ecfDocumentId);
    try {
      const res = await fetch(`/api/facturas/${ecfDocumentId}/nota-debito-mora`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.info(data.error ?? 'Ya existe un cargo por mora para esta factura');
        return;
      }
      if (!res.ok) {
        if (res.status === 422) {
          toast.error(data.error ?? 'La factura no tiene saldo o el porcentaje de mora es cero');
          return;
        }
        throw new Error(data.error ?? 'No se pudo generar el cargo por mora');
      }
      toast.success('Cargo por mora generado');
      await cargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el cargo por mora');
    } finally {
      setAplicandoMoraFacturaId(null);
    }
  }, [cargar]);

  useEffect(() => { cargar(); }, [cargar]);

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

  // Grupos por período para el filtro padre global.
  const grupos = construirGruposPeriodo(matriculas, cargos);
  const grupoActivo = grupos.find((g) => g.key === periodoKey) ?? grupos[0] ?? null;

  return (
    <section className="p-6 space-y-5">
      <VolverLink />

      {/* Tarjeta horizontal del estudiante (sin encabezado duplicado) */}
      <div className="border border-gray-200 rounded-xl bg-white p-4">
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
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                {/* Identidad + chips */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-14 w-14 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-lg font-semibold shrink-0">
                    {`${estudiante.nombres[0] ?? ''}${estudiante.apellidos[0] ?? ''}`.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold text-gray-900 truncate">{estudiante.nombres} {estudiante.apellidos}</p>
                      {estudiante.estado !== 'activo' && (
                        <Badge variant="outline" className="capitalize text-gray-500 shrink-0">{estudiante.estado}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <InfoChip k="Código" v={estudiante.codigo ?? '—'} />
                      {matriculaActiva?.curso && <InfoChip k="Curso" v={matriculaActiva.curso} />}
                      {matriculaActiva?.periodo && <InfoChip k="Período" v={matriculaActiva.periodo} />}
                      <InfoChip k="Sexo · edad" v={`${labelSexo(estudiante.sexo)}${calcularEdad(estudiante.fechaNacimiento) != null ? ` · ${calcularEdad(estudiante.fechaNacimiento)} años` : ''}`} />
                      <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border ${estudiante.deudaCentavos > 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
                        <span className="text-[11px] opacity-70">Pendiente</span>
                        <b className="font-semibold">{estudiante.deudaCentavos > 0 ? fmtDOP(estudiante.deudaCentavos) : 'Al día'}</b>
                      </span>
                    </div>
                  </div>
                </div>
                {/* Tutor de pago (compacto) */}
                <div className="md:border-l md:border-gray-100 md:pl-4 md:min-w-[200px] shrink-0">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Tutor de pago</p>
                  {responsable ? (
                    <div className="mt-0.5">
                      <p className="font-semibold text-sm text-gray-900 truncate">{responsable.nombre}</p>
                      <p className="text-xs text-gray-500 capitalize truncate">
                        {responsable.relacion}{responsable.telefono ? ` · ${responsable.telefono}` : ''}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 mt-0.5">Sin asignar</p>
                  )}
                </div>
                {puedeGestionar && (
                  <Button variant="outline" size="sm" onClick={abrirEdicion} className="shrink-0 self-start md:self-center">
                    <Pencil className="h-4 w-4 mr-1.5" />Editar
                  </Button>
                )}
              </div>
            )}

      </div>

      {/* Filtro de período — padre global: filtra el detalle de "Por período".
          Al lado, la reinscripción crea una matrícula nueva (otro período/curso). */}
      {(grupos.length > 0 || puedeGestionar) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {grupos.length > 0
            ? <PeriodoFiltroBar grupos={grupos} value={grupoActivo?.key ?? null} onChange={setPeriodoKey} />
            : <span className="text-sm text-gray-400">Sin períodos matriculados</span>}
          {puedeGestionar && (
            <Button size="sm" variant="outline" onClick={() => setReinscribirAbierto(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Reinscribir
            </Button>
          )}
        </div>
      )}

      {/* Secciones: Por período · Tutores · Historial */}
      <div className="border border-gray-200 rounded-xl bg-white p-4">
        <Tabs defaultValue="periodo">
          <TabsList variant="line" className="w-full justify-start border-b border-gray-200 rounded-none px-0">
            <TabsTrigger value="periodo">Por período</TabsTrigger>
            <TabsTrigger value="tutores">Tutores</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
          </TabsList>

          {/* Por período — todo lo financiero (cuentas por cobrar, pagos,
              facturas + acciones), filtrado por el período elegido arriba. */}
          <TabsContent value="periodo" className="pt-4">
            {grupoActivo ? (
              <PeriodoDetalle
                grupo={grupoActivo}
                pagos={pagos}
                puedeFacturar={puedeFacturar}
                puedePagos={puedePagos}
                puedeGestionar={puedeGestionar}
                estudianteId={estudiante.id}
                tutorClientId={responsable?.clientId ?? null}
                onRegistrarPago={abrirPago}
                onAplicarMora={aplicarMora}
                aplicandoMoraFacturaId={aplicandoMoraFacturaId}
                onCargoCreado={cargar}
                onEditarMatricula={(mid) => {
                  const m = matriculas.find((x) => x.id === mid);
                  if (m) setMatriculaEditar(m);
                }}
                onVincular={setCargoVincularFactura}
              />
            ) : (
              <EmptyBox text="Sin períodos, cargos o pagos relacionados" />
            )}
          </TabsContent>

          {/* Tutores — gestión + contacto vinculado, separado de lo financiero. */}
          <TabsContent value="tutores" className="pt-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">Contacto vinculado</p>
              {estudiante.dependiente ? (
                <Link href={`/dashboard/clientes/${estudiante.dependiente.clienteId}/editar`}
                  className="inline-flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 hover:border-teal-300 hover:bg-teal-50/40 transition-colors">
                  <span className="font-semibold text-gray-900">{estudiante.dependiente.clienteRazonSocial}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-teal-700">
                    <Link2 className="h-3 w-3" />Ver contacto
                  </span>
                </Link>
              ) : (
                <p className="text-sm text-gray-400">Se establece al asignar el tutor de pago.</p>
              )}
            </div>
            {puedeGestionar ? (
              <TutoresPanel estudianteId={estudiante.id} tutores={tutores} onChange={cargar} />
            ) : (
              <div>
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
              </div>
            )}
          </TabsContent>

          {/* Historial */}
          <TabsContent value="historial" className="pt-4">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Historial de actividad</h2>
            <Historial matriculas={matriculas} pagos={pagos} />
          </TabsContent>
        </Tabs>
      </div>

      <EditarMatriculaDialog
        matricula={matriculaEditar}
        open={!!matriculaEditar}
        onClose={() => setMatriculaEditar(null)}
        onSaved={cargar}
      />

      {/* Reinscripción: matrícula nueva (otro período/curso) para el estudiante. */}
      <EditarMatriculaDialog
        matricula={null}
        crearParaEstudianteId={estudiante.id}
        open={reinscribirAbierto}
        onClose={() => setReinscribirAbierto(false)}
        onSaved={() => { setReinscribirAbierto(false); cargar(); }}
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

// Barra de período como filtro PADRE global (pills compactas). Al elegir un
// período, el detalle de "Por período" se filtra a ese período.
function PeriodoFiltroBar({ grupos, value, onChange }: {
  grupos: ReturnType<typeof construirGruposPeriodo>;
  value: string | null;
  onChange: (key: string) => void;
}) {
  const activeKey = value ?? grupos[0]?.key ?? null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mr-1">Período</span>
      {grupos.map((g) => {
        const saldo = g.cargos
          .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
          .reduce((s, c) => s + c.saldoCentavos, 0);
        const activo = g.key === activeKey;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => onChange(g.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              activo
                ? 'bg-teal-600 border-teal-600 text-white font-semibold'
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
            }`}
          >
            {g.periodo}
            <span className={`ml-1.5 text-xs ${activo ? 'text-teal-50' : saldo > 0 ? 'text-red-500' : 'text-gray-400'}`}>
              {g.curso}{saldo > 0 ? ` · ${fmtDOP(saldo)}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Detalle financiero de UN período (el seleccionado en la barra padre):
// acciones, resumen y sub-vistas (mensualidades, otros cargos, facturas, pagos).
function PeriodoDetalle({ grupo, pagos, puedeFacturar, puedePagos, puedeGestionar, estudianteId, tutorClientId, onRegistrarPago, onAplicarMora, aplicandoMoraFacturaId, onCargoCreado, onEditarMatricula, onVincular }: {
  grupo: NonNullable<ReturnType<typeof construirGruposPeriodo>[number]>;
  pagos: Pago[];
  puedeFacturar: boolean;
  puedePagos: boolean;
  puedeGestionar: boolean;
  estudianteId: number;
  tutorClientId: number | null;
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  aplicandoMoraFacturaId: number | null;
  onCargoCreado: () => void;
  onEditarMatricula: (matriculaId: number) => void;
  onVincular: (cargo: Cargo) => void;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<'mensualidades' | 'otros' | 'facturas' | 'pagos'>('mensualidades');
  const [crearCargoAbierto, setCrearCargoAbierto] = useState(false);
  const [elegirFacturaAbierto, setElegirFacturaAbierto] = useState(false);
  const [elegirPagoAbierto, setElegirPagoAbierto] = useState(false);

  const cargosPeriodo = grupo.cargos;
  const mesesAcademicos = mesesDelPeriodo(grupo.fechaInicio, grupo.fechaFin);
  const pagosPeriodo = pagos.filter((p) => p.cargoId != null && cargosPeriodo.some((c) => c.id === p.cargoId));
  const facturas = cargosPeriodo.filter((c) => c.ecfDocumentId != null);
  const total = cargosPeriodo.reduce((s, c) => s + c.montoCentavos, 0);
  const saldo = cargosPeriodo
    .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
    .reduce((s, c) => s + c.saldoCentavos, 0);
  const pagado = Math.max(0, total - saldo);
  // Mes solo identifica fecha. La tabla mensual agrupa exclusivamente concepto
  // mensualidad; uniforme/actividad con mes van a Otros cargos.
  const mensualidades = cargosPeriodo.filter((c) => c.conceptoTipo === 'mensualidad');
  const otrosCargos = cargosPeriodo.filter((c) => c.conceptoTipo !== 'mensualidad');
  const proximo = cargosPeriodo
    .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
    .sort((a, b) => (a.fechaVencimiento ?? '9999-12-31').localeCompare(b.fechaVencimiento ?? '9999-12-31'))[0] ?? null;
  const facturasPendientesPago = cargosPeriodo.filter((c) => (
    ['pendiente', 'parcial', 'vencido'].includes(c.estado)
    && c.ecfDocumentId
    && (tutorClientId == null || c.facturaClientId === tutorClientId)
  ));
  const facturasTutorIncorrecto = cargosPeriodo.filter((c) => (
    ['pendiente', 'parcial', 'vencido'].includes(c.estado)
    && c.ecfDocumentId
    && tutorClientId != null
    && c.facturaClientId !== tutorClientId
  ));
  const cargosSinFactura = cargosPeriodo.filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado) && !c.ecfDocumentId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900">Período {grupo.periodo}</h3>
          {grupo.estado && (
            <Badge className={grupo.estado === 'activa' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-600 border-gray-200'}>
              {grupo.estado === 'activa' ? 'Activa' : 'Finalizada'}
            </Badge>
          )}
          <span className="text-sm text-gray-500">· {grupo.curso}</span>
          {puedeGestionar && grupo.matriculaId && (
            <button type="button" onClick={() => onEditarMatricula(grupo.matriculaId!)}
              className="text-gray-400 hover:text-teal-600 transition-colors" title="Editar matrícula (curso/período)">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeGestionar && (
            <Button size="sm" variant="outline" onClick={() => setCrearCargoAbierto(true)} disabled={!grupo.matriculaId}>
              <Plus className="h-4 w-4 mr-1.5" />Agregar cargo
            </Button>
          )}
          {puedeFacturar && grupo.matriculaId && (
            <Button size="sm" variant="outline" onClick={() => router.push(
              grupo.facturaRecurrenteId
                ? `/dashboard/facturas-recurrentes/${grupo.facturaRecurrenteId}`
                : `/dashboard/facturas-recurrentes/nueva?matriculaId=${grupo.matriculaId}`,
            )} disabled={!grupo.facturaRecurrenteId && (!grupo.fechaInicio || !grupo.fechaFin)}>
              <FileText className="h-4 w-4 mr-1.5" />
              {grupo.facturaRecurrenteId ? 'Gestionar mensualidad' : 'Configurar mensualidad'}
            </Button>
          )}
          {puedePagos && (
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => setElegirPagoAbierto(true)} disabled={facturasPendientesPago.length === 0}>
              <Wallet className="h-4 w-4 mr-1.5" />Registrar pago
            </Button>
          )}
          {puedeFacturar && (
            <Button size="sm" variant="outline" onClick={() => setElegirFacturaAbierto(true)} disabled={cargosSinFactura.length === 0}>
              <FileText className="h-4 w-4 mr-1.5" />Crear factura
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Receipt className="h-4 w-4 mr-1.5" />Estado de cuenta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
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
        <div className="flex gap-6 border-b border-gray-200 overflow-x-auto">
          {[
            ['mensualidades', 'Cuentas por cobrar'],
            ['otros', 'Otros cargos'],
            ['facturas', 'Facturas'],
            ['pagos', 'Pagos'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setVista(value as typeof vista)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                vista === value ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {vista === 'mensualidades' && (
              <MensualidadesTabla
                cargos={mensualidades}
                pagos={pagos}
                mesesAcademicos={mesesAcademicos}
                puedePagos={puedePagos}
                puedeFacturar={puedeFacturar}
                onRegistrarPago={onRegistrarPago}
                onAplicarMora={onAplicarMora}
                onCrearFactura={(cargo) => router.push(`/dashboard/facturas/nueva?desdeCargo=${cargo.id}`)}
                onVincular={onVincular}
                aplicandoMoraFacturaId={aplicandoMoraFacturaId}
              />
            )}

            {vista === 'otros' && (
              otrosCargos.length === 0 ? <EmptyBox text="Sin otros cargos" /> : (
                <SimpleTable head={['Concepto', 'Vencimiento', 'Monto', 'Pagado', 'Pendiente', 'Factura', 'Acción']}
                  rows={otrosCargos.map((c) => {
                    const pagadoCargo = Math.max(0, c.montoCentavos - c.saldoCentavos);
                    return [
                      c.concepto ?? '—',
                      c.fechaVencimiento ? fmtFechaCorta(c.fechaVencimiento) : '—',
                      fmtDOP(c.montoCentavos),
                      fmtDOP(pagadoCargo),
                      <span key="saldo" className={c.saldoCentavos > 0 ? 'text-red-600 font-medium' : 'text-teal-700 font-medium'}>{fmtDOP(c.saldoCentavos)}</span>,
                      facturaLink(c),
                      <CargoActionsMenu
                        key="acciones"
                        cargo={c}
                        puedePagos={puedePagos}
                        puedeFacturar={puedeFacturar}
                        onRegistrarPago={onRegistrarPago}
                        onAplicarMora={onAplicarMora}
                        onCrearFactura={(cargo) => router.push(`/dashboard/facturas/nueva?desdeCargo=${cargo.id}`)}
                        onVincular={onVincular}
                        aplicandoMora={aplicandoMoraFacturaId === c.ecfDocumentId}
                      />,
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
      <CrearCargoEstudianteDialog
        open={crearCargoAbierto}
        onClose={() => setCrearCargoAbierto(false)}
        onSaved={onCargoCreado}
        estudianteId={estudianteId}
        matriculaId={grupo.matriculaId}
        periodoId={grupo.periodoId}
        periodoNombre={grupo.periodo}
        fechaInicio={grupo.fechaInicio}
        fechaFin={grupo.fechaFin}
      />
      {facturasTutorIncorrecto.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p>Hay {facturasTutorIncorrecto.length} cargo(s) con factura vinculada a otro contacto. No se muestran para cobrar.</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {facturasTutorIncorrecto.map((cargo) => (
              <Link key={cargo.id} href={`/dashboard/facturas/${cargo.ecfDocumentId}`}
                className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950">
                Revisar {cargo.facturaEncf ?? cargo.facturaCodigo ?? `factura #${cargo.ecfDocumentId}`}
              </Link>
            ))}
          </div>
        </div>
      )}
      <Dialog open={elegirPagoAbierto} onOpenChange={setElegirPagoAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>¿Qué deuda deseas cobrar?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">Solo aparecen facturas pendientes del tutor de pago actual.</p>
          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {facturasPendientesPago.map((cargo) => (
              <button key={cargo.id} type="button" onClick={() => { setElegirPagoAbierto(false); onRegistrarPago(cargo.ecfDocumentId!); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-teal-50/50">
                <span><span className="block text-sm font-medium text-gray-900">{cargo.concepto ?? 'Cargo'}</span><span className="block text-xs text-gray-500">{cargo.mes ? `${MESES[cargo.mes]} ${cargo.anio}` : cargo.anio} · {cargo.facturaEncf ?? cargo.facturaCodigo ?? `#${cargo.ecfDocumentId}`}</span></span>
                <span className="text-sm font-semibold text-red-600">{fmtDOP(cargo.saldoCentavos)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={elegirFacturaAbierto} onOpenChange={setElegirFacturaAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>¿Qué cargo deseas facturar?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">Selecciona el cargo. Facturas abrirá con tutor, beneficiario y producto prellenados.</p>
          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {cargosSinFactura.map((cargo) => (
              <button key={cargo.id} type="button" onClick={() => router.push(`/dashboard/facturas/nueva?desdeCargo=${cargo.id}`)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-teal-50/50">
                <span>
                  <span className="block text-sm font-medium text-gray-900">{cargo.concepto ?? 'Cargo'}</span>
                  <span className="block text-xs text-gray-500">{cargo.mes ? `${MESES[cargo.mes]} ${cargo.anio}` : cargo.anio}{cargo.fechaVencimiento ? ` · vence ${fmtFechaCorta(cargo.fechaVencimiento)}` : ''}</span>
                </span>
                <span className="text-sm font-semibold text-red-600">{fmtDOP(cargo.saldoCentavos)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
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

function MensualidadesTabla({ cargos, pagos, mesesAcademicos, puedePagos, puedeFacturar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, aplicandoMoraFacturaId }: {
  cargos: Cargo[];
  pagos: Pago[];
  mesesAcademicos: ReturnType<typeof mesesDelPeriodo>;
  puedePagos: boolean;
  puedeFacturar: boolean;
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  onCrearFactura: (cargo: Cargo) => void;
  onVincular: (cargo: Cargo) => void;
  aplicandoMoraFacturaId: number | null;
}) {
  const rows = mesesAcademicos.map(({ mes, anio }) => {
    const cargosMes = cargos.filter((c) => c.mes === mes && c.anio === anio);
    const total = cargosMes.reduce((s, c) => s + c.montoCentavos, 0);
    const saldo = cargosMes
      .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
      .reduce((s, c) => s + c.saldoCentavos, 0);
    const pagado = Math.max(0, total - saldo);
    const factura = cargosMes.find((c) => c.ecfDocumentId != null) ?? null;
    const accion = cargosMes.find((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado)) ?? factura;
    return { mes, anio, cargosMes, total, saldo, pagado, factura, accion, estado: estadoMes(cargosMes) };
  });

  if (mesesAcademicos.length === 0) {
    return (
      <EmptyBox text="Este período no tiene fechas de inicio y fin. Configúralas para ver sus meses académicos." />
    );
  }

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
            <tr key={`${r.anio}-${r.mes}`} className="border-t border-gray-100 hover:bg-gray-50/60">
              <td className="px-3 py-2.5 font-medium text-gray-900">{MESES[r.mes]} {r.anio}</td>
              <td className="px-3 py-2.5"><EstadoMesBadge estado={r.estado} /></td>
              <td className="px-3 py-2.5 text-right text-gray-700">{fmtDOP(r.total)}</td>
              <td className="px-3 py-2.5 text-right text-gray-700">{fmtDOP(r.pagado)}</td>
              <td className={`px-3 py-2.5 text-right font-medium ${r.saldo > 0 ? 'text-red-600' : 'text-teal-700'}`}>
                {fmtDOP(r.saldo)}
              </td>
              <td className="px-3 py-2.5">{r.factura ? facturaLink(r.factura) : <span className="text-gray-400">—</span>}</td>
              <td className="px-3 py-2.5 text-right">
                {r.accion ? (
                  <CargoActionsMenu
                    cargo={r.accion}
                    puedePagos={puedePagos}
                    puedeFacturar={puedeFacturar}
                    onRegistrarPago={onRegistrarPago}
                    onAplicarMora={onAplicarMora}
                    onCrearFactura={onCrearFactura}
                    onVincular={onVincular}
                    aplicandoMora={aplicandoMoraFacturaId === r.accion.ecfDocumentId}
                  />
                ) : <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
        <span>Mostrando {rows.length} de {rows.length} meses académicos</span>
      </div>
    </div>
  );
}

function CargoActionsMenu({ cargo, puedePagos, puedeFacturar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, aplicandoMora }: {
  cargo: Cargo;
  puedePagos: boolean;
  puedeFacturar: boolean;
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  onCrearFactura: (cargo: Cargo) => void;
  onVincular: (cargo: Cargo) => void;
  aplicandoMora: boolean;
}) {
  const pendiente = ['pendiente', 'parcial', 'vencido'].includes(cargo.estado);
  const tieneFactura = cargo.ecfDocumentId != null;
  const tieneAccion = (pendiente && tieneFactura && (puedePagos || puedeFacturar)) || (pendiente && !tieneFactura && puedeFacturar) || tieneFactura;
  if (!tieneAccion) return <span className="text-gray-300 text-xs">—</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Acciones de ${cargo.concepto ?? 'cargo'}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 data-[state=open]:bg-gray-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {pendiente && tieneFactura && puedePagos && (
          <DropdownMenuItem onSelect={() => onRegistrarPago(cargo.ecfDocumentId!)}>
            <Wallet className="h-4 w-4" />Registrar pago
          </DropdownMenuItem>
        )}
        {pendiente && tieneFactura && puedeFacturar && (
          <DropdownMenuItem disabled={aplicandoMora} onSelect={() => onAplicarMora(cargo.ecfDocumentId!)}>
            <AlertTriangle className="h-4 w-4" />{aplicandoMora ? 'Generando mora…' : 'Cargo por mora'}
          </DropdownMenuItem>
        )}
        {pendiente && !tieneFactura && puedeFacturar && (
          <DropdownMenuItem onSelect={() => onCrearFactura(cargo)}>
            <Receipt className="h-4 w-4" />Crear factura
          </DropdownMenuItem>
        )}
        {pendiente && !tieneFactura && puedeFacturar && (
          <DropdownMenuItem onSelect={() => onVincular(cargo)}>
            <Link2 className="h-4 w-4" />Vincular factura
          </DropdownMenuItem>
        )}
        {tieneFactura && (!pendiente || (!puedePagos && !puedeFacturar)) && (
          <DropdownMenuItem onSelect={() => window.location.assign(`/dashboard/facturas/${cargo.ecfDocumentId}`)}>
            <Receipt className="h-4 w-4" />Ver factura
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
    fechaInicio: string | null;
    fechaFin: string | null;
    facturaRecurrenteId: number | null;
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
      fechaInicio: m.periodoFechaInicio,
      fechaFin: m.periodoFechaFin,
      facturaRecurrenteId: m.facturaRecurrenteId,
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
          fechaInicio: null,
          fechaFin: null,
          facturaRecurrenteId: null,
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

// Chip compacto clave·valor para la tarjeta horizontal del estudiante.
function InfoChip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
      <span className="text-gray-400">{k}</span>
      <b className="font-semibold text-gray-800">{v}</b>
    </span>
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
