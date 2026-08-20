'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { ModalHeader } from '@/components/ui/modal-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Loader2, Wallet, Pencil, Plus, ChevronRight, Ban, Mail, MessageCircle, Smartphone, Users } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { useVolver } from '@/lib/hooks/useVolver';
import { useTabUrl } from '@/lib/hooks/useUrlEstado';

import { labelSexo, calcularEdad } from '@/lib/administracion-escolar/estudiante-utils';
import { CAMPOS_SIGERD_ESTUDIANTE, GRUPOS_SIGERD } from '@/lib/administracion-escolar/estudiante-sigerd-campos';
import { TutoresPanel, type TutorVinculo as TutorPanelVinculo } from '@/components/administracion-escolar/TutoresPanel';
import { ResponsablePagoDialog, type Contacto } from '@/components/administracion-escolar/ResponsablePagoDialog';
import { DocumentosEstudiante } from '@/components/administracion-escolar/DocumentosEstudiante';
import { CapturaFoto } from '@/components/fotos/CapturaFoto';
import { VincularFacturaDialog } from '@/components/administracion-escolar/VincularFacturaDialog';
import { MatriculaDialog } from '@/components/administracion-escolar/MatriculaDialog';
import { type CobroDelColegio } from '@/components/administracion-escolar/DetalleCuotaDialog';

import { ReenviarAvisoDialog } from '@/components/administracion-escolar/ReenviarAvisoDialog';
import { PeriodoDetalle, FacturasSueltas, CanalChip, MESES, AVISO_TEXTO, construirGruposPeriodo, EmptyBox, SimpleTable, type Matricula, type Cargo, type Pago, type PagoSuelto, type FacturaSuelta, type AvisoEnviado, type AvisoProgramado, type PlanesPorMatricula } from '@/components/administracion-escolar/PeriodoDetalle';
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
  /** Registro Nacional del Estudiante: el número con el que el MINERD lo identifica. */
  codigoRne: string | null;
  nombres: string;
  apellidos: string;
  estado: string;
  sexo: string | null;
  fechaNacimiento: string | null;
  deudaCentavos: number;
  dependienteId: number | null;
  dependiente: { nombre: string; apellido: string; clienteId: number; clienteRazonSocial: string } | null;
  /** El contacto al que se le factura. Es el responsable de pago del alumno. */
  responsable: {
    clientId: number; razonSocial: string; rnc: string | null;
    email: string | null; telefono: string | null;
    celular: string | null; whatsapp: string | null;
  } | null;
}
interface TutorVinculo {
  id: number;
  tutorId: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  imagen: string | null;
  relacion: string;
}

interface FichaResp {
  estudiante: Estudiante;
  matriculas: Matricula[];
  cargos: Cargo[];
  pagos: Pago[];
  tutores: TutorVinculo[];
  /** Plan de cobro por matrícula. Viene todo para que cambiar de período no pida nada. */
  planes: PlanesPorMatricula;
  /** Política de recargo del negocio y canales de aviso del colegio. */
  cobro: CobroDelColegio;
  /** Facturas a su nombre que no salieron de ningún cargo escolar. */
  facturasSueltas: FacturaSuelta[];
  /** Lo que se debe de esas facturas. No lo cuenta `deudaCentavos`. */
  deudaFacturasCentavos: number;
  /** Pagos de esas facturas: no pasan por ningún cargo. */
  pagosSueltos: PagoSuelto[];
  /** Recordatorios ya mandados: constancia, y marca por canal en cada cargo. */
  avisos: AvisoEnviado[];
  /** Los que todavía no han salido, con la fecha en que les toca. */
  avisosProgramados: AvisoProgramado[];
}

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

const TABS = ['periodo', 'tutores', 'documentos', 'avisos', 'historial'] as const;
export default function PerfilEstudianteClient({ id }: { id: number }) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedePagos = permissions.includes('administracion-escolar:pagos');
  const puedeGestionar = permissions.includes('administracion-escolar:gestionar');
  // Para el flujo "facturar un cargo" hace falta poder crear facturas Y registrar
  // el pago escolar que lo salda al volver.
  const puedeFacturar = puedePagos && permissions.includes('facturas:crear');

  /**
   * La ficha entera en una petición, cacheada por SWR.
   *
   * Antes eran cinco llamadas —la del estudiante por delante de las otras
   * cuatro— más una sexta por el plan de cobro, cada una repitiendo la
   * comprobación de sesión y permisos. Y al volver de una factura se repetían
   * todas desde cero. Ahora es un viaje, y la caché de SWR pinta lo de antes al
   * instante mientras revalida por detrás.
   */
  const { data, error, isLoading, mutate } = useSWR<FichaResp>(
    `/api/administracion-escolar/estudiantes/${id}/ficha`,
    fetcher,
    // Sin `keepPreviousData`: la clave lleva el id del alumno, y al saltar de un
    // alumno a otro enseñaría la ficha del anterior con el nombre equivocado.
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const estudiante = data?.estudiante ?? null;
  const matriculas = data?.matriculas ?? [];
  const cargos     = data?.cargos ?? [];
  const pagos      = data?.pagos ?? [];
  const tutores    = data?.tutores ?? [];
  const planes     = data?.planes;
  const cobro      = data?.cobro ?? null;
  const facturasSueltas = data?.facturasSueltas ?? [];
  const deudaFacturas = data?.deudaFacturasCentavos ?? 0;
  const pagosSueltos = data?.pagosSueltos ?? [];
  const avisos = data?.avisos ?? [];
  const avisosProgramados = data?.avisosProgramados ?? [];
  // Solo la primera carga tapa la pantalla: en las recargas posteriores
  // (registrar pago, editar, tutores) se sigue viendo lo de antes, que es lo
  // que evitaba desmontar <Tabs> y perder la pestaña activa.
  const loading  = isLoading && !data;
  const notFound = !!error && !data;

  // Pestaña activa en la URL (?tab=…), para que recargar o volver desde una
  // factura caiga donde el usuario estaba.
  const [tab, setTab] = useTabUrl('tab', TABS, 'periodo');

  /**
   * El alta manda aquí con `?matricular=1` en cuanto crea al alumno.
   *
   * Crear la ficha no lo inscribe en nada: sin matrícula no tiene curso, ni
   * código, ni plan de cobro. Antes eso se pedía en el propio alta, pero es
   * decisión de matriculación —período, curso, tarifa— y ahí es donde se hace.
   * Abrir el diálogo solo evita que el alumno se quede a medias por olvido.
   *
   * Solo la primera vez y solo si de verdad no tiene ninguna: recargar la
   * pantalla de un alumno ya matriculado no debe reabrirlo.
   */
  const [matricularPedido, setMatricularPedido] = useState(false);
  const quiereMatricular = useSearchParams().get('matricular') === '1';
  useEffect(() => {
    if (!quiereMatricular || matricularPedido || isLoading) return;
    setMatricularPedido(true);
    if ((data?.matriculas.length ?? 0) === 0) setReinscribirAbierto(true);
  }, [quiereMatricular, matricularPedido, isLoading, data]);

  const [cargoVincularFactura, setCargoVincularFactura] = useState<Cargo | null>(null);
  const [matriculaEditar, setMatriculaEditar] = useState<Matricula | null>(null);
  // Reinscripción: crea una matrícula nueva (período/curso) para el estudiante.
  const [reinscribirAbierto, setReinscribirAbierto] = useState(false);

  /**
   * Grupos del filtro de período (uno por matrícula, más los cargos huérfanos).
   *
   * Se calcula AQUÍ arriba, y no junto al JSX que lo pinta, porque el período
   * elegido sale de la URL y eso es un hook: necesita saber qué claves existen
   * antes de los `return` de «cargando» y «no encontrado» de abajo.
   *
   * Memoizado sobre `data` —la respuesta entera de SWR, que es estable— y no
   * sobre `matriculas`/`cargos`: esos son `data?.x ?? []`, y el `?? []` da un
   * array nuevo en cada render que dejaría la lista de claves distinta cada vez.
   */
  const grupos = useMemo(
    () => construirGruposPeriodo(data?.matriculas ?? [], data?.cargos ?? []),
    [data],
  );
  const clavesPeriodo = useMemo(() => grupos.map((g) => g.key), [grupos]);
  // Período seleccionado, en la URL (?periodo=…). Con varias matrículas,
  // recargar devolvía siempre al primero. Por defecto: el primero de la lista.
  const [periodoKey, setPeriodoKey] = useTabUrl('periodo', clavesPeriodo, clavesPeriodo[0] ?? '');

  // Modal de cobro in-place: reutiliza el PagoModal de Cuentas por Cobrar sin
  // salir del perfil. El flujo de datos es el mismo (registra en la factura).
  const [pagoCuenta, setPagoCuenta] = useState<Cuenta | null>(null);
  const [cargandoPago, setCargandoPago] = useState(false);
  const [aplicandoMoraFacturaId, setAplicandoMoraFacturaId] = useState<number | null>(null);
  /**
   * El cargo cuyo aviso se está por reenviar.
   *
   * Abre un diálogo en vez de mandar: esto le escribe a una familia real y el
   * texto cambia según la mora del concepto. Quien pulsa tiene que leer antes
   * lo que va a salir y a qué número.
   */
  const [reenviandoCargoId, setReenviandoCargoId] = useState<number | null>(null);
  const [cargoAnular, setCargoAnular] = useState<Cargo | null>(null);
  // La mora se confirma antes de crearla: el cron la aplica solo, y el usuario
  // tiene que saberlo antes de adelantarse a mano.
  const [moraFacturaId, setMoraFacturaId] = useState<number | null>(null);
  const [facturaAnular, setFacturaAnular] = useState<Cargo | null>(null);
  const [anulandoFactura, setAnulandoFactura] = useState(false);
  const [anulando, setAnulando] = useState(false);

  // Enviar la factura por correo desde la ficha. El destinatario se trae del
  // comprador de la factura —que puede no ser el tutor, si se factura a la
  // empresa del padre— y se deja editable: quien envía tiene que ver a dónde va.
  /**
   * La factura que se va a mandar por correo.
   *
   * Guarda el DOCUMENTO y no el cargo: el mismo diálogo sirve ahora para las
   * facturas hechas en Facturación, que no cuelgan de ningún cargo y antes no
   * se podían mandar desde aquí.
   */
  const [correoCargo, setCorreoCargo] = useState<{ ecfDocumentId: number; etiqueta: string } | null>(null);
  const [correoEmail, setCorreoEmail] = useState('');
  const [correoCargando, setCorreoCargando] = useState(false);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  const abrirCorreoFactura = useCallback(async (ecfDocumentId: number, etiqueta: string) => {
    setCorreoCargo({ ecfDocumentId, etiqueta });
    setCorreoEmail('');
    setCorreoCargando(true);
    try {
      const res = await fetch(`/api/facturas/${ecfDocumentId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCorreoEmail(data.comprador?.email ?? '');
    } finally {
      setCorreoCargando(false);
    }
  }, []);

  /** Desde un cargo: se manda su factura, con el concepto en el texto. */
  const abrirCorreo = useCallback((cargo: Cargo) => {
    if (!cargo.ecfDocumentId) return;
    void abrirCorreoFactura(
      cargo.ecfDocumentId,
      `${cargo.facturaEncf || cargo.facturaCodigo || 'la factura'} de «${cargo.concepto ?? 'este cargo'}»`,
    );
  }, [abrirCorreoFactura]);

  const enviarCorreo = useCallback(async () => {
    if (!correoCargo || !correoEmail.trim()) return;
    setEnviandoCorreo(true);
    try {
      const res = await fetch(`/api/facturas/${correoCargo.ecfDocumentId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: correoEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar la factura');
      toast.success('Factura enviada por correo');
      setCorreoCargo(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar la factura');
    } finally {
      setEnviandoCorreo(false);
    }
  }, [correoCargo, correoEmail]);

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

  // La ficha se edita en /escolar/estudiantes/[id]/editar — mismas tarjetas que
  // el alta. Aquí había un formulario en línea de cinco campos que dejaba fuera
  // los veintitrés de la ficha extendida.

  // Recarga la ficha. Todo lo que la cambia (cobrar, anular, editar, tutores)
  // pasa por aquí, y como es una sola clave de SWR no hay forma de que una
  // parte quede vieja y otra nueva.
  const cargar = useCallback(async () => { await mutate(); }, [mutate]);

  // Responsable de pago: el contacto al que se le factura este alumno.
  const [responsableAbierto, setResponsableAbierto] = useState(false);
  const [responsablePrefill, setResponsablePrefill] = useState<Record<string, string> | undefined>();
  const [responsableModo, setResponsableModo] = useState<'buscar' | 'crear' | 'editar'>('buscar');
  /** El contacto que ya tenía esa cédula, para ofrecerlo en vez de duplicarlo. */
  const [responsableExistente, setResponsableExistente] = useState<Contacto | null>(null);

  const guardarResponsable = useCallback(async (clientId: number) => {
    const res = await fetch(`/api/administracion-escolar/estudiantes/${id}/facturar-a`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? 'No se pudo asignar el responsable');
      return;
    }
    toast.success('Responsable de pago asignado');
    await cargar();
  }, [id, cargar]);

  /**
   * Un tutor pasa a ser el responsable de pago.
   *
   * Siempre se abre el formulario con sus datos ya puestos: antes, si su cédula
   * ya estaba en Contactos, se asignaba solo y la pantalla cambiaba sin que
   * nadie hubiera visto de quién se trataba. Ahora se enseña, y si ese contacto
   * existe sale arriba con un «Usar este» — que es lo que evita crear dos
   * fichas del mismo padre.
   */
  const hacerResponsable = useCallback(async (t: TutorPanelVinculo) => {
    const digitos = (t.documento ?? '').replace(/\D/g, '');
    let hallado: Contacto | null = null;
    if (digitos.length >= 7) {
      try {
        const r = await fetch(`/api/clientes?q=${encodeURIComponent(digitos)}`);
        const j = await r.json();
        hallado = (j.clientes ?? []).find(
          (c: Contacto) => (c.rnc ?? '').replace(/\D/g, '') === digitos,
        ) ?? null;
      } catch { /* sin red: se sigue por el camino de crear */ }
    }
    setResponsableExistente(hallado);
    setResponsablePrefill({
      razonSocial: t.nombre,
      rnc: t.documento ?? '',
      telefono: t.telefono ?? '',
      whatsapp: t.whatsapp ?? '',
      email: t.email ?? '',
    });
    setResponsableModo('crear');
    setResponsableAbierto(true);
  }, []);

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

  /**
   * Anula la FACTURA del cargo, no el cargo.
   *
   * Son dos cosas distintas y por eso están separadas en el menú: anular el
   * cargo dice "esta deuda no existía"; anular la factura dice "el documento
   * estaba mal". Lo segundo toca el motor de facturación y solo puede hacerlo
   * quien tenga `facturas:anular`, que el servidor vuelve a comprobar.
   */
  const anularFactura = useCallback(async () => {
    if (!facturaAnular?.ecfDocumentId) return;
    setAnulandoFactura(true);
    try {
      const res = await fetch(`/api/facturas/${facturaAnular.ecfDocumentId}/anular`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo anular la factura');
      toast.success('Factura anulada');
      setFacturaAnular(null);
      await cargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anular la factura');
    } finally {
      setAnulandoFactura(false);
    }
  }, [cargar, facturaAnular]);

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

  /**
   * Años en los que el alumno YA está matriculado: no se pueden volver a elegir
   * ni al reinscribir ni al editar. Dos matrículas activas en el mismo período
   * serían dos cuentas de cobro para un solo alumno.
   *
   * Memoizado porque el diálogo lo usa dentro de un efecto: una lista nueva en
   * cada render le reiniciaría el formulario mientras se escribe. Y va AQUÍ,
   * por encima de los returns de abajo, porque es un hook — colgado detrás de
   * un `if` cambia el orden de los hooks entre renders.
   */
  const periodosOcupados = useMemo(
    () => matriculas.filter((m) => m.estado === 'activa').map((m) => m.periodoId),
    [matriculas],
  );

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
  // Ya no sale de los tutores: es el contacto de Facturación del alumno.
  const responsable = estudiante.responsable;

  // El primero es el respaldo mientras la URL trae un período que este alumno
  // no tiene (enlace de otro estudiante, matrícula borrada).
  const grupoActivo = grupos.find((g) => g.key === periodoKey) ?? grupos[0] ?? null;

  return (
    <section className="p-6 space-y-5">
      <VolverLink />

      {/* Tarjeta horizontal del estudiante (sin encabezado duplicado) */}
      <div className="border border-gray-200 rounded-xl bg-white p-4">
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
                      {/* Deuda = cargos + facturas sin cargo. Contando solo los
                          cargos, el alumno traído de Contactos con una factura
                          sin pagar salía «Al día» con la deuda delante. */}
                      <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border ${
                        estudiante.deudaCentavos + deudaFacturas > 0
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-zero-50 text-zero-700 border-zero-200'}`}>
                        <span className="text-[11px] opacity-70">Pendiente</span>
                        <b className="font-semibold">
                          {estudiante.deudaCentavos + deudaFacturas > 0
                            ? fmtDOP(estudiante.deudaCentavos + deudaFacturas)
                            : 'Al día'}
                        </b>
                      </span>
                    </div>
                  </div>
                </div>
                {/* Responsable de pago: el contacto al que se le factura. */}
                <div className="md:border-l md:border-gray-100 md:pl-4 md:min-w-[200px] shrink-0">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Responsable de pago</p>
                  {responsable ? (
                    <div className="mt-0.5">
                      <p className="font-semibold text-sm text-gray-900 truncate">{responsable.razonSocial}</p>
                      <p className="text-xs text-gray-500 truncate">{responsable.rnc ?? 'sin RNC'}</p>
                      {/* Por dónde se le PUEDE escribir. Lo que falta se ve en
                          gris y se arregla pulsándolo: sin esto, que a una
                          familia no le llegue nada solo se descubría cuando el
                          aviso fallaba —y el fallo vive en otra pantalla. */}
                      <ContactoResponsable
                        responsable={responsable}
                        onArreglar={puedeGestionar
                          ? () => { setResponsablePrefill(undefined); setResponsableExistente(null); setResponsableModo('editar'); setResponsableAbierto(true); }
                          : undefined}
                      />
                      {/* A su ficha, no a su enlace de pago.
                          Aquí el enlace se leía como «el enlace de ESTA
                          factura» —lo primero que preguntó quien lo vio fue a
                          qué factura llevaba— y no lo es: hay uno por familia y
                          abre todo lo que deben, también lo de los otros hijos.
                          Vive en la ficha del responsable, que es donde ese
                          alcance se ve, y desde aquí se llega en un clic. */}
                      <Link href={`/escolar/responsables/${responsable.clientId}`}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-zero-600 hover:text-zero-800">
                        <Users className="h-3 w-3" />
                        Ver la familia y su enlace de pago
                      </Link>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-sm text-red-600">Falta asignarlo</p>
                  )}
                </div>
                {/* Edita al RESPONSABLE, que es lo que tiene al lado.
                    Antes llevaba a editar la ficha del alumno, y pegado al
                    bloque del responsable se leía como si editara a este —
                    quien quería corregirle el teléfono al padre acababa en el
                    formulario del hijo. La ficha se edita desde «Datos
                    adicionales», que es donde está.

                    En un diálogo y no en /dashboard/clientes: corregir un
                    teléfono es cosa de diez segundos y llevaba a otra pantalla
                    del sistema, de la que se volvía perdiendo el período y la
                    pestaña que se estaban mirando. */}
                {puedeGestionar && (
                  responsable ? (
                    <Button variant="outline" size="sm" className="shrink-0 self-start md:self-center"
                      onClick={() => { setResponsablePrefill(undefined); setResponsableExistente(null); setResponsableModo('editar'); setResponsableAbierto(true); }}>
                      <Pencil className="h-4 w-4 mr-1.5" />Editar responsable
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="shrink-0 self-start md:self-center"
                      onClick={() => { setResponsablePrefill(undefined); setResponsableExistente(null); setResponsableModo('buscar'); setResponsableAbierto(true); }}>
                      <Wallet className="h-4 w-4 mr-1.5" />Asignar responsable
                    </Button>
                  )
                )}
              </div>
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
              {/* «Reinscribir» delante de alguien que nunca estuvo matriculado
                  se lee como si te hubieras equivocado de botón. */}
              <Plus className="h-4 w-4 mr-1.5" />{matriculas.length === 0 ? 'Inscribir' : 'Reinscribir'}
            </Button>
          )}
        </div>
      )}

      {/* Ficha extendida (solo lo que esté lleno). */}
      <FichaAdicional estudiante={estudiante} puedeGestionar={puedeGestionar} />

      {/* Secciones: Por período · Tutores · Historial */}
      <div className="border border-gray-200 rounded-xl bg-white p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="line" className="w-full justify-start border-b border-gray-200 rounded-none px-0">
            <TabsTrigger value="periodo">Por período</TabsTrigger>
            <TabsTrigger value="tutores">Tutores</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="avisos">Avisos</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
          </TabsList>

          {/* Por período — todo lo financiero (cuentas por cobrar, pagos,
              facturas + acciones), filtrado por el período elegido arriba. */}
          <TabsContent value="periodo" className="pt-4 space-y-5">
            {grupoActivo ? (
              <PeriodoDetalle
                onReenviarAviso={setReenviandoCargoId}
                reenviandoCargoId={reenviandoCargoId}
                grupo={grupoActivo}
                planes={planes}
                cobro={cobro}
                facturasSueltas={facturasSueltas}
                pagosSueltos={pagosSueltos}
                avisos={avisos}
                pagos={pagos}
                puedeFacturar={puedeFacturar}
                puedePagos={puedePagos}
                puedeGestionar={puedeGestionar}
                estudianteId={estudiante.id}
                tutorClientId={responsable?.clientId ?? null}
                onRegistrarPago={abrirPago}
                onAplicarMora={(ecfId) => setMoraFacturaId(ecfId)}
                onAnularFactura={setFacturaAnular}
                onEnviarCorreo={abrirCorreo}
                onEnviarFactura={(id, etiqueta) => void abrirCorreoFactura(id, etiqueta)}
                aplicandoMoraFacturaId={aplicandoMoraFacturaId}
                onCargoCreado={cargar}
                onEditarMatricula={(mid) => {
                  const m = matriculas.find((x) => x.id === mid);
                  if (m) setMatriculaEditar(m);
                }}
                onVincular={setCargoVincularFactura}
                onAnular={setCargoAnular}
              />
            ) : facturasSueltas.length > 0 ? (
              /* Sin matrícula pero CON facturas a su nombre. Es el caso del
                 alumno traído de Contactos: el colegio ya le facturaba antes de
                 tener el módulo. Enseñar «sin nada relacionado» delante de una
                 factura suya sin pagar es sencillamente falso. */
              <p className="rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-sm text-gray-500">
                Todavía no está matriculado en ningún período, así que no tiene plan de cobro.
                Estas son las facturas que ya existen a su nombre en Facturación.
              </p>
            ) : (
              <EmptyBox text="Sin períodos, cargos o pagos relacionados" />
            )}

            {/* Sin período no hay tablas donde meterlas, así que van sueltas.
                Con período viven dentro de «Otros cargos», que es donde el
                colegio busca lo que se le cobró al alumno. */}
            {grupos.length === 0 && <FacturasSueltas facturas={facturasSueltas} />}
          </TabsContent>

          {/* Tutores — gestión + contacto vinculado, separado de lo financiero. */}
          <TabsContent value="tutores" className="pt-4 space-y-4">
            {/* Responsable de pago: el contacto al que se le factura. Va aquí
                y no en «Editar estudiante» porque se decide mirando la lista de
                tutores que tiene justo debajo. */}
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">Responsable de pago</p>
                  {responsable ? (
                    <p className="mt-0.5 truncate text-sm text-gray-600">
                      <Link href={`/dashboard/clientes/${responsable.clientId}/editar`}
                        className="font-medium text-gray-900 hover:underline">
                        {responsable.razonSocial}
                      </Link>
                      <span className="text-gray-400"> · {responsable.rnc ?? 'sin RNC'}</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-red-600">
                      Sin asignar — no se le puede facturar hasta ponerlo.
                    </p>
                  )}
                </div>
                {puedeGestionar && (
                  <Button variant="outline" size="sm" className="shrink-0"
                    onClick={() => { setResponsablePrefill(undefined); setResponsableExistente(null); setResponsableModo('buscar'); setResponsableAbierto(true); }}>
                    <Wallet className="mr-1.5 h-4 w-4" />{responsable ? 'Cambiar' : 'Asignar'}
                  </Button>
                )}
              </div>
            </div>
            {puedeGestionar ? (
              <TutoresPanel estudianteId={estudiante.id} tutores={tutores} onChange={cargar}
                responsableDocumento={responsable?.rnc}
                onHacerResponsable={(t) => void hacerResponsable(t)} />
            ) : (
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-2">Tutores</h2>
                {tutores.length === 0 ? (
                  <EmptyBox text="Sin tutores asociados" />
                ) : (
                  <SimpleTable head={['Nombre', 'Relación', 'Teléfono', 'WhatsApp', 'Email']}
                    rows={tutores.map((t) => [
                      t.nombre,
                      <span key="r" className="capitalize">{t.relacion}</span>,
                      t.telefono ?? '—',
                      t.whatsapp ?? '—',
                      t.email ?? '—',
                    ])} />
                )}
              </div>
            )}
          </TabsContent>

          {/* Documentos — el checklist de la MATRÍCULA del período elegido
              arriba, no del estudiante en general: ver DocumentosEstudiante. */}
          <TabsContent value="documentos" className="pt-4">
            <DocumentosEstudiante
              matriculaId={grupoActivo?.matriculaId ?? null}
              puedeGestionar={puedeGestionar}
            />
          </TabsContent>

          {/* Avisos — qué se le mandó a la familia y por qué cobro. */}
          <TabsContent value="avisos" className="pt-4">
            <AvisosEstudiante avisos={avisos} programados={avisosProgramados} />
          </TabsContent>

          {/* Historial */}
          <TabsContent value="historial" className="pt-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-2">Historial de actividad</h2>
              <Historial matriculas={matriculas} pagos={pagos} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Enseña el aviso ANTES de mandarlo: esto le escribe a una familia
          real y el texto cambia según la mora del concepto. */}
      <ReenviarAvisoDialog
        cargoId={reenviandoCargoId}
        abierto={reenviandoCargoId != null}
        onCerrar={() => setReenviandoCargoId(null)}
        onEnviado={() => mutate()}
      />

      {/* El MISMO diálogo que la pantalla de Matriculación. Eran dos, y el de
          aquí mandaba los conceptos con otro nombre del que lee la API: la
          matrícula se creaba sin un solo cargo. */}
      <MatriculaDialog
        matricula={matriculaEditar}
        estudianteFijoId={estudiante.id}
        estudianteFijoNombre={`${estudiante.nombres} ${estudiante.apellidos}`}
        periodosOcupados={periodosOcupados}
        open={!!matriculaEditar}
        onClose={() => setMatriculaEditar(null)}
        onSaved={cargar}
      />

      {/* Inscripción / reinscripción: matrícula nueva para este estudiante. */}
      <MatriculaDialog
        matricula={null}
        estudianteFijoId={estudiante.id}
        estudianteFijoNombre={`${estudiante.nombres} ${estudiante.apellidos}`}
        periodosOcupados={periodosOcupados}
        esPrimera={matriculas.length === 0}
        codigoSugerido={estudiante.codigoRne || estudiante.codigo || ''}
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

      {/* La mora la aplica un cron cada mañana sobre lo vencido. Hacerlo a mano
          es adelantarse, no algo distinto, y quien pulsa tiene que saberlo:
          si no, acaba pensando que sin este botón nadie cobra el recargo. */}
      <Dialog open={moraFacturaId !== null} onOpenChange={(o) => { if (!o) setMoraFacturaId(null); }}>
        <DialogContent className="max-w-sm">
          <ModalHeader
            title="Generar el cargo por mora ahora"
            subtitle={
              'El sistema aplica la mora solo, cada día, a lo que esté vencido y según el porcentaje '
              + 'configurado. Esto lo adelanta para esta factura: se crea una nota de débito por el recargo. '
              + 'Si ya existe una, no se duplica.'
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoraFacturaId(null)}>Cancelar</Button>
            <Button onClick={() => { const f = moraFacturaId; setMoraFacturaId(null); if (f) void aplicarMora(f); }}>
              Generar mora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!facturaAnular} onOpenChange={(o) => { if (!o && !anulandoFactura) setFacturaAnular(null); }}>
        <DialogContent className="max-w-sm">
          <ModalHeader
            title="Anular la factura"
            subtitle={facturaAnular
              ? `Se anula ${facturaAnular.facturaEncf || facturaAnular.facturaCodigo || 'la factura'} `
                + `de «${facturaAnular.concepto ?? 'este cargo'}». El cargo se queda, y vuelve a estar `
                + 'pendiente de facturar. Esto no se deshace.'
              : undefined}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFacturaAnular(null)} disabled={anulandoFactura}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={anularFactura} disabled={anulandoFactura}>
              {anulandoFactura && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Anular factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enviar la factura por correo. El destinatario llega del comprador de la
          factura, pero se puede cambiar antes de mandar: el envío sale a nombre
          del colegio y no debe salir a ciegas. */}
      <Dialog open={!!correoCargo} onOpenChange={(o) => { if (!o && !enviandoCorreo) setCorreoCargo(null); }}>
        <DialogContent className="max-w-sm">
          <ModalHeader
            title="Enviar factura por correo"
            subtitle={correoCargo
              ? `Se envía ${correoCargo.etiqueta} en PDF adjunto.`
              : undefined}
          />
          <div className="space-y-1.5 px-6 py-2">
            <Label htmlFor="correo-factura">Correo del destinatario</Label>
            <Input
              id="correo-factura"
              type="email"
              value={correoEmail}
              placeholder={correoCargando ? 'Buscando el correo…' : 'nombre@correo.com'}
              onChange={(e) => setCorreoEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorreoCargo(null)} disabled={enviandoCorreo}>
              Cancelar
            </Button>
            <Button onClick={enviarCorreo} disabled={enviandoCorreo || correoCargando || !correoEmail.trim()}>
              {enviandoCorreo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Mail className="mr-1.5 h-4 w-4" />Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ResponsablePagoDialog
        open={responsableAbierto}
        onOpenChange={setResponsableAbierto}
        prefill={responsablePrefill}
        modoInicial={responsableModo}
        clienteId={responsable?.clientId}
        existente={responsableExistente}
        onElegir={(c) => void guardarResponsable(c.id)}
        onCreado={(clientId) => void guardarResponsable(clientId)}
        onActualizado={() => { toast.success('Responsable actualizado'); void cargar(); }}
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

function VolverLink() {
  const volver = useVolver('/escolar/estudiantes');
  return (
    <button type="button" onClick={volver}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-zero-600 transition-colors">
      <ArrowLeft className="h-4 w-4" />Volver a estudiantes
    </button>
  );
}

function AvisosEstudiante({ avisos, programados }: {
  avisos: AvisoEnviado[];
  programados: AvisoProgramado[];
}) {
  /**
   * Dos preguntas distintas, y por eso dos filtros: «¿qué le va a llegar este
   * mes?» —lo que la secretaria contesta por teléfono— y «¿qué se le mandó?»
   * —la constancia cuando la familia dice que no le avisaron—.
   */
  const [filtro, setFiltro] = useState<'mes' | 'enviados'>('mes');

  const hoy = new Date().toISOString().slice(0, 10);
  const finDeMes = (() => {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0)).toISOString().slice(0, 10);
  })();

  // «Este mes» es lo que queda por salir de aquí a fin de mes: lo de días
  // pasados ya salió (o ya no sale) y prometerlo sería mentir.
  const delMes = programados.filter((p) => p.fecha >= hoy && p.fecha <= finDeMes);
  const lista = filtro === 'mes' ? delMes : avisos;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ChipFiltro activo={filtro === 'mes'} onClick={() => setFiltro('mes')}
          etiqueta="Se enviarán este mes" n={delMes.length} />
        <ChipFiltro activo={filtro === 'enviados'} onClick={() => setFiltro('enviados')}
          etiqueta="Ya enviados" n={avisos.length} />
      </div>

      {lista.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">
            {filtro === 'mes'
              ? 'Este mes no le toca ningún recordatorio.'
              : 'Todavía no se le ha mandado ningún recordatorio.'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Los avisos salen solos cada mañana según lo que diga cada concepto.{' '}
            <Link href="/escolar/avisos" className="text-zero-600 hover:underline">Ver el estado de los avisos</Link>
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">{filtro === 'mes' ? 'Cuándo sale' : 'Cuándo salió'}</th>
                <th className="px-3 py-2 font-medium">Aviso</th>
                <th className="px-3 py-2 font-medium">Canal</th>
                {/* Neutro: aquí caen los avisos de cobro y los del expediente,
                    y «por qué cobro» dejaba en falso a los segundos. */}
                <th className="px-3 py-2 font-medium">
                  {filtro === 'mes' ? 'Por qué cobro' : 'Sobre qué'}
                </th>
                <th className="px-3 py-2 font-medium">{filtro === 'mes' ? 'Monto' : 'A dónde fue'}</th>
              </tr>
            </thead>
            <tbody>
              {filtro === 'mes' ? delMes.map((p, i) => (
                <tr key={`${p.cargoId}-${p.tipo}-${i}`} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">
                    {fmtFechaCorta(p.fecha)}
                    {p.fecha === hoy && <span className="ml-1 text-xs text-zero-600">hoy</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-800">{AVISO_TEXTO[p.tipo] ?? p.tipo}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {p.canales.map((c) => <CanalChip key={c} canal={c} />)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-900">{p.concepto ?? 'Sin concepto'}</td>
                  <td className="px-3 py-2.5 text-gray-700">{fmtDOP(p.montoCentavos)}</td>
                </tr>
              )) : avisos.map((a) => (
                <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">
                    {new Date(a.enviadoAt).toLocaleString('es-DO', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-3 py-2.5 text-gray-800">{AVISO_TEXTO[a.tipo] ?? a.tipo}</td>
                  <td className="px-3 py-2.5"><CanalChip canal={a.canal} /></td>
                  <td className="px-3 py-2.5">
                    {/* No todo aviso es de cobro: el enlace de documentos y los
                        formularios cuelgan de la matrícula, no de una cuota, y
                        no tienen concepto ni monto que enseñar. */}
                    {a.cargoId == null ? (
                      <span className="text-gray-900">{a.detalle ?? 'Expediente'}</span>
                    ) : (
                      <>
                        <span className="text-gray-900">{a.concepto ?? 'Sin concepto'}</span>
                        <span className="block text-xs text-gray-400">
                          {a.mes ? `${MESES[a.mes]} ${a.anio}` : a.anio} · {fmtDOP(a.montoCentavos ?? 0)}
                          {a.saldoCentavos === 0 ? ' · ya pagado' : ''}
                        </span>
                      </>
                    )}
                  </td>
                  {/* El destino tal como estaba ese día: el teléfono de hoy
                      puede ser otro, y la constancia es de entonces. */}
                  <td className="px-3 py-2.5 text-gray-500">{a.destino ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Badge que además filtra, con su cuenta al lado. */
function ChipFiltro({ activo, onClick, etiqueta, n }: {
  activo: boolean; onClick: () => void; etiqueta: string; n: number;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        activo
          ? 'border-zero-600 bg-zero-600 font-semibold text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
      }`}>
      {etiqueta}
      <span className={`rounded-full px-1.5 text-xs ${activo ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>
        {n}
      </span>
    </button>
  );
}

function ContactoResponsable({ responsable, onArreglar }: {
  responsable: NonNullable<Estudiante['responsable']>;
  onArreglar?: () => void;
}) {
  // El mismo orden de preferencia que usa el motor de avisos: el WhatsApp cae
  // al celular, y el SMS al celular antes que al fijo, que no recibe nada.
  const canales = [
    { key: 'correo', icon: Mail, label: 'Correo', valor: responsable.email?.trim() || null,
      falta: 'Sin correo — pulsa para agregarlo' },
    { key: 'whatsapp', icon: MessageCircle, label: 'WhatsApp',
      valor: responsable.whatsapp?.trim() || responsable.celular?.trim() || null,
      // Se nombra el campo que hay que llenar: quien escribía el número en
      // «Teléfono» veía el icono seguir gris y creía que no se había guardado.
      falta: 'Sin WhatsApp ni celular — el teléfono fijo no recibe WhatsApp' },
    { key: 'sms', icon: Smartphone, label: 'SMS',
      valor: responsable.celular?.trim() || responsable.whatsapp?.trim() || null,
      falta: 'Sin celular — el teléfono fijo no recibe SMS' },
  ] as const;
  const faltan = canales.filter((c) => !c.valor);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {canales.map((c) => (
        <button key={c.key} type="button"
          disabled={!onArreglar}
          onClick={onArreglar}
          title={c.valor ? `${c.label}: ${c.valor}` : c.falta}
          className={`inline-flex ${onArreglar ? 'cursor-pointer' : 'cursor-default'}`}>
          {/* Lo que falta va en ROJO, no en gris: gris se lee como «apagado» o
              como decoración, y el usuario lo pasaba por alto. Es un canal por
              el que a esta familia NO le va a llegar nada. */}
          <c.icon className={`h-4 w-4 ${c.valor ? 'text-zero-600' : 'text-red-500 hover:text-red-600'}`}
            aria-label={c.valor ? `${c.label}: ${c.valor}` : c.falta} />
        </button>
      ))}
      {/* El aviso se queda mientras falte ALGO, no solo cuando falta todo:
          con el correo puesto y sin celular desaparecía, y esa familia sigue
          sin recibir los dos avisos que salen por SMS. */}
      {faltan.length > 0 && (
        <span className="text-[11px] font-medium text-red-600">
          {faltan.length === canales.length
            ? 'No se le puede avisar'
            : `Sin ${faltan.map((c) => c.label).join(' ni ')}`}
        </span>
      )}
    </div>
  );
}

function InfoChip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1">
      <span className="text-gray-400">{k}</span>
      <b className="font-semibold text-gray-800">{v}</b>
    </span>
  );
}

function FichaAdicional({ estudiante, puedeGestionar }: { estudiante: Estudiante; puedeGestionar: boolean }) {
  // Arriba del todo: debajo del `return` de «sin datos» sería un hook que unas
  // veces se ejecuta y otras no, y React tumba el perfil entero por eso.
  const [abierto, setAbierto] = useState(false);
  const ex = estudiante as unknown as Record<string, string | null>;
  const llenos = CAMPOS_SIGERD_ESTUDIANTE.filter((c) => (ex[c.key] ?? '').toString().trim() !== '');
  const resumen = GRUPOS_SIGERD.filter((g) => llenos.some((c) => c.grupo === g)).join(' · ');

  // Los alumnos importados de SIGERD llegan con los veintitrés campos vacíos.
  // Ocultar la sección entera dejaba el perfil sin ninguna pista de que existen
  // —ni de dónde se llenan—, así que en vez de desaparecer, invita a llenarlos.
  if (llenos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Datos adicionales</h2>
        <p className="mt-1 text-sm text-gray-500">
          Sin teléfono, dirección, acta de nacimiento ni RNE.
          {puedeGestionar && (
            <>
              {' '}
              <Link href={`/escolar/estudiantes/${estudiante.id}/editar`}
                className="font-medium text-zero-600 hover:underline">
                Completar la ficha
              </Link>
            </>
          )}
        </p>
      </div>
    );
  }

  const grupos = GRUPOS_SIGERD.filter((g) => llenos.some((c) => c.grupo === g));
  return (
    <div className="border border-gray-200 rounded-xl bg-white">
      {/* Plegado por defecto: son hasta veintitrés campos que casi nunca se
          consultan —acta, oficialía, libro— y desplegados empujaban las
          matrículas y la deuda fuera de la pantalla, que es a lo que se entra.
          El resumen dice qué hay dentro para no tener que abrirlo a ciegas. */}
      <div className="flex items-center justify-between gap-2 p-4">
        <button type="button" onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${abierto ? 'rotate-90' : ''}`} />
          <h2 className="text-base font-semibold text-gray-900">Datos adicionales</h2>
          {!abierto && (
            <span className="truncate text-xs text-gray-400">{resumen}</span>
          )}
        </button>
        {puedeGestionar && (
          <Link href={`/escolar/estudiantes/${estudiante.id}/editar`}
            className="shrink-0 text-xs font-medium text-gray-400 transition-colors hover:text-zero-600">
            Editar ficha
          </Link>
        )}
      </div>
      {abierto && (
        <div className="space-y-4 px-4 pb-4">
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
      )}
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
