'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Receipt, Link2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { RegistrarPagoDialog } from '@/components/administracion-escolar/RegistrarPagoDialog';
import { EditarEstudianteDialog } from '@/components/administracion-escolar/EditarEstudianteDialog';
import { TutoresPanel } from '@/components/administracion-escolar/TutoresPanel';
import { VincularDependienteDialog } from '@/components/administracion-escolar/VincularDependienteDialog';
import { VincularFacturaDialog } from '@/components/administracion-escolar/VincularFacturaDialog';
import { usePermissions } from '@/lib/hooks/usePermissions';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface Estudiante {
  id: number;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  estado: string;
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
  periodoId: number;
  mes: number | null;
  anio: number;
  montoCentavos: number;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  estado: string;
  ecfDocumentId: number | null;
  facturaEncf: string | null;
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
  const [pagoOpen, setPagoOpen]     = useState(false);
  const [editOpen, setEditOpen]     = useState(false);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [cargoVincularFactura, setCargoVincularFactura] = useState<Cargo | null>(null);

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
          {puedeGestionar && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>Editar</Button>
          )}
          {puedePagos && (
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setPagoOpen(true)}
              disabled={estudiante.deudaCentavos === 0}>
              Registrar pago
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Columna resumen */}
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-xl bg-white p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-semibold shrink-0">
                {`${estudiante.nombres[0] ?? ''}${estudiante.apellidos[0] ?? ''}`.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{estudiante.nombres} {estudiante.apellidos}</p>
                <p className="text-xs text-gray-500">Fecha nac.: {fmtFechaCorta(estudiante.fechaNacimiento)}</p>
              </div>
            </div>

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

            {/* Contacto vinculado (dependiente de Contactos) */}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-900">Contacto vinculado</p>
                {puedeGestionar && (
                  <button className="text-xs text-teal-600 hover:underline" onClick={() => setVincularOpen(true)}>
                    {estudiante.dependiente ? 'Cambiar' : 'Vincular'}
                  </button>
                )}
              </div>
              {estudiante.dependiente ? (
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="font-semibold text-gray-900">
                    {estudiante.dependiente.nombre} {estudiante.dependiente.apellido}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Cliente: {estudiante.dependiente.clienteRazonSocial}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Sin vincular a Contactos</p>
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
        <div className="lg:col-span-2">
          <Tabs defaultValue="deudas">
            <TabsList variant="line" className="w-full justify-start border-b border-gray-200 rounded-none px-0">
              <TabsTrigger value="deudas">Deudas</TabsTrigger>
              <TabsTrigger value="pagos">Pagos</TabsTrigger>
              <TabsTrigger value="facturas">Facturas</TabsTrigger>
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
                        puedeFacturar={puedeFacturar}
                        onVincular={() => setCargoVincularFactura(c)}
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
                        puedeFacturar={puedeFacturar}
                        onVincular={() => setCargoVincularFactura(c)}
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

            {/* Matrículas */}
            <TabsContent value="matriculas" className="pt-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Historial de matrículas</h2>
              {matriculas.length === 0 ? (
                <EmptyBox text="Sin matrículas registradas" />
              ) : (
                <SimpleTable head={['Período', 'Curso', 'Inscripción', 'Estado']}
                  rows={matriculas.map((m) => [
                    m.periodo ?? '—',
                    m.curso ?? '—',
                    m.fechaInscripcion ? fmtFechaCorta(m.fechaInscripcion) : '—',
                    m.estado === 'activa'
                      ? <Badge key="e" className="bg-teal-50 text-teal-700 border-teal-200">Activa</Badge>
                      : <span key="e" className="capitalize text-gray-600">{m.estado}</span>,
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

      <RegistrarPagoDialog
        estudianteId={estudiante.id}
        estudianteNombre={`${estudiante.nombres} ${estudiante.apellidos}`}
        open={pagoOpen}
        onClose={() => setPagoOpen(false)}
        onDone={cargar}
      />

      <EditarEstudianteDialog
        estudiante={estudiante}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={cargar}
      />

      <VincularDependienteDialog
        estudianteId={estudiante.id}
        open={vincularOpen}
        onClose={() => setVincularOpen(false)}
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
    </section>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

function FacturaCell({ cargo, puedeGestionar, puedeFacturar, onVincular, onFacturar }: {
  cargo: Cargo; puedeGestionar: boolean; puedeFacturar: boolean;
  onVincular: () => void; onFacturar: () => void;
}) {
  if (cargo.ecfDocumentId) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-teal-700">
        <Receipt className="h-3 w-3" />{cargo.facturaEncf ?? `#${cargo.ecfDocumentId}`}
      </span>
    );
  }
  // Facturar solo tiene sentido para un cargo que aún debe algo.
  const facturable = ['pendiente', 'parcial', 'vencido'].includes(cargo.estado);
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
