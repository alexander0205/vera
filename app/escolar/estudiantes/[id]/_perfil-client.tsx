'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { NativeSelect } from '@/components/ui/native-select';
import { ModalHeader } from '@/components/ui/modal-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, ArrowUpDown, Loader2, Receipt, Link2, Wallet, AlertTriangle, Pencil, CalendarDays, FileText, MoreVertical, Plus, Repeat, ChevronLeft, ChevronRight, Ban, Printer, Send, Mail, Info, MessageCircle, Smartphone } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';
import { useVolver } from '@/lib/hooks/useVolver';
import { useTabUrl } from '@/lib/hooks/useUrlEstado';
import { SEXOS, labelSexo, calcularEdad } from '@/lib/administracion-escolar/estudiante-utils';
import { CAMPOS_SIGERD_ESTUDIANTE, GRUPOS_SIGERD } from '@/lib/administracion-escolar/estudiante-sigerd-campos';
import { TutoresPanel, type TutorVinculo as TutorPanelVinculo } from '@/components/administracion-escolar/TutoresPanel';
import { ResponsablePagoDialog, type Contacto } from '@/components/administracion-escolar/ResponsablePagoDialog';
import { DocumentosEstudiante } from '@/components/administracion-escolar/DocumentosEstudiante';
import { CapturaFoto } from '@/components/fotos/CapturaFoto';
import { VincularFacturaDialog } from '@/components/administracion-escolar/VincularFacturaDialog';
import { MatriculaDialog } from '@/components/administracion-escolar/MatriculaDialog';
import {
  DetalleCuotaDialog, type CobroDelColegio, type CuotaDetallada, type ReglasCuota,
} from '@/components/administracion-escolar/DetalleCuotaDialog';
import { FacturarCargosDialog, type FacturaCreada } from '@/components/administracion-escolar/FacturarCargosDialog';
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
interface Matricula {
  id: number;
  periodoId: number;
  periodo: string | null;
  periodoFechaInicio: string | null;
  periodoFechaFin: string | null;
  /** El período es el año escolar en curso. */
  periodoActivo: boolean | null;
  cursoId: number;
  curso: string | null;
  codigoMatricula: string | null;
  fechaInscripcion: string | null;
  estado: string;
  facturaRecurrenteId: number | null;
  recurrenteEstado: string | null;
  recurrenteDiaCobro: number | null;
  recurrenteProxima: string | null;
  notas: string | null;
}
interface Cargo {
  id: number;
  conceptoId: number | null;
  concepto: string | null;
  conceptoTipo: string | null;
  /** Cuota del calendario de la que salió, si vino del devengo. */
  cuotaId: number | null;
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
  /** Estado ante la DGII (BORRADOR, EN_PROCESO, ACEPTADO…), no el de cobro. */
  facturaEstado: string | null;
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
  whatsapp: string | null;
  email: string | null;
  imagen: string | null;
  relacion: string;
}

/**
 * El plan de cobro de la matrícula, tal como lo devuelve
 * `/api/administracion-escolar/matriculas/[id]/plan`.
 *
 * Los tipos se redeclaran aquí en vez de importar `LineaPlan`: ese módulo
 * importa `db`, y traerlo al cliente mete el driver de Postgres en el paquete
 * del navegador.
 */
interface PlanCuota {
  cuotaId: number;
  numero: number;
  etiqueta: string;
  mes: number | null;
  fechaEmision: string;
  fechaVencimiento: string | null;
  montoCentavos: number;
  omitida: boolean;
}
interface PlanLinea {
  conceptoId: number;
  nombre: string;
  tipo: string;
  montoCentavos: number;
  cuotas: PlanCuota[];
  totalCentavos: number;
  /** Cuándo vence, cuándo entra el recargo y qué avisos salen. */
  reglas: ReglasCuota;
}

/**
 * Un cargo que TODAVÍA no existe: el calendario dice que va a salir, y cuándo,
 * y por cuánto. No es deuda hasta que el devengo lo cree, así que no suma en
 * ningún total de pendiente ni de morosidad.
 */
interface Previsto {
  key: string;
  /** 0 en un concepto sin calendario: esa cuota no se puede adelantar sola. */
  cuotaId: number;
  conceptoId: number;
  concepto: string;
  tipo: string;
  /** null en un concepto que se cobra de una vez y no cae en ningún mes. */
  mes: number | null;
  anio: number;
  fechaEmision: string;
  fechaVencimiento: string | null;
  montoCentavos: number;
  /** Se arrastra del concepto para poder explicar la cuota sin pedir nada. */
  reglas: ReglasCuota;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Toda la ficha en una respuesta: ver /api/.../estudiantes/[id]/ficha. */
interface FichaResp {
  estudiante: Estudiante;
  matriculas: Matricula[];
  cargos: Cargo[];
  pagos: Pago[];
  tutores: TutorVinculo[];
  /** Plan de cobro por matrícula. Viene todo para que cambiar de período no pida nada. */
  planes: Record<number, { lineas: PlanLinea[]; devenga: boolean }>;
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

interface LineaFacturaSuelta { nombre: string; cantidad: number; importeCentavos: number; }

interface AvisoProgramado {
  cargoId: number;
  concepto: string | null;
  fecha: string;
  tipo: string;
  canales: string[];
  montoCentavos: number;
}

interface AvisoEnviado {
  id: number;
  enviadoAt: string;
  /** al-emitir | al-vencer | antes-mora (cobro) · documentos | formulario. */
  tipo: string;
  canal: string;
  /** El correo o número al que salió, tal como estaba ese día. */
  destino: string | null;
  /** Qué se mandó, en palabras, cuando el aviso no es de cobro. */
  detalle: string | null;
  /** NULL en los avisos del expediente: no cuelgan de ninguna cuota. */
  cargoId: number | null;
  concepto: string | null;
  mes: number | null;
  anio: number | null;
  montoCentavos: number | null;
  saldoCentavos: number | null;
}

interface PagoSuelto {
  id: number;
  ecfDocumentId: number;
  encf: string | null;
  codigo: string | null;
  montoCentavos: number;
  fechaPago: string;
  metodo: string | null;
  referencia: string | null;
}

interface FacturaSuelta {
  id: number;
  codigo: string | null;
  encf: string | null;
  fecha: string;
  montoTotal: number;
  /** Lo abonado, sumado de sus pagos: un abono parcial también cuenta. */
  pagadoCentavos: number;
  estado: string;
  estadoPago: string;
  /** Lo que la factura le cobra a ESTE alumno, línea por línea. */
  lineas: LineaFacturaSuelta[];
}

// Lanza en 404/500 para que SWR lo trate como error y no cachee un cuerpo vacío
// como si fuera la ficha.
const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

const TABS = ['periodo', 'tutores', 'documentos', 'avisos', 'historial'] as const;
const VISTAS = ['mensualidades', 'otros', 'facturas', 'pagos'] as const;

// ─── Página ────────────────────────────────────────────────────────────────

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

// Detalle financiero de UN período (el seleccionado en la barra padre):
// acciones, resumen y sub-vistas (mensualidades, otros cargos, facturas, pagos).
function PeriodoDetalle({ grupo, planes, cobro, facturasSueltas, pagosSueltos, avisos, pagos, puedeFacturar, puedePagos, puedeGestionar, estudianteId, tutorClientId, onRegistrarPago, onAplicarMora, aplicandoMoraFacturaId, onCargoCreado, onEditarMatricula, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onEnviarFactura }: {
  grupo: NonNullable<ReturnType<typeof construirGruposPeriodo>[number]>;
  planes: FichaResp['planes'] | undefined;
  /** Recargo del negocio y canales del colegio: para explicar cada cuota. */
  cobro: CobroDelColegio | null;
  /** Facturas del alumno hechas en Facturación, sin cargo escolar detrás. */
  facturasSueltas: FacturaSuelta[];
  pagosSueltos: PagoSuelto[];
  /** Lo ya enviado, para marcar en cada cargo por qué canales salió. */
  avisos: AvisoEnviado[];
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
  onAnularFactura: (cargo: Cargo) => void;
  onEnviarCorreo: (cargo: Cargo) => void;
  /** Manda por correo una factura suelta, sin cargo detrás. */
  onEnviarFactura: (ecfDocumentId: number, etiqueta: string) => void;
}) {
  const router = useRouter();
  // La sub-pestaña también vive en la URL (?v=…): es la que el usuario mira de
  // verdad, y se perdía en cada recarga.
  const [vista, setVista] = useTabUrl('v', VISTAS, 'mensualidades');
  const [crearCargoAbierto, setCrearCargoAbierto] = useState(false);
  // Mes preseleccionado al agregar cargo desde el panel de un mes específico.
  // null = flujo general (elige el mes en el diálogo).
  const [cargoMesInicial, setCargoMesInicial] = useState<{ mes: number; anio: number } | null>(null);
  const [elegirFacturaAbierto, setElegirFacturaAbierto] = useState(false);
  // Cargos que el modal de facturar arranca marcados. null = cerrado.
  const [cargosFacturar, setCargosFacturar] = useState<number[] | null>(null);
  // La factura recién creada: se enseña el resumen y se ofrece cobrarla en el
  // acto, que es lo que pasa de verdad — el padre está delante del mostrador.
  const [facturaCreada, setFacturaCreada] = useState<FacturaCreada | null>(null);

  /**
   * Por qué canales ya salió el aviso de cada cargo.
   *
   * Se arma una vez para toda la tabla: preguntarlo fila por fila sobre la
   * lista de avisos sería recorrerla entera por cada renglón.
   */
  const enviadosPorCargo = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const a of avisos) {
      // Los avisos del expediente no cuelgan de ninguna cuota: nada que marcar
      // en la columna de canales de un cargo.
      if (a.cargoId == null) continue;
      const s = m.get(a.cargoId) ?? new Set<string>();
      s.add(a.canal);
      m.set(a.cargoId, s);
    }
    return m;
  }, [avisos]);

  /** La cuota cuyo detalle se está mirando. Solo lectura: no cambia nada. */
  const [cuotaDetalle, setCuotaDetalle] = useState<Previsto | null>(null);
  const [previstoOmitir, setPrevistoOmitir] = useState<Previsto | null>(null);
  const [previstoFacturar, setPrevistoFacturar] = useState<
    { matriculaId: number; cuotaId: number; conceptoId: number } | null>(null);
  const [aplicandoPrevisto, setAplicandoPrevisto] = useState(false);
  const matriculaId = grupo.matriculaId;

  /**
   * El plan de cobro de esta matrícula: lo que el calendario dice que se va a
   * cobrar y cuándo. No es deuda — solo sirve para enseñar los meses que aún no
   * se han devengado.
   *
   * Llega con la ficha, ya calculado para todas las matrículas del alumno.
   * Cuando se pedía aquí, cambiar de período disparaba otra petición y la tabla
   * se quedaba sin previstos hasta que volviera.
   */
  const plan = (matriculaId && planes?.[matriculaId]?.lineas) || [];
  const planDevenga = !!(matriculaId && planes?.[matriculaId]?.devenga);

  /**
   * Aterriza una cuota prevista: la adelanta para poder cobrarla, o la deja sin
   * cobrar. Las dos crean el cargo —una pendiente, la otra anulada— porque es
   * lo que impide que el devengo del mes que viene la vuelva a poner.
   */
  async function aplicarPrevisto(p: Previsto, accion: 'adelantar' | 'omitir') {
    if (!matriculaId) return;
    if (accion === 'omitir' && previstoOmitir?.key !== p.key) { setPrevistoOmitir(p); return; }
    if (accion === 'adelantar') {
      // Ya no se crea el cargo aquí. La cuota entra en el modal como una línea
      // más y se convierte en deuda al confirmar la factura: sin factura no
      // debe haber deuda.
      setPrevistoFacturar({ matriculaId, cuotaId: p.cuotaId, conceptoId: p.conceptoId });
      setCargosFacturar([]);
      return;
    }
    setAplicandoPrevisto(true);
    try {
      const res = await fetch(`/api/administracion-escolar/matriculas/${matriculaId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuotaId: p.cuotaId, conceptoId: p.conceptoId, accion }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? 'No se pudo aplicar'); return; }
      setPrevistoOmitir(null);
      // Recarga la ficha entera: el cargo nuevo y el plan sin esa cuota vienen
      // en la misma respuesta, así que no hay ventana en la que se contradigan.
      onCargoCreado();
      toast.success(`«${p.concepto}» de ${MESES[p.mes ?? 0] ?? 'ese mes'} no se le cobrará.`);
    } catch {
      toast.error('No se pudo aplicar');
    } finally {
      setAplicandoPrevisto(false);
    }
  }

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
  /**
   * Lo que falta por devengar, para enseñar los meses que todavía no son deuda.
   *
   * El descarte mira `grupo.cargos` —con anulados incluidos— y no
   * `cargosPeriodo`: una cuota anulada está gastada para el devengo, y sacarla
   * de la comparación la haría reaparecer como prevista para siempre.
   */
  const previstos = planDevenga ? previstosDelPlan(plan, grupo.cargos) : [];
  const previstosMensualidad = previstos.filter((p) => p.tipo === 'mensualidad');
  const previstosOtros = previstos.filter((p) => p.tipo !== 'mensualidad');
  /**
   * El siguiente cargo que vence. Los que NO vencen quedan fuera.
   *
   * Antes entraban ordenados como si vencieran en el año 9999, así que un
   * alumno con solo cargos sin fecha límite —lo normal en un colegio que no usa
   * vencimientos— veía "Próximo vencimiento —" con un monto debajo: la tarjeta
   * había elegido uno y lo presentaba como próximo sin poder decir cuándo.
   */
  const proximo = cargosPeriodo
    .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado) && c.fechaVencimiento)
    .sort((a, b) => a.fechaVencimiento!.localeCompare(b.fechaVencimiento!))[0] ?? null;
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
  /**
   * Por qué está apagado «Facturar varios». Hay tres razones distintas y solo
   * una es un callejón sin salida:
   *  - no queda nada por cobrar → no hay nada que facturar;
   *  - queda deuda, pero ya está toda facturada → se cobra, no se factura;
   *  - queda deuda sin facturar, pero de otro tipo → está en la otra pestaña,
   *    y esa es la que hay que decir en voz alta porque el botón se ve muerto
   *    justo al lado de un saldo pendiente.
   */
  const motivoSinFacturar = cargosSinFacturaVista.length > 0
    ? null
    : cargosSinFactura.length > 0
      ? (vista === 'mensualidades'
        ? 'Sus cargos pendientes no son mensualidades: factúrelos desde «Otros cargos»'
        : 'Lo que le queda sin facturar son mensualidades: factúrelas desde «Cuentas por cobrar»')
      : saldo > 0
        ? 'Su deuda ya está facturada: lo que falta es cobrarla'
        : 'No tiene cargos pendientes por facturar';

  return (
    <div className="space-y-4">
      {/* Sin repetir «Período 2026-2027 · A»: la barra de períodos de arriba ya
          dice cuál se está mirando, con su curso y su saldo. Decirlo dos veces
          en la misma pantalla no informa, solo empuja hacia abajo lo que sí.
          El lápiz se quedó, pero con su nombre: era el único sitio desde donde
          se le cambia el curso a una matrícula ya creada. */}
      <div className="flex flex-wrap justify-end gap-2">
        <div className="flex flex-wrap gap-2">
          {puedeGestionar && grupo.matriculaId && (
            <Button size="sm" variant="outline" onClick={() => onEditarMatricula(grupo.matriculaId!)}>
              <Pencil className="h-4 w-4 mr-1.5" />Editar matrícula
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
          {puedeFacturar && (
            /* El span de fuera existe para el tooltip: un <button disabled> no
               dispara eventos de mouse, así que el `title` puesto en él nunca
               se vería. Y verlo importa — el botón se apaga por el filtro de la
               sub-vista activa, que no se ve desde aquí: un alumno con deuda
               pero sin ninguna mensualidad lo encuentra muerto en «Cuentas por
               cobrar» y vivo en «Otros cargos», sin nada que lo explique. */
            <span title={motivoSinFacturar ?? undefined}>
              <Button size="sm" variant="outline" onClick={() => setElegirFacturaAbierto(true)} disabled={cargosSinFacturaVista.length === 0}>
                <FileText className="h-4 w-4 mr-1.5" />
                {vista === 'otros' ? 'Facturar varios cargos' : 'Facturar varios meses'}
              </Button>
            </span>
          )}
          {/* Antes esto era `window.print()` sobre la ficha entera: salían las
              pestañas y los botones, y no salía el detalle cargo por cargo ni
              los pagos con su referencia, que es justo lo que la familia viene
              a discutir. Ahora abre el documento de verdad. */}
          <Button asChild size="sm" variant="outline">
            <Link href={`/escolar/estudiantes/${estudianteId}/record`} target="_blank">
              <Printer className="h-4 w-4 mr-1.5" />Imprimir récord financiero
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <PeriodoStat icon={Receipt} label="Facturado" value={fmtDOP(total)} detail="Total del período" tone="blue" />
        <PeriodoStat icon={Wallet} label="Pagado" value={fmtDOP(pagado)} detail="Total del período" tone="verde" />
        <PeriodoStat icon={AlertTriangle} label="Pendiente" value={fmtDOP(saldo)} detail="Saldo por pagar" tone="red" />
        <PeriodoStat
          icon={CalendarDays}
          label="Próximo vencimiento"
          value={proximo?.mes ? MESES[proximo.mes] : proximo ? fmtFechaCorta(proximo.fechaVencimiento!) : '—'}
          // Sin próximo vencimiento hay dos casos que NO son el mismo, y
          // decirlos igual engaña: no deber nada, o deber sin fecha límite. Un
          // colegio que no usa vencimientos leería "sin deuda próxima" con
          // once mil pesos por cobrar.
          detail={proximo
            ? fmtDOP(proximo.saldoCentavos)
            : saldo > 0 ? 'Sin fecha límite' : 'Sin deuda'}
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
                diaFacturaAuto={grupo.diaFacturaAuto}
                cargos={mensualidades}
                previstos={previstosMensualidad}
                enviadosPorCargo={enviadosPorCargo}
                pagos={pagos}
                mesesAcademicos={mesesAcademicos}
                puedePagos={puedePagos}
                puedeFacturar={puedeFacturar}
                puedeGestionar={puedeGestionar}
                onRegistrarPago={onRegistrarPago}
                onAplicarMora={onAplicarMora}
                onCrearFactura={(cargo) => setCargosFacturar([cargo.id])}
                onVincular={onVincular}
                onAnular={onAnular}
                onAnularFactura={onAnularFactura}
                onEnviarCorreo={onEnviarCorreo}
                onAgregarCargoMes={grupo.matriculaId ? (mes, anio) => { setCargoMesInicial({ mes, anio }); setCrearCargoAbierto(true); } : undefined}
                onPrevisto={puedeGestionar ? aplicarPrevisto : undefined}
                onDetalle={setCuotaDetalle}
                aplicandoMoraFacturaId={aplicandoMoraFacturaId}
              />
            )}

            {vista === 'otros' && (
              otrosCargos.length === 0 && previstosOtros.length === 0 && facturasSueltas.length === 0
                ? <EmptyBox text="Sin otros cargos" /> : (
                <OtrosCargosTabla
                  cargos={otrosCargos}
                  previstos={previstosOtros}
                  puedePagos={puedePagos}
                  puedeFacturar={puedeFacturar}
                  puedeGestionar={puedeGestionar}
                  onRegistrarPago={onRegistrarPago}
                  onAplicarMora={onAplicarMora}
                  onCrearFactura={(cargo) => setCargosFacturar([cargo.id])}
                  onVincular={onVincular}
                  onAnular={onAnular}
                  onAnularFactura={onAnularFactura}
                  onEnviarCorreo={onEnviarCorreo}
                  onPrevisto={puedeGestionar ? aplicarPrevisto : undefined}
                  onDetalle={setCuotaDetalle}
                  aplicandoMoraFacturaId={aplicandoMoraFacturaId}
                  facturasSueltas={facturasSueltas}
                  onEnviarFactura={onEnviarFactura}
                  enviadosPorCargo={enviadosPorCargo}
                />
              )
            )}

            {/* TODAS sus facturas: las que salieron de un cargo y las que se
                hicieron en Facturación por fuera del plan. Separarlas obligaba
                a mirar en dos sitios para contestar «¿qué le hemos facturado?». */}
            {vista === 'facturas' && (
              facturas.length === 0 && facturasSueltas.length === 0
                ? <EmptyBox text="Sin facturas" /> : (
                <SimpleTable head={['Mes', 'Concepto', 'Factura', 'Monto', 'Estado']}
                  rows={[
                    ...facturas.map((c) => [
                      c.mes ? `${MESES[c.mes]} ${c.anio}` : String(c.anio),
                      c.concepto ?? '—',
                      facturaLink(c),
                      fmtDOP(c.montoCentavos),
                      c.facturaEstadoPago ?? '—',
                    ]),
                    ...facturasSueltas.map((f) => [
                      fmtFechaCorta(f.fecha),
                      f.lineas.length > 0
                        ? f.lineas.map((l) => l.nombre).join(', ')
                        : 'Hecha en Facturación',
                      <Link key={`f-${f.id}`} href={`/dashboard/facturas/${f.id}`}
                        className="text-zero-600 hover:underline">
                        {f.encf || f.codigo || `Factura #${f.id}`}
                      </Link>,
                      fmtDOP(f.montoTotal),
                      f.montoTotal - f.pagadoCentavos <= 0 ? 'PAGADO'
                        : f.pagadoCentavos > 0 ? 'PARCIAL' : 'PENDIENTE',
                    ]),
                  ]} />
              )
            )}

            {/* Y todos los pagos, incluidos los de esas facturas: se cobraban
                de verdad y en la ficha no aparecían por ningún lado. */}
            {vista === 'pagos' && (
              pagosPeriodo.length === 0 && pagosSueltos.length === 0
                ? <EmptyBox text="Sin pagos registrados" /> : (
                <SimpleTable head={['Fecha', 'Mes', 'Concepto', 'Método', 'Monto']}
                  rows={[
                    ...pagosPeriodo.map((p) => [
                      fmtFechaCorta(p.fechaPago),
                      p.mes ? `${MESES[p.mes]} ${p.anio ?? ''}` : '—',
                      p.concepto ?? '—',
                      <span key="metodo" className="capitalize">{p.metodo ?? '—'}</span>,
                      fmtDOP(p.montoCentavos),
                    ]),
                    ...pagosSueltos.map((p) => [
                      fmtFechaCorta(p.fechaPago),
                      '—',
                      <Link key={`p-${p.id}`} href={`/dashboard/facturas/${p.ecfDocumentId}`}
                        className="text-zero-600 hover:underline">
                        {p.encf || p.codigo || 'Factura'}
                      </Link>,
                      <span key="metodo" className="capitalize">{p.metodo ?? '—'}</span>,
                      fmtDOP(p.montoCentavos),
                    ]),
                  ]} />
              )
            )}
          </div>
      <CrearCargoEstudianteDialog
        open={crearCargoAbierto}
        onClose={() => { setCrearCargoAbierto(false); setCargoMesInicial(null); }}
        onSaved={(cargoId) => {
          onCargoCreado();
          // Se pidió facturarlo en el acto: se abre la factura con ese cargo ya
          // marcado, en vez de dejar al usuario buscándolo en la lista.
          if (cargoId) setCargosFacturar([cargoId]);
        }}
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

      <FacturarCargosDialog
        open={cargosFacturar !== null}
        onOpenChange={(o) => { if (!o) { setCargosFacturar(null); setPrevistoFacturar(null); } }}
        cargoIds={cargosFacturar ?? []}
        previsto={previstoFacturar}
        onFacturado={(creada) => {
          setFacturaCreada(creada);
          onCargoCreado();
        }}
      />

      {/* Lo que acaba de salir, y qué hacer con ello. Cerrar y dejar al usuario
          buscando la factura en otra pantalla para cobrarla era el paso que
          sobraba: quien acaba de facturar suele tener al padre delante. */}
      <Dialog open={!!facturaCreada} onOpenChange={(o) => { if (!o) setFacturaCreada(null); }}>
        <DialogContent className="max-w-sm">
          {facturaCreada && (
            <>
              {/* Sin icono y con el detalle: un modal que solo dice "hecho" y un
                  importe obliga a abrir la factura para saber qué salió. */}
              <div className="px-6 pt-5">
                <p className="text-xs font-medium text-zero-700">
                  {facturaCreada.emitida ? 'Factura emitida' : 'Factura creada'}
                </p>
                <p className="mt-0.5 font-mono text-sm text-gray-900">
                  {facturaCreada.encf || `#${facturaCreada.documentoId}`}
                </p>
              </div>

              <div className="px-6 py-3">
                <div className="rounded-lg border border-gray-200">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <p className="truncate text-sm text-gray-800">{facturaCreada.cliente}</p>
                    <p className="text-xs text-gray-500">
                      {facturaCreada.vence
                        ? `Vence el ${fmtFechaCorta(facturaCreada.vence)}`
                        : 'Sin fecha límite'}
                    </p>
                  </div>
                  {facturaCreada.lineas.map((l, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0">
                      <span className="min-w-0 flex-1 text-xs text-gray-600">{l.titulo}</span>
                      <span className="shrink-0 text-xs text-gray-800">{fmtDOP(l.montoCentavos)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between px-1">
                  <span className="text-sm text-gray-500">Total</span>
                  <span className="text-sm font-medium text-gray-900">
                    {fmtDOP(Math.round(facturaCreada.montoTotal * 100))}
                  </span>
                </div>
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFacturaCreada(null)}>Cerrar</Button>
            <Button
              variant="outline"
              onClick={() => {
                const id = facturaCreada?.documentoId;
                setFacturaCreada(null);
                if (id) router.push(`/dashboard/facturas/${id}`);
              }}
            >
              Ver factura
            </Button>
            {puedePagos && (
              <Button
                onClick={() => {
                  const id = facturaCreada?.documentoId;
                  setFacturaCreada(null);
                  if (id) onRegistrarPago(id);
                }}
              >
                <Wallet className="mr-1.5 h-4 w-4" />Realizar pago
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "No cobrar" se confirma: deja de cobrarse una cuota del año y el
          devengo no la va a volver a poner. Adelantar no lo pide — genera un
          cargo pendiente, que se puede anular por el camino de siempre. */}
      <DetalleCuotaDialog
        cuota={cuotaDetalle as CuotaDetallada | null}
        cobro={cobro}
        open={!!cuotaDetalle}
        onClose={() => setCuotaDetalle(null)}
      />

      <Dialog open={!!previstoOmitir} onOpenChange={(o) => { if (!o && !aplicandoPrevisto) setPrevistoOmitir(null); }}>
        <DialogContent className="max-w-sm">
          <ModalHeader
            title="No cobrar esta cuota"
            subtitle={previstoOmitir
              ? `«${previstoOmitir.concepto}» de ${MESES[previstoOmitir.mes ?? 0] ?? 'ese mes'} `
                + `(${fmtDOP(previstoOmitir.montoCentavos)}) deja de cobrársele a este alumno. `
                + 'Las demás cuotas siguen igual.'
              : undefined}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrevistoOmitir(null)} disabled={aplicandoPrevisto}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={aplicandoPrevisto}
              onClick={() => { if (previstoOmitir) void aplicarPrevisto(previstoOmitir, 'omitir'); }}
            >
              {aplicandoPrevisto && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              No cobrarla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <ModalHeader title="Facturar varios meses"
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
  tone: 'blue' | 'verde' | 'red' | 'gray';
}) {
  // El color no decora: es lo que hace que "pendiente" salte antes que
  // "facturado" cuando se abre la ficha. La cuarta tarjeta se queda en gris a
  // propósito — es una fecha, no dinero, y teñirla la pondría al mismo nivel.
  const estilos = {
    blue: { caja: 'border-blue-200 bg-blue-50/60', icono: 'text-blue-600' },
    verde: { caja: 'border-emerald-200 bg-emerald-50/60', icono: 'text-emerald-600' },
    red:  { caja: 'border-red-200 bg-red-50/60', icono: 'text-red-600' },
    gray: { caja: 'border-gray-200 bg-white', icono: 'text-gray-500' },
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${estilos.caja}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
        <Icon className={`h-4 w-4 ${estilos.icono}`} />{label}
      </div>
      <p className="text-xl font-semibold text-gray-900 mt-3">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{detail}</p>
    </div>
  );
}

/**
 * Cuentas por cobrar del período, mes a mes y concepto a concepto.
 *
 * La tabla enseña UNA FILA POR CONCEPTO, no una por mes: en un mes conviven la
 * colegiatura y un recargo por mora, y un solo total no dice cuál de los dos se
 * pagó. El nombre del mes aparece en la primera fila de cada mes y se calla en
 * las siguientes, que es como se lee una cuenta corriente.
 *
 * Junto a los cargos reales van los PREVISTOS: cuotas que el calendario ya tiene
 * fechadas pero que todavía no son deuda porque el devengo no ha llegado a ese
 * mes. Se enseñan con los mismos datos —concepto, vencimiento, monto— para que
 * el colegio pueda decirle a un padre en septiembre lo que va a pagar en marzo,
 * y en gris con el badge "Previsto" para que nadie los cobre ni los cuente:
 * NO suman en pendiente, ni en el saldo del período, ni en morosidad.
 */
function MensualidadesTabla({ diaFacturaAuto, cargos, previstos, pagos, mesesAcademicos, enviadosPorCargo, puedePagos, puedeFacturar, puedeGestionar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onAgregarCargoMes, onPrevisto, onDetalle, aplicandoMoraFacturaId }: {
  /** Día del mes en que la recurrente factura sola. null = se factura a mano. */
  diaFacturaAuto: number | null;
  cargos: Cargo[];
  previstos: Previsto[];
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
  onAnularFactura: (cargo: Cargo) => void;
  onEnviarCorreo: (cargo: Cargo) => void;
  onAgregarCargoMes?: (mes: number, anio: number) => void;
  onPrevisto?: (p: Previsto, accion: 'adelantar' | 'omitir') => void;
  /** Abre el detalle de la cuota: fechas, recargo y avisos. */
  onDetalle?: (p: Previsto) => void;
  /** Canales por los que ya salió el aviso de cada cargo. */
  enviadosPorCargo?: Map<number, Set<string>>;
  aplicandoMoraFacturaId: number | null;
}) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [orden, setOrden] = useState<'asc' | 'desc'>('asc');
  const [porPagina, setPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);

  const todas: MesRow[] = mesesAcademicos.map(({ mes, anio }) => {
    const cargosMes = cargos.filter((c) => c.mes === mes && c.anio === anio);
    const previstosMes = previstos
      .filter((p) => p.mes === mes && p.anio === anio)
      .sort((a, b) => a.fechaEmision.localeCompare(b.fechaEmision));
    const total = cargosMes.reduce((s, c) => s + c.montoCentavos, 0);
    const saldo = cargosMes
      .filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado))
      .reduce((s, c) => s + c.saldoCentavos, 0);
    const pagado = Math.max(0, total - saldo);
    const totalPrevisto = previstosMes.reduce((s, p) => s + p.montoCentavos, 0);
    const factura = cargosMes.find((c) => c.ecfDocumentId != null) ?? null;
    // Historial de pagos del mes: los abonos hechos a las facturas de sus cargos.
    // Una factura, varios pagos (abonos parciales) → subfilas al desplegar.
    const cargoIds = new Set(cargosMes.map((c) => c.id));
    const pagosMes = pagos
      .filter((p) => p.cargoId != null && cargoIds.has(p.cargoId))
      .sort((a, b) => (a.fechaPago < b.fechaPago ? 1 : -1));
    const estado: EstadoMes = cargosMes.length === 0 && previstosMes.length > 0
      ? 'previsto'
      : estadoMes(cargosMes);
    return { mes, anio, cargosMes, previstosMes, total, saldo, pagado, totalPrevisto, factura, pagosMes, estado };
  });

  if (mesesAcademicos.length === 0) {
    return (
      <EmptyBox text="Este período no tiene fechas de inicio y fin. Configúralas para ver sus meses académicos." />
    );
  }

  const previstoAnio = todas.reduce((s, r) => s + r.totalPrevisto, 0);

  const ordenadas = [...todas].sort((a, b) => {
    const cmp = a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes;
    return orden === 'asc' ? cmp : -cmp;
  });

  const paginas = Math.max(1, Math.ceil(ordenadas.length / porPagina));
  const actual = Math.min(pagina, paginas);
  const desde = (actual - 1) * porPagina;
  const rows = ordenadas.slice(desde, desde + porPagina);

  // El mes abierto manda en el botón de "agregar cargo": el cargo se le pone a
  // un mes concreto, y sin uno abierto no hay a cuál. Se toma el primero de los
  // que se ven, no el primero del año, para que el botón hable del mes que el
  // usuario tiene delante.
  const mesAbierto = rows.find((r) => expandidos.has(`${r.anio}-${r.mes}`)) ?? null;

  return (
    <div className="mt-3">
      {puedeGestionar && onAgregarCargoMes && mesAbierto && (
        <div className="mb-2 flex justify-end">
          <Button size="sm" variant="outline" onClick={() => onAgregarCargoMes(mesAbierto.mes, mesAbierto.anio)}>
            <Plus className="mr-1.5 h-4 w-4" />Agregar cargo a {MESES[mesAbierto.mes]}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full table-fixed text-sm">
          <ColumnasCuentas />
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-3 py-2.5 font-medium">Período</th>
              <th className="px-3 py-2.5 font-medium">Concepto</th>
              {/* Por dónde ya se le avisó de este cobro. Va aquí y no pegado al
                  concepto: junto al nombre los iconos se leían como parte de él. */}
              <th className="px-3 py-2.5 font-medium">Avisos</th>
              <th className="px-3 py-2.5 font-medium">
                <button
                  type="button"
                  onClick={() => setOrden((o) => (o === 'asc' ? 'desc' : 'asc'))}
                  className="inline-flex items-center gap-1 hover:text-gray-700"
                  title={orden === 'asc' ? 'Del más próximo al más lejano' : 'Del más lejano al más próximo'}
                >
                  Vencimiento
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 font-medium text-right">Monto</th>
              <th className="px-3 py-2.5 font-medium text-right">Pagado</th>
              <th className="px-3 py-2.5 font-medium text-right">Pendiente</th>
              <th className="px-3 py-2.5 font-medium text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.anio}-${r.mes}`;
              return (
                <MesFila
                  key={key}
                  r={r}
                  diaFacturaAuto={diaFacturaAuto}
                  abierto={expandidos.has(key)}
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
                  onAnularFactura={onAnularFactura}
                  onEnviarCorreo={onEnviarCorreo}
                  onPrevisto={onPrevisto}
                  onDetalle={onDetalle}
                  enviadosPorCargo={enviadosPorCargo}
                  aplicandoMoraFacturaId={aplicandoMoraFacturaId}
                />
              );
            })}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
          <span>
            Mostrando {desde + 1} a {desde + rows.length} de {ordenadas.length} meses
          </span>
          <div className="flex items-center gap-2">
            <span>Mostrar</span>
            <NativeSelect
              value={String(porPagina)}
              onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1); }}
              className="h-7 w-16 text-xs"
            >
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </NativeSelect>
            <span>por página</span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={actual === 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 disabled:opacity-40"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-6 text-center font-medium text-gray-700">{actual}</span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(paginas, p + 1))}
              disabled={actual === paginas}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 disabled:opacity-40"
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {previstoAnio > 0 && (
        <p className="mt-2 text-right text-xs text-gray-500">
          Previsto para el resto del período <b className="text-gray-700">{fmtDOP(previstoAnio)}</b>
          {' '}· aún no facturado, no cuenta como deuda
        </p>
      )}
    </div>
  );
}

/**
 * Los cargos que no son mensualidad: inscripción, uniforme, material.
 *
 * Mismas columnas y misma alineación que Cuentas por cobrar —los importes a la
 * derecha, el estado a la vista y el ⋮ en cada concepto— porque son las dos
 * caras de la misma cuenta y el ojo pasa de una pestaña a la otra. Lo único
 * que falta aquí es el mes: estos cargos son del año, no de un mes.
 *
 * Los previstos entran igual que en la otra tabla: en gris, sin importes en
 * pagado/pendiente y sin sumar en ningún total.
 */
function OtrosCargosTabla({ cargos, previstos, facturasSueltas = [], onEnviarFactura, enviadosPorCargo, puedePagos, puedeFacturar, puedeGestionar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onPrevisto, onDetalle, aplicandoMoraFacturaId }: {
  cargos: Cargo[];
  previstos: Previsto[];
  /**
   * Lo que se le facturó desde Facturación, sin cargo escolar detrás.
   *
   * Se cuela en esta tabla porque para el colegio es lo mismo: algo que se le
   * cobró al alumno y que puede estar sin pagar. Estaba en un bloque aparte al
   * final y se leía como otra cosa. No lleva menú de acciones: la factura ya
   * existe y se gestiona en Facturación.
   */
  facturasSueltas?: FacturaSuelta[];
  /** Manda esa factura por correo. Las sueltas no tienen cargo detrás. */
  onEnviarFactura?: (ecfDocumentId: number, etiqueta: string) => void;
  puedePagos: boolean;
  puedeFacturar: boolean;
  puedeGestionar: boolean;
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  onCrearFactura: (cargo: Cargo) => void;
  onVincular: (cargo: Cargo) => void;
  onAnular: (cargo: Cargo) => void;
  onAnularFactura: (cargo: Cargo) => void;
  onEnviarCorreo: (cargo: Cargo) => void;
  onPrevisto?: (p: Previsto, accion: 'adelantar' | 'omitir') => void;
  /** Abre el detalle de la cuota: fechas, recargo y avisos. */
  onDetalle?: (p: Previsto) => void;
  /** Canales por los que ya salió el aviso de cada cargo. */
  enviadosPorCargo?: Map<number, Set<string>>;
  aplicandoMoraFacturaId: number | null;
}) {
  const totalPrevisto = previstos.reduce((s, p) => s + p.montoCentavos, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500">
            <th className="px-3 py-2 font-medium">Concepto</th>
            {/* Estrecha y con su título: los tres iconos pegados al nombre del
                concepto se leían como parte del nombre. */}
            <th className="w-20 px-3 py-2 font-medium">Avisos</th>
            <th className="px-3 py-2 font-medium">Vencimiento</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium text-right">Monto</th>
            <th className="px-3 py-2 font-medium text-right">Pagado</th>
            <th className="px-3 py-2 font-medium text-right">Pendiente</th>
            <th className="px-3 py-2 font-medium text-right">Acción</th>
          </tr>
        </thead>
        <tbody>
          {/* La factura en una línea, con sus conceptos debajo.
              Una fila por concepto obligaba a repartir el abono a prorrata
              entre ellos, y ese reparto es inventado: el pago se hace sobre la
              FACTURA, no sobre la línea. Así los importes de arriba son los
              reales y los conceptos dicen por qué se le cobró. */}
          {facturasSueltas.flatMap((f) => {
            const anulada = f.estado === 'ANULADO';
            const saldo = Math.max(0, f.montoTotal - f.pagadoCentavos);
            const filas = [(
              <tr key={`fs-${f.id}`} className="border-t border-gray-100 hover:bg-gray-50/60">
                <td className={`px-3 py-2.5 font-medium ${anulada ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  Factura
                  <Link href={`/dashboard/facturas/${f.id}`}
                    className="ml-2 text-xs font-normal text-zero-600 hover:underline">
                    {f.encf || f.codigo || `#${f.id}`}
                  </Link>
                  <span className="block text-xs font-normal text-gray-400">Hecha en Facturación</span>
                </td>
                {/* La factura se manda desde Facturación: aquí no consta por
                    qué canales salió, y un semáforo apagado diría que no se le
                    avisó cuando lo que pasa es que no se sabe. */}
                <td className="px-3 py-2.5 text-center text-xs text-gray-300">—</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-gray-500">{fmtFechaCorta(f.fecha)}</td>
                <td className="px-3 py-2.5">
                  <EstadoFacturaBadge anulada={anulada} saldo={saldo} pagado={f.pagadoCentavos} />
                </td>
                <td className={`px-3 py-2.5 text-right ${anulada ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {fmtDOP(f.montoTotal)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {f.pagadoCentavos > 0 ? fmtDOP(f.pagadoCentavos) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={saldo > 0 ? 'font-medium text-red-600' : 'font-medium text-zero-700'}>
                    {fmtDOP(saldo)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {onEnviarFactura ? (
                    <button type="button"
                      title="Enviar esta factura por correo"
                      onClick={() => onEnviarFactura(f.id, `${f.encf || f.codigo || 'la factura'}`)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                      <Mail className="h-4 w-4" />
                    </button>
                  ) : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            )];

            // Los conceptos, sangrados. Sin pagado ni pendiente propios: ese
            // dato no existe por línea, y ponerle uno sería inventarlo.
            for (const [i, l] of f.lineas.entries()) {
              filas.push(
                <tr key={`fs-${f.id}-l${i}`} className="border-t border-gray-50 bg-gray-50/30">
                  <td className="py-2 pl-8 pr-3 text-gray-700">
                    {l.nombre}
                    {l.cantidad > 1 && <span className="ml-1 text-xs text-gray-400">×{l.cantidad}</span>}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right text-gray-600">{fmtDOP(l.importeCentavos)}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                </tr>,
              );
            }
            return filas;
          })}
          {cargos.map((c) => {
            const anulado = c.estado === 'anulado';
            const pagadoCargo = Math.max(0, c.montoCentavos - c.saldoCentavos);
            return (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                <td className={`px-3 py-2.5 font-medium ${anulado ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {c.concepto ?? 'Sin concepto'}
                </td>
                <td className="px-3 py-2.5">
                  <AvisoSemaforo canales={enviadosPorCargo?.get(c.id)} />
                </td>
                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                  {c.fechaVencimiento ? fmtFechaCorta(c.fechaVencimiento) : '—'}
                </td>
                <td className="px-3 py-2.5"><EstadoCargoBadge estado={c.estado} sinFactura={c.ecfDocumentId == null} /></td>
                <td className={`px-3 py-2.5 text-right ${anulado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {fmtDOP(c.montoCentavos)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700">
                  {anulado ? <span className="text-gray-300">—</span> : fmtDOP(pagadoCargo)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {anulado ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <span className={c.saldoCentavos > 0 ? 'font-medium text-red-600' : 'font-medium text-zero-700'}>
                      {fmtDOP(c.saldoCentavos)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <CargoActionsMenu
                    cargo={c}
                    puedePagos={puedePagos}
                    puedeFacturar={puedeFacturar}
                    puedeGestionar={puedeGestionar}
                    onRegistrarPago={onRegistrarPago}
                    onAplicarMora={onAplicarMora}
                    onCrearFactura={onCrearFactura}
                    onVincular={onVincular}
                    onAnular={onAnular}
                    onAnularFactura={onAnularFactura}
                    onEnviarCorreo={onEnviarCorreo}
                    aplicandoMora={aplicandoMoraFacturaId === c.ecfDocumentId}
                  />
                </td>
              </tr>
            );
          })}

          {previstos.map((p) => (
            <tr key={`p-${p.key}`} className="border-t border-dashed border-gray-200 bg-gray-50/30 hover:bg-gray-50/60">
              <td className="px-3 py-2.5 text-gray-500">{p.concepto}</td>
              <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                {p.fechaVencimiento ? fmtFechaCorta(p.fechaVencimiento) : '—'}
              </td>
              <td className="px-3 py-2.5"><EstadoMesBadge estado="previsto" /></td>
              <td className="px-3 py-2.5 text-right text-gray-500">{fmtDOP(p.montoCentavos)}</td>
              <td className="px-3 py-2.5 text-right text-gray-300">—</td>
              <td className="px-3 py-2.5 text-right text-gray-300">—</td>
              <td className="px-3 py-2.5 text-right">
                {puedeGestionar && p.cuotaId > 0 && onPrevisto ? (
                  <PrevistoActionsMenu previsto={p} onPrevisto={onPrevisto} />
                ) : <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPrevisto > 0 && (
        <div className="border-t border-gray-100 px-3 py-2 text-right text-xs text-gray-500">
          Previsto <b className="text-gray-700">{fmtDOP(totalPrevisto)}</b> · aún no facturado, no cuenta como deuda
        </div>
      )}
    </div>
  );
}

/**
 * Anchos de las columnas de Cuentas por cobrar.
 *
 * Están fijados y no dejados al navegador porque la tabla del mes desplegado es
 * OTRA tabla, dentro de una celda de esta: sin anchos declarados cada una
 * reparte a su aire según su contenido y las columnas de la hija caen
 * desplazadas respecto a las del padre, que es justo lo que hace que el
 * desplegable parezca un cuerpo extraño en vez de la continuación de la fila.
 */
// La columna de Avisos va estrecha: son tres iconos de 14 px.
const ANCHOS_CUENTAS = ['16%', '23%', '7%', '10%', '9%', '10%', '9%', '11%', '5%'];

function ColumnasCuentas() {
  return <colgroup>{ANCHOS_CUENTAS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>;
}

type EstadoMes = ReturnType<typeof estadoMes> | 'previsto';

type MesRow = {
  mes: number; anio: number; cargosMes: Cargo[]; previstosMes: Previsto[];
  total: number; saldo: number; pagado: number; totalPrevisto: number;
  factura: Cargo | null; pagosMes: Pago[];
  estado: EstadoMes;
};

/**
 * Un mes: su fila resumen y, al desplegarlo, el detalle concepto a concepto.
 *
 * La fila del mes cambia de papel según lo que tenga dentro. Con un solo
 * concepto ENSEÑA ese concepto y no se despliega: repetirlo debajo sería decir
 * dos veces lo mismo. Con varios pasa a ser el total del mes y el detalle baja
 * a sus propias filas. Todo son filas de la MISMA tabla, así que las columnas
 * cuadran solas: no hay una tabla dentro de otra que alinear.
 *
 * Los pagos del mes salen al desplegar, sin cabecera ni resumen: el abonado y
 * el pendiente ya están en la fila del mes, en sus columnas.
 */
function MesFila({ r, diaFacturaAuto, abierto, onToggle, enviadosPorCargo, puedePagos, puedeFacturar, puedeGestionar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onPrevisto, onDetalle, aplicandoMoraFacturaId }: {
  r: MesRow;
  diaFacturaAuto: number | null;
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
  onAnularFactura: (cargo: Cargo) => void;
  onEnviarCorreo: (cargo: Cargo) => void;
  onPrevisto?: (p: Previsto, accion: 'adelantar' | 'omitir') => void;
  /** Abre el detalle de la cuota: fechas, recargo y avisos. */
  onDetalle?: (p: Previsto) => void;
  /** Canales por los que ya salió el aviso de cada cargo. */
  enviadosPorCargo?: Map<number, Set<string>>;
  aplicandoMoraFacturaId: number | null;
}) {
  const cuantos = r.cargosMes.length + r.previstosMes.length;
  // Un solo concepto: la fila del mes ES el concepto, abierta o cerrada.
  const unico = cuantos === 1;
  const cargoUnico = unico ? r.cargosMes[0] ?? null : null;
  const previstoUnico = unico ? r.previstosMes[0] ?? null : null;
  const soloPrevistos = r.cargosMes.length === 0;
  // Solo se despliega lo que tiene algo que enseñar debajo. Un mes de un solo
  // concepto sin pagos no esconde nada, así que ni flecha ni click.
  const desplegable = cuantos > 1 || r.pagosMes.length > 0;
  const desplegado = abierto && desplegable;

  // El cargo sobre el que actúa el menú del mes: el primero que aún debe algo,
  // y si están todos saldados, el que tenga la factura.
  const accion = r.cargosMes.find((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado)) ?? r.factura;

  const vencimientoMes = [
    ...r.cargosMes.map((c) => c.fechaVencimiento),
    ...r.previstosMes.map((p) => p.fechaVencimiento),
  ].filter((f): f is string => !!f).sort()[0] ?? null;

  const montoMes = r.total > 0 ? r.total : r.totalPrevisto;

  return (
    <>
      <tr
        className={`border-t border-gray-100 hover:bg-gray-50/60 ${desplegable ? 'cursor-pointer' : ''}`}
        onClick={desplegable ? onToggle : undefined}
      >
        <td className="px-3 py-3 align-top">
          <span className="flex items-center gap-1.5">
            {desplegable
              ? <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${desplegado ? 'rotate-90' : ''}`} />
              : <span className="h-3.5 w-3.5 shrink-0" />}
            <CalendarDays className="h-4 w-4 shrink-0 text-zero-500" />
            <span className="truncate font-medium text-gray-900">{MESES[r.mes]} {r.anio}</span>
          </span>
          {!unico && cuantos > 0 && (
            <span className="ml-9 block text-xs text-gray-400">
              {cuantos} {cuantos === 1 ? 'cargo' : 'cargos'}
            </span>
          )}
          {/* Que no haya factura todavía no significa que haya que hacerla a
              mano: si la matrícula tiene mensualidad configurada, sale sola. */}
          {diaFacturaAuto && soloPrevistos && (
            <span className="ml-9 mt-0.5 flex items-center gap-1 text-xs text-zero-700">
              <Repeat className="h-3 w-3" />
              Se factura sola el {diaFacturaAuto}/{String(r.mes).padStart(2, '0')}
            </span>
          )}
        </td>

        <td className="px-3 py-3 align-top">
          {cuantos === 0 ? (
            <span className="text-gray-400">Sin cargo</span>
          ) : unico ? (
            <span className={cargoUnico?.estado === 'anulado' ? 'text-gray-400 line-through' : 'text-gray-800'}>
              {cargoUnico?.concepto ?? previstoUnico?.concepto ?? 'Sin concepto'}
            </span>
          ) : (
            <span className="text-gray-500">Total del período</span>
          )}
        </td>

        {/* La unión de los canales por los que salió algún aviso del mes: un
            mes con dos cargos avisados por vías distintas está avisado por las
            dos. Sin cargo todavía no hay nada que avisar. */}
        <td className="px-3 py-3 align-top">
          <AvisoSemaforo
            canales={new Set(r.cargosMes.flatMap((c) => [...(enviadosPorCargo?.get(c.id) ?? [])]))}
            titulo={r.cargosMes.length === 0
              ? 'Todavía no es deuda: el aviso sale cuando se genere la factura'
              : undefined} />
        </td>
        <td className="px-3 py-3 align-top whitespace-nowrap text-gray-500">
          {vencimientoMes ? fmtFechaCorta(vencimientoMes) : '—'}
        </td>
        <td className="px-3 py-3 align-top"><EstadoMesBadge estado={r.estado} /></td>
        <td className="px-3 py-3 align-top text-right text-gray-800">
          {cuantos === 0 ? <span className="text-gray-300">—</span> : fmtDOP(montoMes)}
        </td>

        {/* Un mes que solo tiene previstos no lleva importes en pagado ni en
            pendiente: todavía no es deuda, y ponerle cifras aquí lo haría sumar
            con la vista contra el saldo del período, que no lo cuenta. */}
        <td className="px-3 py-3 align-top text-right text-gray-700">
          {soloPrevistos ? <span className="text-gray-300">—</span> : fmtDOP(r.pagado)}
        </td>
        <td className="px-3 py-3 align-top text-right">
          {soloPrevistos ? (
            <span className="text-gray-300">—</span>
          ) : (
            <span className={r.saldo > 0 ? 'font-medium text-red-600' : 'font-medium text-zero-700'}>
              {fmtDOP(r.saldo)}
            </span>
          )}
        </td>
        <td className="px-3 py-3 align-top text-right" onClick={(e) => e.stopPropagation()}>
          {accion ? (
            <CargoActionsMenu
              cargo={accion}
              puedePagos={puedePagos}
              puedeFacturar={puedeFacturar}
              puedeGestionar={puedeGestionar}
              mesTieneFactura={!!r.factura}
              onRegistrarPago={onRegistrarPago}
              onAplicarMora={onAplicarMora}
              onCrearFactura={onCrearFactura}
              onVincular={onVincular}
              onAnular={onAnular}
              onAnularFactura={onAnularFactura}
              onEnviarCorreo={onEnviarCorreo}
              aplicandoMora={aplicandoMoraFacturaId === accion.ecfDocumentId}
            />
          ) : previstoUnico ? (
            <span className="inline-flex items-center justify-end gap-1">
              {onDetalle && <BotonDetalleCuota previsto={previstoUnico} onDetalle={onDetalle} />}
              {puedeGestionar && previstoUnico.cuotaId > 0 && onPrevisto && (
                <PrevistoActionsMenu previsto={previstoUnico} onPrevisto={onPrevisto} />
              )}
            </span>
          ) : <span className="text-gray-300">—</span>}
        </td>
      </tr>

      {desplegado && !unico && r.cargosMes.map((c) => {
        const anulado = c.estado === 'anulado';
        const pagadoCargo = Math.max(0, c.montoCentavos - c.saldoCentavos);
        return (
          <tr key={`c-${c.id}`} className="border-t border-gray-100 hover:bg-gray-50/60">
            <td className="px-3 py-3" />
            <td className="px-3 py-3">
              <span className={anulado ? 'text-gray-400 line-through' : 'text-gray-800'}>
                {c.concepto ?? 'Sin concepto'}
              </span>
            </td>
            <td className="px-3 py-3">
              <AvisoSemaforo canales={enviadosPorCargo?.get(c.id)} />
            </td>
            <td className="px-3 py-3 whitespace-nowrap text-gray-500">
              {c.fechaVencimiento ? fmtFechaCorta(c.fechaVencimiento) : '—'}
            </td>
            <td className="px-3 py-3"><EstadoCargoBadge estado={c.estado} sinFactura={c.ecfDocumentId == null} /></td>
            <td className={`px-3 py-3 text-right ${anulado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
              {fmtDOP(c.montoCentavos)}
            </td>
            <td className="px-3 py-3 text-right text-gray-700">
              {anulado ? <span className="text-gray-300">—</span> : fmtDOP(pagadoCargo)}
            </td>
            <td className="px-3 py-3 text-right">
              {anulado ? (
                <span className="text-gray-300">—</span>
              ) : (
                <span className={c.saldoCentavos > 0 ? 'font-medium text-red-600' : 'font-medium text-zero-700'}>
                  {fmtDOP(c.saldoCentavos)}
                </span>
              )}
            </td>
            <td className="px-3 py-3 text-right">
              <CargoActionsMenu
                cargo={c}
                puedePagos={puedePagos}
                puedeFacturar={puedeFacturar}
                puedeGestionar={puedeGestionar}
                mesTieneFactura={!!r.factura}
                onRegistrarPago={onRegistrarPago}
                onAplicarMora={onAplicarMora}
                onCrearFactura={onCrearFactura}
                onVincular={onVincular}
                onAnular={onAnular}
                onAnularFactura={onAnularFactura}
                onEnviarCorreo={onEnviarCorreo}
                aplicandoMora={aplicandoMoraFacturaId === c.ecfDocumentId}
              />
            </td>
          </tr>
        );
      })}

      {desplegado && !unico && r.previstosMes.map((p) => (
        <tr key={`p-${p.key}`} className="border-t border-gray-100 bg-gray-50/30 hover:bg-gray-50/60">
          <td className="px-3 py-3" />
          <td className="px-3 py-3">
            <span className="text-gray-800">{p.concepto}</span>
            <span className="block text-xs text-gray-400">Se emite el {fmtFechaCorta(p.fechaEmision)}</span>
          </td>
          {/* Un previsto todavía no es deuda: los tres van apagados, y el
              texto dice por qué en vez de dejar un guion mudo. */}
          <td className="px-3 py-3">
            <AvisoSemaforo titulo="Todavía no es deuda: el aviso sale cuando se genere la factura" />
          </td>
          <td className="px-3 py-3 whitespace-nowrap text-gray-500">
            {p.fechaVencimiento ? fmtFechaCorta(p.fechaVencimiento) : '—'}
          </td>
          <td className="px-3 py-3"><EstadoMesBadge estado="previsto" /></td>
          <td className="px-3 py-3 text-right text-gray-800">{fmtDOP(p.montoCentavos)}</td>
          <td className="px-3 py-3 text-right text-gray-300">—</td>
          <td className="px-3 py-3 text-right text-gray-300">—</td>
          <td className="px-3 py-3 text-right">
            <span className="inline-flex items-center justify-end gap-1">
              {onDetalle && <BotonDetalleCuota previsto={p} onDetalle={onDetalle} />}
              {puedeGestionar && p.cuotaId > 0 && onPrevisto && (
                <PrevistoActionsMenu previsto={p} onPrevisto={onPrevisto} />
              )}
            </span>
          </td>
        </tr>
      ))}

      {/* Los pagos del mes, sin cabecera ni resumen: lo abonado y lo pendiente
          ya están en la fila del mes, en sus columnas. */}
      {desplegado && r.pagosMes.map((p) => (
        <tr key={`pago-${p.id}`} className="border-t border-gray-100">
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5 capitalize text-gray-700">{p.metodo ?? 'Pago'}</td>
          <td className="px-3 py-2.5" />
          <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{fmtFechaCorta(p.fechaPago)}</td>
          <td className="px-3 py-2.5 truncate text-gray-500" colSpan={2}>{p.referencia ?? '—'}</td>
          <td className="px-3 py-2.5 text-right font-medium text-gray-900" colSpan={2}>{fmtDOP(p.montoCentavos)}</td>
          <td className="px-3 py-2.5" />
        </tr>
      ))}

    </>
  );
}

/**
 * El botón de «qué va a pasar con este cobro».
 *
 * La tabla enseña monto y vencimiento, y con eso no se contesta lo que la
 * familia pregunta por teléfono: cuándo le llega la factura, hasta cuándo paga
 * sin recargo, de cuánto sería y si le van a avisar. Todo eso ya estaba
 * decidido, pero repartido entre Conceptos, el calendario de cuotas y la
 * política de mora del negocio.
 */
function BotonDetalleCuota({ previsto, onDetalle }: {
  previsto: Previsto;
  onDetalle: (p: Previsto) => void;
}) {
  return (
    <button
      type="button"
      title="Ver fechas, recargo y avisos"
      aria-label={`Detalle de ${previsto.concepto}`}
      onClick={(e) => { e.stopPropagation(); onDetalle(previsto); }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
    >
      <Info className="h-4 w-4" />
    </button>
  );
}

/**
 * Qué se puede hacer con una cuota que todavía no es deuda.
 *
 * Adelantarla la convierte en un cargo normal —y a partir de ahí se factura y
 * se cobra como cualquier otro—, y "no cobrarla" la gasta sin cobrar. No hay un
 * "pagar" directo: cobrar sin que exista el cargo dejaría un pago colgando de
 * nada. Se adelanta y se cobra, en ese orden, con el mismo menú de siempre.
 */
function PrevistoActionsMenu({ previsto, onPrevisto }: {
  previsto: Previsto;
  onPrevisto: (p: Previsto, accion: 'adelantar' | 'omitir') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Acciones de ${previsto.concepto} (previsto)`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 data-[state=open]:bg-gray-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => onPrevisto(previsto, 'adelantar')}>
          <Receipt className="h-4 w-4" />Facturar este mes
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onPrevisto(previsto, 'omitir')}
          className="text-red-600 focus:text-red-600"
        >
          <Ban className="h-4 w-4" />No cobrar esta cuota
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CargoActionsMenu({ cargo, puedePagos, puedeFacturar, puedeGestionar, mesTieneFactura, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAnularFactura, onEnviarCorreo, aplicandoMora }: {
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
  onAnularFactura: (cargo: Cargo) => void;
  onEnviarCorreo: (cargo: Cargo) => void;
  aplicandoMora: boolean;
}) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeAnularFactura = permissions.includes('facturas:anular');
  const puedeEmitirDgii = permissions.includes('facturas:emitir-dgii');
  const pendiente = ['pendiente', 'parcial', 'vencido'].includes(cargo.estado);
  const tieneFactura = cargo.ecfDocumentId != null;
  // El PDF se pide por código cuando lo hay, igual que en la pantalla de la
  // factura: es lo que sale impreso y lo que la familia reconoce.
  const refPdf = cargo.facturaCodigo ?? cargo.ecfDocumentId;
  // Falta emitirla: es un borrador, una histórica o una sin NCF. Mismas reglas
  // que /dashboard/facturas/[id], de donde sale el botón de verdad.
  const faltaEmitir = tieneFactura
    && !['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO', 'ANULADO']
      .includes(cargo.facturaEstado ?? '');
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
            <Receipt className="h-4 w-4" />Facturar
          </DropdownMenuItem>
        )}
        {pendiente && !tieneFactura && puedeFacturar && (
          <DropdownMenuItem onSelect={() => onVincular(cargo)}>
            <Link2 className="h-4 w-4" />Vincular factura
          </DropdownMenuItem>
        )}
        {/* Antes esto solo salía cuando NO se podía cobrar ni facturar, así que
            un usuario con permisos no tenía por dónde abrir la factura del mes:
            la veía en la columna pero el menú no la ofrecía. */}
        {tieneFactura && (
          <DropdownMenuItem onSelect={() => router.push(`/dashboard/facturas/${cargo.ecfDocumentId}`)}>
            <Receipt className="h-4 w-4" />Ver factura
          </DropdownMenuItem>
        )}
        {/* Ver el PDF e imprimirlo no necesitan salir de aquí: son dos rutas que
            devuelven el documento ya armado. Ir a la pantalla de la factura solo
            para descargarlo era un rodeo. */}
        {tieneFactura && (
          <DropdownMenuItem onSelect={() => window.open(`/api/pdf/factura/${refPdf}`, '_blank', 'noreferrer')}>
            <FileText className="h-4 w-4" />Ver PDF
          </DropdownMenuItem>
        )}
        {tieneFactura && (
          <DropdownMenuItem onSelect={() => window.open(`/api/pdf/factura/${refPdf}/ticket`, '_blank', 'noreferrer')}>
            <Printer className="h-4 w-4" />Imprimir
          </DropdownMenuItem>
        )}
        {/* Emitir SÍ manda a la pantalla de la factura: la DGII pide elegir
            secuencia y a veces completar datos del comprador, y eso no cabe en
            un menú. El `?emitir=1` abre allí el modal directo. */}
        {faltaEmitir && puedeEmitirDgii && (
          <DropdownMenuItem onSelect={() => router.push(`/dashboard/facturas/${cargo.ecfDocumentId}?emitir=1`)}>
            <Send className="h-4 w-4" />Emitir en DGII
          </DropdownMenuItem>
        )}
        {tieneFactura && puedeFacturar && (
          <DropdownMenuItem onSelect={() => onEnviarCorreo(cargo)}>
            <Mail className="h-4 w-4" />Enviar por correo
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
        {/* Anular la FACTURA es otra cosa que anular el cargo, y pesa más: toca
            un documento fiscal. Por eso va detrás de su propio permiso, que el
            servidor vuelve a comprobar. */}
        {tieneFactura && puedeAnularFactura && (
          <DropdownMenuItem
            onSelect={() => onAnularFactura(cargo)}
            className="text-red-600 focus:text-red-600"
          >
            <Ban className="h-4 w-4" />Anular factura
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
    /** Su período es el año escolar en curso. */
    periodoActivo: boolean;
    estado: string | null;
    fecha: string | null;
    fechaInicio: string | null;
    fechaFin: string | null;
    facturaRecurrenteId: number | null;
    /** Día del mes en que la recurrente factura sola. null = no hay recurrente activa. */
    diaFacturaAuto: number | null;
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
      periodoActivo: m.periodoActivo === true,
      estado: m.estado,
      fecha: m.fechaInscripcion,
      fechaInicio: m.periodoFechaInicio,
      fechaFin: m.periodoFechaFin,
      facturaRecurrenteId: m.facturaRecurrenteId,
      // Solo cuenta la recurrente ACTIVA: una pausada o finalizada no va a
      // emitir nada, y anunciarlo sería prometer una factura que no sale.
      diaFacturaAuto: m.recurrenteEstado === 'activa'
        ? (m.recurrenteDiaCobro ?? (Number(m.recurrenteProxima?.slice(8, 10)) || null))
        : null,
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
          periodoActivo: false,
          estado: null,
          fecha: null,
          fechaInicio: null,
          fechaFin: null,
          facturaRecurrenteId: null,
          diaFacturaAuto: null,
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
      // El año escolar EN CURSO va primero, y por tanto es el que se abre solo.
      // Ordenar solo por fecha de inscripción no bastaba: reinscribir a un
      // alumno el mismo día en dos períodos dejaba arriba al que tuviera el id
      // más alto, que puede ser el año viejo — y la ficha abría vacía.
      if (a.periodoActivo !== b.periodoActivo) return a.periodoActivo ? -1 : 1;
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

/**
 * Las cuotas del plan que todavía no son cargo.
 *
 * El descarte va por `cuotaId`, que es la misma llave con la que el devengo
 * evita cobrar dos veces (índice único `matricula_id, cuota_id`). Por eso entran
 * también los cargos ANULADOS: su cuota está gastada y el devengo no la va a
 * volver a crear, así que anunciarla como prevista sería prometer una factura
 * que no va a salir.
 *
 * Los conceptos sin calendario devengan con `cuota_id` nulo, y ahí la llave es
 * el concepto: si ya tiene un cargo en esta matrícula, no se anuncia otro.
 */
function previstosDelPlan(lineas: PlanLinea[], cargos: Cargo[]): Previsto[] {
  const cuotasGastadas = new Set(
    cargos.map((c) => c.cuotaId).filter((v): v is number => v != null),
  );
  const conceptosSinCuota = new Set(
    cargos.filter((c) => c.cuotaId == null).map((c) => c.conceptoId),
  );

  const out: Previsto[] = [];
  for (const linea of lineas) {
    for (const cuota of linea.cuotas) {
      // Omitida = se emitió antes de que el alumno entrara. No se le va a cobrar.
      if (cuota.omitida) continue;
      const yaEsta = cuota.cuotaId > 0
        ? cuotasGastadas.has(cuota.cuotaId)
        : conceptosSinCuota.has(linea.conceptoId);
      if (yaEsta) continue;
      out.push({
        key: cuota.cuotaId > 0 ? `q${cuota.cuotaId}` : `n${linea.conceptoId}-${cuota.numero}`,
        cuotaId: cuota.cuotaId,
        conceptoId: linea.conceptoId,
        concepto: linea.nombre,
        tipo: linea.tipo,
        mes: cuota.mes,
        // El año sale de la emisión, igual que en el devengo: el del vencimiento
        // saltaría de año en la cuota de diciembre de un concepto con plazo.
        anio: Number(cuota.fechaEmision.slice(0, 4)),
        fechaEmision: cuota.fechaEmision,
        fechaVencimiento: cuota.fechaVencimiento,
        montoCentavos: cuota.montoCentavos,
        reglas: linea.reglas,
      });
    }
  }
  return out;
}

function estadoMes(cargos: Cargo[]): 'pagado' | 'adelantado' | 'vencido' | 'pendiente' | 'parcial' | 'sin-facturar' | 'sin-cargo' {
  if (cargos.length === 0) return 'sin-cargo';
  const hoyIso = new Date().toISOString().slice(0, 10);
  const vivos = cargos.filter((c) => ['pendiente', 'parcial', 'vencido'].includes(c.estado));
  if (vivos.length === 0) {
    const futura = cargos.some((c) => c.fechaVencimiento && c.fechaVencimiento >= hoyIso);
    return futura ? 'adelantado' : 'pagado';
  }
  if (vivos.some((c) => c.estado === 'vencido' || (c.fechaVencimiento && c.fechaVencimiento < hoyIso))) return 'vencido';
  if (vivos.some((c) => c.estado === 'parcial')) return 'parcial';
  // Se debe, pero todavía no se ha emitido nada: al padre no le ha llegado
  // ningún documento por esto. Es lo que hay que hacer con él, y decirlo
  // "pendiente" lo confundía con lo que ya está facturado y sin cobrar.
  if (vivos.every((c) => c.ecfDocumentId == null)) return 'sin-facturar';
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
function EstadoCargoBadge({ estado, sinFactura }: { estado: string; sinFactura?: boolean }) {
  if (estado === 'pagado')  return <Badge className="bg-zero-50 text-zero-700 border-zero-200">Pagado</Badge>;
  if (estado === 'vencido') return <Badge className="bg-red-50 text-red-600 border-red-200">Vencido</Badge>;
  if (estado === 'parcial') return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Parcial</Badge>;
  if (estado === 'anulado') return <Badge variant="outline" className="text-gray-400">Anulado</Badge>;
  // El cargo nace al matricular, no al facturar: la inscripción y el uniforme
  // se deben desde el primer día, mucho antes de que salga ningún comprobante.
  // Decirlo "pendiente" mezclaba dos cosas distintas —lo que falta por cobrar y
  // lo que falta por emitir— y dejaba al usuario preguntándose de qué factura
  // venía. Sigue contando como deuda; lo único que cambia es que lo dice.
  if (sinFactura) return <Badge variant="outline" className="border-gray-300 text-gray-600">Sin facturar</Badge>;
  return <Badge className="bg-gray-50 text-gray-600 border-gray-200">Pendiente</Badge>;
}

function EstadoMesBadge({ estado }: { estado: EstadoMes }) {
  if (estado === 'pagado') return <Badge className="bg-zero-50 text-zero-700 border-zero-200">Pagado</Badge>;
  if (estado === 'adelantado') return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Adelantado</Badge>;
  if (estado === 'vencido') return <Badge className="bg-red-50 text-red-600 border-red-200">Vencido</Badge>;
  if (estado === 'parcial') return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Parcial</Badge>;
  // Previsto no es un estado del cargo: es la ausencia de cargo con una promesa
  // de calendario detrás. Borde discontinuo para que no se confunda de un
  // vistazo con "pendiente", que sí hay que cobrar.
  if (estado === 'previsto') return <Badge variant="outline" className="border-dashed text-gray-500">Previsto</Badge>;
  // Se debe y no se ha emitido nada. Distinto de "previsto" —eso todavía no se
  // debe— y distinto de "por vencer", que da por hecho que ya hay factura.
  if (estado === 'sin-facturar') return <Badge variant="outline" className="border-gray-300 text-gray-600">Sin facturar</Badge>;
  if (estado === 'sin-cargo') return <Badge variant="outline" className="text-gray-500">Sin cargo</Badge>;
  return <Badge className="bg-gray-50 text-gray-600 border-gray-200">Por vencer</Badge>;
}

function facturaLink(cargo: Cargo) {
  if (!cargo.ecfDocumentId) return <span className="text-gray-300 text-xs">—</span>;
  const ref = cargo.facturaEncf || cargo.facturaCodigo || `#${cargo.ecfDocumentId}`;
  return (
    // `truncate` + title: un código como FA-2026-CAAF-X75AG-000408 no cabe en la
    // columna y partía la fila en tres líneas. Se ve el principio, que es lo que
    // identifica, y el resto al pasar por encima o al abrirlo.
    <Link href={`/dashboard/facturas/${cargo.ecfDocumentId}`}
      title={ref}
      className="flex items-center gap-1 text-xs text-zero-700 hover:text-zero-800 hover:underline">
      <Receipt className="h-3 w-3 shrink-0" />
      <span className="truncate">{ref}</span>
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
  const volver = useVolver('/escolar/estudiantes');
  return (
    <button type="button" onClick={volver}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-zero-600 transition-colors">
      <ArrowLeft className="h-4 w-4" />Volver a estudiantes
    </button>
  );
}

// Chip compacto clave·valor para la tarjeta horizontal del estudiante.
/**
 * Facturas del alumno que no salieron de ningún cargo escolar.
 *
 * En Facturación la factura ya lleva al alumno como beneficiario, así que un
 * colegio que cobraba antes de tener el módulo tiene años de facturas suyas
 * que la ficha no enseñaba. Se listan aparte y no suman en los totales del
 * período: no son deuda del plan de cobro y cuadrarían mal.
 */
function FacturasSueltas({ facturas }: { facturas: FacturaSuelta[] }) {
  if (facturas.length === 0) return null;
  const total = facturas.reduce((s, f) => s + f.montoTotal, 0);
  const pagado = facturas.reduce((s, f) => s + f.pagadoCentavos, 0);
  const pendiente = Math.max(0, total - pagado);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">Facturas en Facturación</h2>
        <span className="text-xs text-gray-500">
          {facturas.length} {facturas.length === 1 ? 'factura' : 'facturas'} a su nombre, fuera del plan de cobro
        </span>
      </div>

      {/* Las mismas tres cifras que el resto de la ficha: facturado, cobrado y
          lo que falta. Antes solo salía el monto, y con un abono parcial no
          había forma de saber cuánto quedaba debiendo. */}
      {pendiente > 0 && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Debe <b>{fmtDOP(pendiente)}</b> de estas facturas. No sale del plan de cobro del colegio,
          así que no aparece en los totales del período.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Comprobante</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium">Monto</th>
              <th className="px-3 py-2 text-right font-medium">Pagado</th>
              <th className="px-3 py-2 text-right font-medium">Pendiente</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => {
              const saldo = Math.max(0, f.montoTotal - f.pagadoCentavos);
              const anulada = f.estado === 'ANULADO';
              return (
                <tr key={f.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{fmtFechaCorta(f.fecha)}</td>
                  {/* El e-NCF es lo que la familia tiene en la mano; sin él, el
                      código interno al menos permite encontrarla. */}
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    {f.encf || f.codigo || <span className="text-gray-400">Sin comprobante</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <EstadoFacturaBadge anulada={anulada} saldo={saldo} pagado={f.pagadoCentavos} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-800">{fmtDOP(f.montoTotal)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">
                    {f.pagadoCentavos > 0 ? fmtDOP(f.pagadoCentavos) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={saldo > 0 ? 'font-medium text-red-600' : 'font-medium text-zero-700'}>
                      {fmtDOP(saldo)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link href={`/dashboard/facturas/${f.id}`}
                      className="text-xs font-medium text-zero-600 hover:underline">
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
            {facturas.length > 1 && (
              <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
                <td className="px-3 py-2.5" colSpan={3}>Total</td>
                <td className="px-3 py-2.5 text-right">{fmtDOP(total)}</td>
                <td className="px-3 py-2.5 text-right">{fmtDOP(pagado)}</td>
                <td className="px-3 py-2.5 text-right text-red-600">{fmtDOP(pendiente)}</td>
                <td className="px-3 py-2.5" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Pagada / parcial / pendiente, con la misma estética que los demás estados. */
function EstadoFacturaBadge({ anulada, saldo, pagado }: {
  anulada: boolean; saldo: number; pagado: number;
}) {
  if (anulada) return <Badge variant="outline" className="text-gray-500">Anulada</Badge>;
  if (saldo === 0) {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Pagada</Badge>;
  }
  if (pagado > 0) {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Parcial</Badge>;
  }
  return <Badge className="border-red-200 bg-red-50 text-red-700">Pendiente</Badge>;
}

/**
 * Los recordatorios que se le mandaron a la familia de este alumno.
 *
 * Cada uno dice de QUÉ cobro hablaba: sin esa relación, «se le avisó tres
 * veces» no contesta la única pregunta que se hace en el mostrador, que es si
 * se le avisó de ESTA factura. Y el destino se guarda tal como estaba ese día
 * —el teléfono de hoy puede ser otro—, que es lo que lo convierte en
 * constancia y no en un recuerdo.
 */
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

/**
 * Los tres canales de aviso, en pequeño, junto al concepto.
 *
 * Encendido = por ahí ya le salió un recordatorio de ESTE cobro; apagado = no.
 * Es la respuesta de un vistazo a «¿a este ya se le avisó?», que hoy obligaba a
 * abrir la pestaña de Avisos y buscar la fila.
 *
 * Se enseñan los tres siempre, también los apagados: enseñar solo los enviados
 * haría que un cargo sin ningún aviso no tuviera nada, y «nada» se confunde con
 * «todavía no ha cargado».
 */
function AvisoSemaforo({ canales, titulo }: { canales?: Set<string>; titulo?: string }) {
  const salidos = canales ?? new Set<string>();
  return (
    <span className="inline-flex shrink-0 items-center gap-1"
      title={salidos.size > 0
        ? `Avisado por ${[...salidos].join(', ')}`
        : titulo ?? 'Todavía no se le ha avisado de este cobro'}>
      {(['correo', 'whatsapp', 'sms'] as const).map((c) => {
        const Icono = CANAL_META[c].icon;
        const on = salidos.has(c);
        const texto = on
          ? `${CANAL_META[c].label}: ya se le avisó por aquí`
          : `${CANAL_META[c].label}: todavía no ha salido`;
        return (
          <span key={c} title={texto} className="inline-flex">
            <Icono className={`h-3.5 w-3.5 ${on ? 'text-zero-600' : 'text-gray-300'}`}
              aria-label={texto} />
          </span>
        );
      })}
    </span>
  );
}

/** Cómo se llama cada aviso en cristiano. */
const AVISO_TEXTO: Record<string, string> = {
  'al-emitir': 'Factura nueva',
  'al-vencer': 'Venció hoy',
  'antes-mora': 'Antes del recargo',
  // Los del expediente: no son cobros.
  documentos: 'Enlace de documentos',
  formulario: 'Formulario',
};

const CANAL_META: Record<string, { label: string; icon: typeof Mail }> = {
  correo: { label: 'Correo', icon: Mail },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  sms: { label: 'SMS', icon: Smartphone },
};

function CanalChip({ canal }: { canal: string }) {
  const meta = CANAL_META[canal];
  if (!meta) return <span className="text-xs text-gray-500">{canal}</span>;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
      <meta.icon className="h-3 w-3" />{meta.label}
    </span>
  );
}

/**
 * Por qué canales se le puede escribir al responsable de pago.
 *
 * Encendido = ese dato existe; gris = falta, y pulsarlo abre su ficha para
 * ponerlo. En esta base 303 de 306 familias no tienen ni correo ni celular ni
 * WhatsApp: sin esto, el colegio da por hecho que los avisos salen y el fallo
 * solo aparece —dentro de otra pantalla— el día que el motor intenta mandar.
 */
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

function EmptyBox({ text }: { text: string }) {
  return <div className="text-center py-10 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">{text}</div>;
}

/**
 * Ficha extendida (los campos "estilo SIGERD"). Solo lista lo que esté lleno; si
 * el estudiante no tiene ninguno, no pinta nada (no ensucia el perfil).
 */
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
