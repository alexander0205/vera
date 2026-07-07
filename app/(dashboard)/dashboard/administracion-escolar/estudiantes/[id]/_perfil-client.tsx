'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { RegistrarPagoDialog } from '@/components/administracion-escolar/RegistrarPagoDialog';
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
  relacion: string;
  responsablePago: boolean;
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
  const { permissions } = usePermissions();
  const puedePagos = permissions.includes('administracion-escolar:pagos');

  const [estudiante, setEstudiante] = useState<Estudiante | null>(null);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [cargos, setCargos]         = useState<Cargo[]>([]);
  const [pagos, setPagos]           = useState<Pago[]>([]);
  const [tutores, setTutores]       = useState<TutorVinculo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [notFound, setNotFound]     = useState(false);
  const [pagoOpen, setPagoOpen]     = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
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
        {puedePagos && (
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setPagoOpen(true)}
            disabled={estudiante.deudaCentavos === 0}>
            Registrar pago
          </Button>
        )}
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
                  <SimpleTable head={['Concepto', 'Mes', 'Vencimiento', 'Monto', 'Saldo']}
                    rows={cargosPendientes.map((c) => [
                      c.concepto ?? '—',
                      c.mes ? MESES[c.mes] : '—',
                      c.fechaVencimiento ? fmtFechaCorta(c.fechaVencimiento) : '—',
                      fmtDOP(c.montoCentavos),
                      badgeSaldo(c),
                    ])} />
                )}
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-2">Todos los cargos</h2>
                {cargos.length === 0 ? (
                  <EmptyBox text="Sin cargos registrados" />
                ) : (
                  <SimpleTable head={['Concepto', 'Mes', 'Año', 'Monto', 'Saldo']}
                    rows={cargos.map((c) => [
                      c.concepto ?? '—',
                      c.mes ? MESES[c.mes] : '—',
                      String(c.anio),
                      fmtDOP(c.montoCentavos),
                      badgeSaldo(c),
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
    </section>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

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
