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
import { NativeSelect } from '@/components/ui/native-select';
import { ModalHeaderIcon } from '@/components/ui/modal-header-icon';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Loader2, Receipt, Link2, Wallet, AlertTriangle, Pencil, CalendarDays, FileText, MoreVertical, Plus, ChevronRight, Ban } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { SEXOS, labelSexo, calcularEdad } from '@/lib/administracion-escolar/estudiante-utils';
import { CAMPOS_SIGERD_ESTUDIANTE, GRUPOS_SIGERD } from '@/lib/administracion-escolar/estudiante-sigerd-campos';
import { TutoresPanel } from '@/components/administracion-escolar/TutoresPanel';
import { CapturaFoto } from '@/components/fotos/CapturaFoto';
import { VincularFacturaDialog } from '@/components/administracion-escolar/VincularFacturaDialog';
import { EditarMatriculaDialog } from '@/components/administracion-escolar/EditarMatriculaDialog';
import dynamic from 'next/dynamic';
import type { Cuenta } from '@/components/cuentas-por-cobrar/PagoModal';

/**
 * El modal de cobro arrastra diecisiete componentes de MUI entre él y su
 * selector de métodos de pago. Importado de forma normal, todo eso viajaba en
 * el paquete inicial de la ficha del estudiante, que se abre muchas veces al
 * día, para un diálogo que se abre pocas. Se carga cuando hace falta.
 */
const PagoModal = dynamic(
  () => import('@/components/cuentas-por-cobrar/PagoModal').then((m) => m.PagoModal),
  { ssr: false },
);
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
  const [cargoAnular, setCargoAnular] = useState<Cargo | null>(null);
  const [anulando, setAnulando] = useState(false);

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

  // Anula un cargo puesto por error (soft-delete en el backend). El backend
  // bloquea (409) los cargos con factura vinculada: hay que desvincular primero.
  // La confirmación vive en un modal propio (ConfirmarAnularDialog), no en el
  // window.confirm nativo del navegador.
  const confirmarAnular = useCallback(async () => {
    if (!cargoAnular) return;
    setAnulando(true);
    try {
      const res = await fetch(`/api/administracion-escolar/cargos/${cargoAnular.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo anular el cargo');
      toast.success('Cargo anulado');
      setCargoAnular(null);
      await cargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anular el cargo');
    } finally {
      setAnulando(false);
    }
  }, [cargar, cargoAnular]);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-zero-600" /></div>;
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
                  <Button size="sm" className="bg-zero-600 hover:bg-zero-700" onClick={guardarEdicion} disabled={savingEdit}>
                    {savingEdit ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Guardar'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                {/* Identidad + chips */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* La foto se toma con el teléfono desde aquí (QR): quien la
                      hace está delante del alumno, no delante del ordenador. */}
                  <CapturaFoto
                    entidad="estudiante"
                    entidadId={estudiante.id}
                    nombre={`${estudiante.nombres} ${estudiante.apellidos}`}
                    editable={puedeGestionar}
                    tamano={56}
                  />
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
                      <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border ${estudiante.deudaCentavos > 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-zero-50 text-zero-700 border-zero-200'}`}>
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

      {/* Ficha extendida (solo lo que esté lleno). */}
      <FichaAdicional estudiante={estudiante} />

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
                onAnular={setCargoAnular}
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
                  className="inline-flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 hover:border-zero-300 hover:bg-zero-50/40 transition-colors">
                  <span className="font-semibold text-gray-900">{estudiante.dependiente.clienteRazonSocial}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-zero-700">
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
                        ? <Badge key="p" className="bg-zero-50 text-zero-700 border-zero-200">Pago</Badge>
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
          <Loader2 className="h-8 w-8 animate-spin text-zero-600" />
        </div>
      )}
      {pagoCuenta && (
        <PagoModal
          cuenta={pagoCuenta}
          onClose={() => setPagoCuenta(null)}
          onSuccess={() => { setPagoCuenta(null); cargar(); }}
        />
      )}

      <ConfirmarAnularDialog
        cargo={cargoAnular}
        anulando={anulando}
        onCancel={() => { if (!anulando) setCargoAnular(null); }}
        onConfirm={confirmarAnular}
      />
    </section>
  );
}

// Confirmación de anular un cargo, con la estética de la app (Dialog + Button)
// en vez del window.confirm nativo del navegador.
function ConfirmarAnularDialog({ cargo, anulando, onCancel, onConfirm }: {
  cargo: Cargo | null;
  anulando: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = cargo
    ? `${cargo.concepto ?? 'Cargo'}${cargo.mes ? ` · ${MESES[cargo.mes]} ${cargo.anio}` : ''}`
    : '';
  return (
    <Dialog open={!!cargo} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Ban className="h-5 w-5" />
            </span>
            <DialogTitle>Anular cargo</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-2 text-sm text-gray-600">
          <p>Vas a anular <span className="font-medium text-gray-900">{label}</span>{cargo ? <> por <span className="font-medium text-gray-900">{fmtDOP(cargo.montoCentavos)}</span></> : null}.</p>
          <p>Dejará de contar en la deuda del estudiante. Esta acción no se puede deshacer.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={anulando}>Cancelar</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={onConfirm} disabled={anulando}>
            {anulando ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Anulando…</> : 'Anular cargo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
                ? 'bg-zero-600 border-zero-600 text-white font-semibold'
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
            }`}
          >
            {g.periodo}
            <span className={`ml-1.5 text-xs ${activo ? 'text-zero-50' : saldo > 0 ? 'text-red-500' : 'text-gray-400'}`}>
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
function PeriodoDetalle({ grupo, pagos, puedeFacturar, puedePagos, puedeGestionar, estudianteId, tutorClientId, onRegistrarPago, onAplicarMora, aplicandoMoraFacturaId, onCargoCreado, onEditarMatricula, onVincular, onAnular }: {
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
  onAnular: (cargo: Cargo) => void;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<'mensualidades' | 'otros' | 'facturas' | 'pagos'>('mensualidades');
  const [crearCargoAbierto, setCrearCargoAbierto] = useState(false);
  // Mes preseleccionado al agregar cargo desde el panel de un mes específico.
  // null = flujo general (elige el mes en el diálogo).
  const [cargoMesInicial, setCargoMesInicial] = useState<{ mes: number; anio: number } | null>(null);
  const [elegirFacturaAbierto, setElegirFacturaAbierto] = useState(false);

  // Los cargos anulados (puestos por error) no cuentan en NINGÚN cálculo del
  // período: ni Facturado, ni Pagado, ni saldo, ni las tablas. Se filtran acá,
  // en el origen, para que un anulado no aparezca como "pagado/adelantado".
  const cargosPeriodo = grupo.cargos.filter((c) => c.estado !== 'anulado');
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
  const facturasTutorIncorrecto = cargosPeriodo.filter((c) => (
    ['pendiente', 'parcial', 'vencido'].includes(c.estado)
    && c.ecfDocumentId
    && tutorClientId != null
    && c.facturaClientId !== tutorClientId
  ));
  const cargosSinFactura = cargosPeriodo.filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado) && !c.ecfDocumentId);
  // "Crear factura" respeta la sub-vista activa: en Cuentas por cobrar solo
  // ofrece mensualidades; en Otros cargos solo los que no son mensualidad. Así
  // una factura no mezcla mensualidades con uniformes/actividades.
  const cargosSinFacturaVista = vista === 'otros'
    ? cargosSinFactura.filter((c) => c.conceptoTipo !== 'mensualidad')
    : vista === 'mensualidades'
      ? cargosSinFactura.filter((c) => c.conceptoTipo === 'mensualidad')
      : cargosSinFactura;

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
              className="text-gray-400 hover:text-zero-600 transition-colors" title="Editar matrícula (curso/período)">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
          {puedeFacturar && (
            <Button size="sm" variant="outline" onClick={() => setElegirFacturaAbierto(true)} disabled={cargosSinFacturaVista.length === 0}>
              <FileText className="h-4 w-4 mr-1.5" />Facturar varios meses
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
                vista === value ? 'border-zero-600 text-zero-700' : 'border-transparent text-gray-500 hover:text-gray-900'
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
                puedeGestionar={puedeGestionar}
                onRegistrarPago={onRegistrarPago}
                onAplicarMora={onAplicarMora}
                onCrearFactura={(cargo) => router.push(`/dashboard/facturas/nueva?desdeCargo=${cargo.id}`)}
                onVincular={onVincular}
                onAnular={onAnular}
                onAgregarCargoMes={grupo.matriculaId ? (mes, anio) => { setCargoMesInicial({ mes, anio }); setCrearCargoAbierto(true); } : undefined}
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
                      <span key="saldo" className={c.saldoCentavos > 0 ? 'text-red-600 font-medium' : 'text-zero-700 font-medium'}>{fmtDOP(c.saldoCentavos)}</span>,
                      facturaLink(c),
                      <CargoActionsMenu
                        key="acciones"
                        cargo={c}
                        puedePagos={puedePagos}
                        puedeFacturar={puedeFacturar}
                        puedeGestionar={puedeGestionar}
                        onRegistrarPago={onRegistrarPago}
                        onAplicarMora={onAplicarMora}
                        onCrearFactura={(cargo) => router.push(`/dashboard/facturas/nueva?desdeCargo=${cargo.id}`)}
                        onVincular={onVincular}
                        onAnular={onAnular}
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
        onClose={() => { setCrearCargoAbierto(false); setCargoMesInicial(null); }}
        onSaved={onCargoCreado}
        estudianteId={estudianteId}
        matriculaId={grupo.matriculaId}
        periodoId={grupo.periodoId}
        periodoNombre={grupo.periodo}
        fechaInicio={grupo.fechaInicio}
        fechaFin={grupo.fechaFin}
        mesInicial={cargoMesInicial?.mes ?? null}
        anioInicial={cargoMesInicial?.anio ?? null}
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
      <ElegirCargosFacturarDialog
        open={elegirFacturaAbierto}
        onOpenChange={setElegirFacturaAbierto}
        cargos={cargosSinFacturaVista}
        estudianteId={estudianteId}
        matriculaId={grupo.matriculaId}
        periodoId={grupo.periodoId}
        mesesAcademicos={mesesAcademicos}
        soloTipo={vista === 'otros' ? 'otros' : vista === 'mensualidades' ? 'mensualidad' : null}
        onCargoCreado={onCargoCreado}
        onConfirm={(ids) => router.push(
          ids.length > 1
            ? `/dashboard/facturas/nueva?desdeCargos=${ids.join(',')}`
            : `/dashboard/facturas/nueva?desdeCargo=${ids[0]}`,
        )}
      />
    </div>
  );
}

// Selector de cargos a facturar en UNA sola factura (factura mayor). Se marca
// uno o varios meses/cargos y se crea una única factura que los cubre (un mes
// por línea). Luego esa factura se cobra normal: los abonos se acumulan en su
// historial hasta saldarla. Resuelve "pagar varios meses de golpe".
//
// Extra: permite crear un cargo nuevo aplicándolo a varios meses de una vez
// (concepto + monto + meses). Al crearlos, se refrescan y entran a la lista ya
// marcados, listos para incluirlos en la misma factura.
function ElegirCargosFacturarDialog({ open, onOpenChange, cargos, onConfirm, estudianteId, matriculaId, periodoId, mesesAcademicos, soloTipo, onCargoCreado }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cargos: Cargo[];
  onConfirm: (ids: number[]) => void;
  estudianteId: number;
  matriculaId: number | null;
  periodoId: number | null;
  mesesAcademicos: ReturnType<typeof mesesDelPeriodo>;
  soloTipo: 'mensualidad' | 'otros' | null;
  onCargoCreado: () => void;
}) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  // Se depende de los ids y no del array: `cargos` sale de un filter en el
  // render del padre, así que es un array nuevo cada vez y el efecto se
  // redisparaba en cualquier re-render, borrando lo que el usuario acababa de
  // desmarcar mientras el diálogo seguía abierto.
  const idsCargos = cargos.map((c) => c.id).join(',');
  useEffect(() => {
    if (!open) return;
    setSel(new Set(idsCargos ? idsCargos.split(',').map(Number) : []));
  }, [open, idsCargos]);

  // ── Crear cargo para varios meses ──────────────────────────────────────────
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [conceptos, setConceptos] = useState<{ id: number; nombre: string; tipo: string }[]>([]);
  const [conceptoId, setConceptoId] = useState('');
  const [monto, setMonto] = useState('');
  const [mesesCargo, setMesesCargo] = useState<Set<string>>(new Set());
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setMostrarCrear(false); setErrorCrear(null); setMonto(''); setMesesCargo(new Set()); setConceptoId(''); return; }
    fetch('/api/administracion-escolar/conceptos')
      .then((r) => r.json())
      .then((d: { conceptos?: { id: number; nombre: string; tipo: string; activo?: boolean }[] }) => {
        const lista = (d.conceptos ?? []).filter((c) => c.activo !== false && (
          soloTipo === 'mensualidad' ? c.tipo === 'mensualidad'
            : soloTipo === 'otros' ? c.tipo !== 'mensualidad'
              : true));
        setConceptos(lista);
      })
      .catch(() => setConceptos([]));
  }, [open, soloTipo]);

  const seleccionados = cargos.filter((c) => sel.has(c.id));
  const ids = seleccionados.map((c) => c.id);
  const total = seleccionados.reduce((s, c) => s + c.saldoCentavos, 0);
  const montoCentavos = Math.round((parseFloat(monto.replace(',', '.')) || 0) * 100);

  function toggle(id: number) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleMes(key: string) {
    setMesesCargo((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function crearCargos() {
    if (!matriculaId || !periodoId) { setErrorCrear('El período no tiene una matrícula válida'); return; }
    if (!conceptoId || montoCentavos <= 0) { setErrorCrear('Concepto y monto son obligatorios'); return; }
    if (mesesCargo.size === 0) { setErrorCrear('Selecciona al menos un mes'); return; }
    setCreando(true);
    setErrorCrear(null);
    try {
      for (const key of mesesCargo) {
        const m = mesesAcademicos.find((x) => x.key === key);
        if (!m) continue;
        const res = await fetch('/api/administracion-escolar/cargos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estudianteId, matriculaId, periodoId, conceptoId: Number(conceptoId),
            mes: m.mes, anio: m.anio, montoCentavos,
            fechaVencimiento: `${m.anio}-${String(m.mes).padStart(2, '0')}-05`,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? 'No se pudo crear el cargo');
        }
      }
      // Refresca la lista: los nuevos cargos entran y quedan marcados (el effect
      // de arriba re-selecciona todos al cambiar `cargos`).
      setMonto('');
      setMesesCargo(new Set());
      setMostrarCrear(false);
      onCargoCreado();
    } catch (e: unknown) {
      setErrorCrear(e instanceof Error ? e.message : 'Error creando los cargos');
    } finally {
      setCreando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <ModalHeaderIcon icon={FileText} title="Facturar varios meses"
          subtitle="Une varias mensualidades en una sola factura." />
        <p className="px-6 text-sm text-gray-500">
          Marca los meses/cargos a incluir. Se crea <b>una sola factura</b> que los cubre
          (un mes por línea). Luego la cobras normal: puedes abonar en partes y los
          pagos se acumulan en su historial hasta saldarla.
        </p>

        {/* Crear cargo para varios meses de una vez */}
        {matriculaId != null && mesesAcademicos.length > 0 && (
          <div className="rounded-lg border border-gray-200">
            {!mostrarCrear ? (
              <button type="button" onClick={() => setMostrarCrear(true)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium text-zero-600 hover:text-zero-700">
                <Plus className="h-4 w-4" />Agregar un cargo a varios meses
              </button>
            ) : (
              <div className="space-y-3 p-3">
                {errorCrear && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{errorCrear}</div>}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Concepto</Label>
                    <NativeSelect value={conceptoId} onChange={(e) => setConceptoId(e.target.value)}>
                      <option value="" disabled>Concepto</option>
                      {conceptos.map((c) => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Monto por mes (RD$)</Label>
                    <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Meses afectados</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {mesesAcademicos.map((m) => {
                      const activo = mesesCargo.has(m.key);
                      return (
                        <button key={m.key} type="button" onClick={() => toggleMes(m.key)}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${activo ? 'border-zero-600 bg-zero-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                          {MESES[m.mes]} {m.anio}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {mesesCargo.size > 0 && montoCentavos > 0
                      ? `${mesesCargo.size} cargo(s) · ${fmtDOP(montoCentavos * mesesCargo.size)} total`
                      : 'Elige concepto, monto y meses'}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setMostrarCrear(false)} disabled={creando}>Cancelar</Button>
                    <Button size="sm" className="bg-zero-600 hover:bg-zero-700" onClick={crearCargos} disabled={creando}>
                      {creando ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Creando…</> : 'Crear cargos'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
          {cargos.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-400">Sin cargos por facturar. Agrega uno arriba.</p>
          ) : cargos.map((cargo) => (
            <label key={cargo.id} className="flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-zero-50/50">
              <input type="checkbox" checked={sel.has(cargo.id)} onChange={() => toggle(cargo.id)}
                className="h-4 w-4 rounded border-gray-300 text-zero-600 focus:ring-zero-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">{cargo.concepto ?? 'Cargo'}</span>
                <span className="block text-xs text-gray-500">{cargo.mes ? `${MESES[cargo.mes]} ${cargo.anio}` : cargo.anio}{cargo.fechaVencimiento ? ` · vence ${fmtFechaCorta(cargo.fechaVencimiento)}` : ''}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-red-600">{fmtDOP(cargo.saldoCentavos)}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="bg-zero-600 hover:bg-zero-700" disabled={ids.length === 0}
            onClick={() => { onConfirm(ids); onOpenChange(false); }}>
            {ids.length > 1 ? `Facturar ${ids.length} en una factura (${fmtDOP(total)})` : 'Facturar cargo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    teal: 'text-zero-600',
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

function MensualidadesTabla({ cargos, pagos, mesesAcademicos, puedePagos, puedeFacturar, puedeGestionar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAgregarCargoMes, aplicandoMoraFacturaId }: {
  cargos: Cargo[];
  pagos: Pago[];
  mesesAcademicos: ReturnType<typeof mesesDelPeriodo>;
  puedePagos: boolean;
  puedeFacturar: boolean;
  puedeGestionar: boolean;
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  onCrearFactura: (cargo: Cargo) => void;
  onVincular: (cargo: Cargo) => void;
  onAnular: (cargo: Cargo) => void;
  onAgregarCargoMes?: (mes: number, anio: number) => void;
  aplicandoMoraFacturaId: number | null;
}) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const rows = mesesAcademicos.map(({ mes, anio }) => {
    const cargosMes = cargos.filter((c) => c.mes === mes && c.anio === anio);
    const total = cargosMes.reduce((s, c) => s + c.montoCentavos, 0);
    const saldo = cargosMes
      .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
      .reduce((s, c) => s + c.saldoCentavos, 0);
    const pagado = Math.max(0, total - saldo);
    const factura = cargosMes.find((c) => c.ecfDocumentId != null) ?? null;
    const accion = cargosMes.find((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado)) ?? factura;
    // Historial de pagos del mes: los abonos hechos a las facturas de sus cargos.
    // Una factura, varios pagos (abonos parciales) → subfilas al desplegar.
    const cargoIds = new Set(cargosMes.map((c) => c.id));
    const pagosMes = pagos
      .filter((p) => p.cargoId != null && cargoIds.has(p.cargoId))
      .sort((a, b) => (a.fechaPago < b.fechaPago ? 1 : -1));
    return { mes, anio, cargosMes, total, saldo, pagado, factura, accion, pagosMes, estado: estadoMes(cargosMes) };
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
          {rows.map((r) => {
            const key = `${r.anio}-${r.mes}`;
            const abierto = expandidos.has(key);
            return (
              <MesFila
                key={key}
                r={r}
                abierto={abierto}
                onToggle={() => setExpandidos((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                })}
                puedePagos={puedePagos}
                puedeFacturar={puedeFacturar}
                puedeGestionar={puedeGestionar}
                onRegistrarPago={onRegistrarPago}
                onAplicarMora={onAplicarMora}
                onCrearFactura={onCrearFactura}
                onVincular={onVincular}
                onAnular={onAnular}
                onAgregarCargoMes={onAgregarCargoMes}
                aplicandoMoraFacturaId={aplicandoMoraFacturaId}
              />
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
        <span>Mostrando {rows.length} de {rows.length} meses académicos</span>
      </div>
    </div>
  );
}

type MesRow = {
  mes: number; anio: number; cargosMes: Cargo[];
  total: number; saldo: number; pagado: number;
  factura: Cargo | null; accion: Cargo | null; pagosMes: Pago[];
  estado: ReturnType<typeof estadoMes>;
};

// Fila de un mes + panel desplegable del mes: historial de abonos y las
// acciones contextuales de ese mes (agregar cargo). Todos los meses son
// clickeables —incluso sin cargo o con factura impaga— para configurarlos ahí.
function MesFila({ r, abierto, onToggle, puedePagos, puedeFacturar, puedeGestionar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAgregarCargoMes, aplicandoMoraFacturaId }: {
  r: MesRow;
  abierto: boolean;
  onToggle: () => void;
  puedePagos: boolean;
  puedeFacturar: boolean;
  puedeGestionar: boolean;
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  onCrearFactura: (cargo: Cargo) => void;
  onVincular: (cargo: Cargo) => void;
  onAnular: (cargo: Cargo) => void;
  onAgregarCargoMes?: (mes: number, anio: number) => void;
  aplicandoMoraFacturaId: number | null;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-t border-gray-100 hover:bg-gray-50/60"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 font-medium text-gray-900">
          <span className="inline-flex items-center gap-1.5">
            <ChevronRight className={`h-3.5 w-3.5 text-gray-400 transition-transform ${abierto ? 'rotate-90' : ''}`} />
            {MESES[r.mes]} {r.anio}
            {r.pagosMes.length > 0 && (
              <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {r.pagosMes.length} {r.pagosMes.length === 1 ? 'pago' : 'pagos'}
              </span>
            )}
          </span>
        </td>
        <td className="px-3 py-2.5"><EstadoMesBadge estado={r.estado} /></td>
        <td className="px-3 py-2.5 text-right text-gray-700">{fmtDOP(r.total)}</td>
        <td className="px-3 py-2.5 text-right text-gray-700">{fmtDOP(r.pagado)}</td>
        <td className={`px-3 py-2.5 text-right font-medium ${r.saldo > 0 ? 'text-red-600' : 'text-zero-700'}`}>
          {fmtDOP(r.saldo)}
        </td>
        <td className="px-3 py-2.5">{r.factura ? facturaLink(r.factura) : <span className="text-gray-400">—</span>}</td>
        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
          {r.accion ? (
            <CargoActionsMenu
              cargo={r.accion}
              puedePagos={puedePagos}
              puedeFacturar={puedeFacturar}
              puedeGestionar={puedeGestionar}
              mesTieneFactura={!!r.factura}
              onRegistrarPago={onRegistrarPago}
              onAplicarMora={onAplicarMora}
              onCrearFactura={onCrearFactura}
              onVincular={onVincular}
              onAnular={onAnular}
              aplicandoMora={aplicandoMoraFacturaId === r.accion.ecfDocumentId}
            />
          ) : <span className="text-gray-300">—</span>}
        </td>
      </tr>
      {abierto && (
        <tr className="bg-gray-50/40">
          <td colSpan={7} className="px-3 py-0">
            <MesPanel
              r={r}
              puedeGestionar={puedeGestionar}
              onAgregarCargoMes={onAgregarCargoMes}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// Panel del mes: primero de QUÉ se compone el mes —la fila de arriba enseña un
// total y nadie sabe si esos RD$330 son la mensualidad, la mensualidad más el
// uniforme, o un cargo suelto que alguien añadió— y debajo el historial de
// abonos con el saldo restante. La única acción propia del panel es agregar un
// cargo al mes; registrar pago / facturar / vincular viven SOLO en el menú ⋮ de
// la fila (CargoActionsMenu) para no duplicar acciones.
function MesPanel({ r, puedeGestionar, onAgregarCargoMes }: {
  r: MesRow;
  puedeGestionar: boolean;
  onAgregarCargoMes?: (mes: number, anio: number) => void;
}) {
  const ahora = new Date();
  const esFuturo = r.anio > ahora.getFullYear() || (r.anio === ahora.getFullYear() && r.mes > ahora.getMonth() + 1);
  const sinCargo = r.cargosMes.length === 0;

  return (
    <div className="my-2 rounded-lg border border-gray-200 bg-white">
      {r.cargosMes.length > 0 && (
        <div className="border-b border-gray-100">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-xs font-semibold text-gray-700">Conceptos del mes</span>
            <span className="text-xs text-gray-500">
              {r.cargosMes.length} concepto{r.cargosMes.length === 1 ? '' : 's'}
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] text-gray-400">
                <th className="px-3 py-1.5 font-medium">Concepto</th>
                <th className="px-3 py-1.5 font-medium">Vence</th>
                <th className="px-3 py-1.5 font-medium">Estado</th>
                <th className="px-3 py-1.5 text-right font-medium">Monto</th>
                <th className="px-3 py-1.5 text-right font-medium">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {r.cargosMes.map((c) => {
                const anulado = c.estado === 'anulado';
                return (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className={`px-3 py-1.5 ${anulado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {c.concepto ?? 'Sin concepto'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">
                      {c.fechaVencimiento ? fmtFechaCorta(c.fechaVencimiento) : '—'}
                    </td>
                    <td className="px-3 py-1.5"><EstadoCargoBadge estado={c.estado} /></td>
                    <td className={`px-3 py-1.5 text-right ${anulado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {fmtDOP(c.montoCentavos)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {anulado ? (
                        <span className="text-gray-400">—</span>
                      ) : c.saldoCentavos > 0 ? (
                        <span className="font-medium text-red-600">{fmtDOP(c.saldoCentavos)}</span>
                      ) : (
                        <span className="text-zero-700">Pagado</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold text-gray-700">Historial de pagos</span>
        <span className="text-xs text-gray-500">
          Abonado <b className="text-zero-700">{fmtDOP(r.pagado)}</b>
          {r.saldo > 0 && <> · Pendiente <b className="text-red-600">{fmtDOP(r.saldo)}</b></>}
        </span>
      </div>
      {r.pagosMes.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] text-gray-400">
              <th className="px-3 py-1.5 font-medium">Fecha</th>
              <th className="px-3 py-1.5 font-medium">Método</th>
              <th className="px-3 py-1.5 font-medium">Referencia</th>
              <th className="px-3 py-1.5 font-medium text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {r.pagosMes.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-3 py-1.5 text-gray-700">{fmtFechaCorta(p.fechaPago)}</td>
                <td className="px-3 py-1.5 capitalize text-gray-700">{p.metodo ?? '—'}</td>
                <td className="px-3 py-1.5 text-gray-500">{p.referencia ?? '—'}</td>
                <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmtDOP(p.montoCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-3 py-3 text-xs text-gray-400">
          {sinCargo
            ? (esFuturo ? 'Mes aún no generado. Puedes agregar el cargo y cobrarlo por adelantado desde el menú de acciones.' : 'Sin cargo generado para este mes.')
            : 'Sin pagos registrados aún.'}
        </p>
      )}
      {puedeGestionar && onAgregarCargoMes && (
        <div className="flex justify-end border-t border-gray-100 px-3 py-2">
          <button
            type="button"
            onClick={() => onAgregarCargoMes(r.mes, r.anio)}
            className="inline-flex items-center gap-1 text-xs font-medium text-zero-600 hover:text-zero-700"
          >
            <Plus className="h-3.5 w-3.5" />Agregar cargo a {MESES[r.mes]}
          </button>
        </div>
      )}
    </div>
  );
}

function CargoActionsMenu({ cargo, puedePagos, puedeFacturar, puedeGestionar, mesTieneFactura, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, aplicandoMora }: {
  cargo: Cargo;
  puedePagos: boolean;
  puedeFacturar: boolean;
  puedeGestionar: boolean;
  /** Solo mensualidades: el MES ya tiene una factura en otro de sus cargos.
   *  Bloquea "Anular cargo" aunque este cargo suelto no tenga factura. */
  mesTieneFactura?: boolean;
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  onCrearFactura: (cargo: Cargo) => void;
  onVincular: (cargo: Cargo) => void;
  onAnular: (cargo: Cargo) => void;
  aplicandoMora: boolean;
}) {
  const pendiente = ['pendiente', 'parcial', 'vencido'].includes(cargo.estado);
  const tieneFactura = cargo.ecfDocumentId != null;
  // Anular solo cargos SIN factura (el backend bloquea el resto): el cobro vive
  // en la factura. También se oculta si el MES ya tiene factura en otro cargo
  // (mensualidad duplicada) — borrar la factura es otro flujo, no "anular cargo".
  const puedeAnular = puedeGestionar && cargo.estado !== 'anulado' && !tieneFactura && !mesTieneFactura;
  const tieneAccion = (pendiente && tieneFactura && (puedePagos || puedeFacturar)) || (pendiente && !tieneFactura && puedeFacturar) || tieneFactura || puedeAnular;
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
        {puedeAnular && (
          <DropdownMenuItem
            onSelect={() => onAnular(cargo)}
            className="text-red-600 focus:text-red-600"
          >
            <Ban className="h-4 w-4" />Anular cargo
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
        <div className="flex justify-between gap-2"><span>Saldo</span><span className={saldo > 0 ? 'font-medium text-red-600' : 'font-medium text-zero-700'}>{fmtDOP(saldo)}</span></div>
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

/**
 * El estado de UN cargo, no el del mes entero.
 *
 * Va aparte de `EstadoMesBadge` porque los valores no son los mismos: un mes
 * puede estar "adelantado" o "sin cargo", que son conclusiones sacadas de mirar
 * varios cargos a la vez, y un cargo suelto puede estar "anulado", que a nivel
 * de mes no significa nada.
 */
function EstadoCargoBadge({ estado }: { estado: string }) {
  if (estado === 'pagado')  return <Badge className="bg-zero-50 text-zero-700 border-zero-200">Pagado</Badge>;
  if (estado === 'vencido') return <Badge className="bg-red-50 text-red-600 border-red-200">Vencido</Badge>;
  if (estado === 'parcial') return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Parcial</Badge>;
  if (estado === 'anulado') return <Badge variant="outline" className="text-gray-400">Anulado</Badge>;
  return <Badge className="bg-gray-50 text-gray-600 border-gray-200">Pendiente</Badge>;
}

function EstadoMesBadge({ estado }: { estado: ReturnType<typeof estadoMes> }) {
  if (estado === 'pagado') return <Badge className="bg-zero-50 text-zero-700 border-zero-200">Pagado</Badge>;
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
      className="inline-flex items-center gap-1 text-xs text-zero-700 hover:text-zero-800 hover:underline">
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
        className="inline-flex items-center gap-1 text-xs text-zero-700 hover:text-zero-800 hover:underline">
        <Receipt className="h-3 w-3" />{ref}
      </Link>
    );
    // Con factura y saldo pendiente: ir a la factura a registrar el cobro.
    if (puedePagos && facturable) {
      return (
        <span className="inline-flex items-center justify-end gap-3">
          {chip}
          <button onClick={onRegistrarPago} className="inline-flex items-center gap-1 text-xs text-zero-600 hover:text-zero-700 font-medium transition-colors">
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
      <button key="fac" onClick={onFacturar} className="inline-flex items-center gap-1 text-xs text-zero-600 hover:text-zero-700 font-medium transition-colors">
        <Receipt className="h-3 w-3" />Facturar
      </button>,
    );
  }
  if (puedeGestionar) {
    acciones.push(
      <button key="vin" onClick={onVincular} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-zero-600 transition-colors">
        <Link2 className="h-3 w-3" />Vincular
      </button>,
    );
  }
  if (acciones.length === 0) return <span className="text-gray-300 text-xs">—</span>;
  return <span className="inline-flex items-center justify-end gap-3">{acciones}</span>;
}

function VolverLink() {
  return (
    <Link href="/escolar/estudiantes"
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-zero-600 transition-colors">
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

/**
 * Ficha extendida (los campos "estilo SIGERD"). Solo lista lo que esté lleno; si
 * el estudiante no tiene ninguno, no pinta nada (no ensucia el perfil).
 */
function FichaAdicional({ estudiante }: { estudiante: Estudiante }) {
  const ex = estudiante as unknown as Record<string, string | null>;
  const llenos = CAMPOS_SIGERD_ESTUDIANTE.filter((c) => (ex[c.key] ?? '').toString().trim() !== '');
  if (llenos.length === 0) return null;
  const grupos = GRUPOS_SIGERD.filter((g) => llenos.some((c) => c.grupo === g));
  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Datos adicionales</h2>
      {grupos.map((g) => (
        <div key={g} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{g}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {llenos.filter((c) => c.grupo === g).map((c) => (
              <div key={c.key} className="min-w-0">
                <p className="text-[11px] text-gray-400">{c.label}</p>
                <p className="text-sm text-gray-900 break-words">{ex[c.key]}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
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
          <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${e.tipo === 'pago' ? 'bg-zero-500' : 'bg-gray-400'}`} />
          <div>
            <p className="text-sm text-gray-800">{e.texto}</p>
            <p className="text-xs text-gray-400">{fmtFechaCorta(e.fecha)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
