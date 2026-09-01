'use client';

/**
 * La pantalla de un período: lo que se le cobra a un alumno en un año escolar.
 *
 * Vivía dentro de la ficha del estudiante. Salió de ahí porque la ficha de la
 * FAMILIA enseña lo mismo de cada hijo, y con dos copias las dos pantallas
 * acabarían diciendo cifras distintas del mismo mes en cuanto una cambiara —
 * que es exactamente lo que había pasado ya con «previsto».
 *
 * No sabe de qué pantalla lo llaman: recibe el grupo del período, el plan y
 * los permisos, y devuelve por callbacks todo lo que toca datos. Quien lo usa
 * decide qué hace al cobrar, al anular o al facturar.
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { NativeSelect } from '@/components/ui/native-select';
import { ModalHeader } from '@/components/ui/modal-header';

import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ArrowUpDown, Loader2, Receipt, Link2, Wallet, AlertTriangle, Pencil, CalendarDays, FileText, MoreVertical, Plus, Repeat, ChevronLeft, ChevronRight, Ban, Printer, Send, Mail, Info, MessageCircle, Smartphone } from 'lucide-react';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

import { useTabUrl, useUrlParams } from '@/lib/hooks/useUrlEstado';
import { previstosDelPlan } from '@/lib/administracion-escolar/previstos';

import { DetalleCuotaDialog, type CobroDelColegio, type CuotaDetallada, type ReglasCuota } from '@/components/administracion-escolar/DetalleCuotaDialog';
import { FacturaDrawer } from '@/components/administracion-escolar/FacturaDrawer';
import type { EmpresaPerfil } from '@/lib/facturas/empresa-perfil';

import { CrearCargoEstudianteDialog } from '@/components/administracion-escolar/CrearCargoEstudianteDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { mesesDelPeriodo } from '@/lib/administracion-escolar/periodo-utils';
import { toast } from 'sonner';

/**
 * Un cargo se puede meter en una factura nueva.
 *
 * Las tres condiciones son las mismas que exige el prefill, y se comprueban
 * aquí para no ofrecer una casilla que después devuelve 409: sin factura
 * previa —volver a facturarlo le cobraría dos veces a la familia—, con saldo
 * vivo y en un estado cobrable.
 */
const ESTADOS_COBRABLES = ['pendiente', 'parcial', 'vencido'];
export function cargoMarcable(c: { ecfDocumentId: number | null; saldoCentavos: number; estado: string }) {
  return c.ecfDocumentId == null && c.saldoCentavos > 0 && ESTADOS_COBRABLES.includes(c.estado);
}

/** El plan de cobro de cada matrícula, tal como lo devuelve la ficha. */
export type PlanesPorMatricula = Record<number, { lineas: PlanLinea[]; devenga: boolean }>;

export interface Matricula {
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
export interface Cargo {
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
export interface Pago {
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
export interface PlanLinea {
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

export const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Toda la ficha en una respuesta: ver /api/.../estudiantes/[id]/ficha. */
interface LineaFacturaSuelta { nombre: string; cantidad: number; importeCentavos: number; }

export interface AvisoProgramado {
  cargoId: number;
  concepto: string | null;
  fecha: string;
  tipo: string;
  canales: string[];
  montoCentavos: number;
}

export interface AvisoEnviado {
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

export interface PagoSuelto {
  id: number;
  ecfDocumentId: number;
  encf: string | null;
  codigo: string | null;
  montoCentavos: number;
  fechaPago: string;
  metodo: string | null;
  referencia: string | null;
}

export interface FacturaSuelta {
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
const VISTAS = ['mensualidades', 'otros', 'facturas', 'pagos'] as const;

// ─── Página ────────────────────────────────────────────────────────────────

// Detalle financiero de UN período (el seleccionado en la barra padre):
// acciones, resumen y sub-vistas (mensualidades, otros cargos, facturas, pagos).
export function PeriodoDetalle({ grupo, planes, cobro, facturasSueltas, pagosSueltos, avisos, pagos, puedeFacturar, puedePagos, puedeGestionar, estudianteId, tutorClientId, perfilEmpresa, onRegistrarPago, onAplicarMora, aplicandoMoraFacturaId, onCargoCreado, onEditarMatricula, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onEnviarFactura, onReenviarAviso, reenviandoCargoId }: {
  grupo: NonNullable<ReturnType<typeof construirGruposPeriodo>[number]>;
  planes: PlanesPorMatricula | undefined;
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
  /** Datos del emisor, resueltos en el servidor por la página. Los usa el cajón. */
  perfilEmpresa: EmpresaPerfil | null;
  onRegistrarPago: (ecfDocumentId: number) => void;
  onAplicarMora: (ecfDocumentId: number) => void;
  aplicandoMoraFacturaId: number | null;
  onReenviarAviso: (cargoId: number) => void;
  reenviandoCargoId: number | null;
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
  /** Crear el mismo concepto en varios meses de una vez. */
  const [crearVariosAbierto, setCrearVariosAbierto] = useState(false);
  /**
   * Los cargos marcados para facturar juntos.
   *
   * Antes esto era un diálogo aparte: un botón abría una lista con los cargos
   * repetidos y ahí se marcaban. Eran los MISMOS cargos que ya estaban en la
   * tabla de detrás, escritos otra vez con otro formato y sin su estado ni su
   * vencimiento — y para saber cuál era cuál había que cerrarlo y volver a
   * mirar. Ahora se marcan donde se leen.
   */
  const [marcados, setMarcados] = useState<Set<number>>(new Set());

  function alternarCargo(id: number) {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** Marca o desmarca de golpe los cargos facturables de un mes. */
  function alternarVarios(ids: number[]) {
    if (ids.length === 0) return;
    setMarcados((prev) => {
      const next = new Set(prev);
      const todosPuestos = ids.every((id) => next.has(id));
      for (const id of ids) { if (todosPuestos) next.delete(id); else next.add(id); }
      return next;
    });
  }
  /**
   * Facturar ya no es un modal: es el mismo cajón de la ficha de la familia.
   *
   * Aquí había un diálogo propio —con su selector de comprobante, su lista de
   * conceptos y su «Avanzado» que se iba a /dashboard/facturas/nueva— y detrás
   * un segundo modal con el resumen de lo que había salido. Dos pantallas
   * distintas para lo mismo, con otras reglas: aquel dejaba elegir e31/e32
   * —el colegio factura sin NCF— y no ataba los cargos a la factura por el
   * mismo camino. Ahora el alumno y la familia facturan por el mismo sitio.
   *
   * Y vive en la URL, no en un `useState`: recargar no lo cierra y el enlace
   * se puede mandar.
   *
   *   ?factura=c:12,13     → esos cargos
   *   ?factura=p:2811.44.3 → un mes por adelantado (matrícula.cuota.concepto)
   */
  const { params: qs, setParams } = useUrlParams();
  const enCurso = qs.get('factura');

  const cajon = useMemo(() => {
    if (!enCurso) return null;
    if (enCurso.startsWith('c:')) {
      const ids = enCurso.slice(2).split(',')
        .map(Number).filter((n) => Number.isInteger(n) && n > 0);
      return ids.length ? { cargos: ids, previsto: null } : null;
    }
    if (enCurso.startsWith('p:')) {
      const [m, c, k] = enCurso.slice(2).split('.').map(Number);
      return [m, c, k].every((n) => Number.isInteger(n) && n > 0)
        ? { cargos: null, previsto: { matriculaId: m, cuotaId: c, conceptoId: k } }
        : null;
    }
    return null;
  }, [enCurso]);

  const facturarCargos = (ids: number[]) => {
    if (ids.length) setParams({ factura: `c:${ids.join(',')}` });
  };

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
      // Ya no se crea el cargo aquí. La cuota entra en el cajón como una línea
      // más y se convierte en deuda al confirmar la factura: sin factura no
      // debe haber deuda.
      setParams({ factura: `p:${matriculaId}.${p.cuotaId}.${p.conceptoId}` });
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
  // El saldo, partido en lo que ya se puede cobrar y lo que falta por emitir. El
  // rojo de «Pendiente» es de lo primero: una factura emitida con el saldo
  // abierto. Lo segundo se debe, pero lo que toca con ello es facturarlo, no
  // cobrarlo, y pintarlo en rojo lo confundía con una cuota vencida.
  const saldoPorCobrar = cargosPeriodo
    .filter((c) => c.ecfDocumentId != null && ['pendiente', 'parcial', 'vencido'].includes(c.estado))
    .reduce((s, c) => s + c.saldoCentavos, 0);
  const saldoPorFacturar = Math.max(0, saldo - saldoPorCobrar);
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
   * Lo marcado que TODAVÍA se puede facturar, y su total.
   *
   * Se cruza contra los cargos frescos en vez de fiarse de la marca: al crear
   * la factura esos cargos dejan de ser facturables y la marca se cae sola. Sin
   * esto, la barra seguiría diciendo «3 cargos · RD$2,200» encima de tres
   * cargos ya facturados, y volver a pulsar los facturaría otra vez.
   *
   * Mira TODOS los cargos del período, no solo los de la sub-vista: cambiar de
   * pestaña es un filtro de lectura, y esconder de la barra lo que se marcó en
   * la otra haría emitir una factura con líneas que no se ven por ninguna parte.
   */
  const marcadosVivos = cargosPeriodo.filter((c) => marcados.has(c.id) && cargoMarcable(c));
  const resumenMarcados = {
    ids: marcadosVivos.map((c) => c.id),
    total: marcadosVivos.reduce((acc, c) => acc + c.saldoCentavos, 0),
  };

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
          {/*
            Facturar varios ya no es un botón: son las casillas de la tabla.

            Aquí había un «Facturar varios meses» que abría un diálogo con los
            mismos cargos otra vez —sin su estado, sin su vencimiento, sin la
            factura que ya tuvieran— para marcarlos allí. Marcar y leer estaban
            en dos pantallas distintas. Lo que queda de aquel diálogo es lo
            único que no se podía hacer desde la tabla: crear el mismo concepto
            en varios meses de golpe.
          */}
          {puedeGestionar && grupo.matriculaId != null && (
            <Button size="sm" variant="outline" onClick={() => setCrearVariosAbierto(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Agregar cargo a varios meses
            </Button>
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
        <PeriodoStat
          icon={AlertTriangle}
          label="Pendiente"
          value={fmtDOP(saldo)}
          // Rojo solo si hay algo emitido sin cobrar. Si todo lo que se debe
          // está aún «Sin facturar», la tarjeta no alarma: lo que toca es
          // emitir, no perseguir un pago. Ver criterio del MD de facturas.
          detail={
            saldoPorCobrar > 0 && saldoPorFacturar > 0
              ? `Por cobrar ${fmtDOP(saldoPorCobrar)} · por facturar ${fmtDOP(saldoPorFacturar)}`
              : saldoPorCobrar > 0 ? 'Saldo por cobrar'
              : saldoPorFacturar > 0 ? 'Aún por facturar'
              : 'Sin deuda'
          }
          tone={saldoPorCobrar > 0 ? 'red' : 'gray'}
        />
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
                onReenviarAviso={onReenviarAviso}
                reenviandoCargoId={reenviandoCargoId}
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
                onCrearFactura={(cargo) => facturarCargos([cargo.id])}
                onVincular={onVincular}
                onAnular={onAnular}
                onAnularFactura={onAnularFactura}
                onEnviarCorreo={onEnviarCorreo}
                onAgregarCargoMes={grupo.matriculaId ? (mes, anio) => { setCargoMesInicial({ mes, anio }); setCrearCargoAbierto(true); } : undefined}
                onPrevisto={puedeGestionar ? aplicarPrevisto : undefined}
                onDetalle={setCuotaDetalle}
                aplicandoMoraFacturaId={aplicandoMoraFacturaId}
                marcados={marcados}
                onMarcarCargo={alternarCargo}
                onMarcarVarios={alternarVarios}
              />
            )}

            {vista === 'otros' && (
              otrosCargos.length === 0 && previstosOtros.length === 0 && facturasSueltas.length === 0
                ? <EmptyBox text="Sin otros cargos" /> : (
                <OtrosCargosTabla
                onReenviarAviso={onReenviarAviso}
                reenviandoCargoId={reenviandoCargoId}
                  cargos={otrosCargos}
                  previstos={previstosOtros}
                  puedePagos={puedePagos}
                  puedeFacturar={puedeFacturar}
                  puedeGestionar={puedeGestionar}
                  onRegistrarPago={onRegistrarPago}
                  onAplicarMora={onAplicarMora}
                  onCrearFactura={(cargo) => facturarCargos([cargo.id])}
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
                  marcados={marcados}
                  onMarcarCargo={alternarCargo}
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
          if (cargoId) facturarCargos([cargoId]);
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
      <CrearCargoVariosMesesDialog
        open={crearVariosAbierto}
        onOpenChange={setCrearVariosAbierto}
        estudianteId={estudianteId}
        matriculaId={grupo.matriculaId}
        periodoId={grupo.periodoId}
        mesesAcademicos={mesesAcademicos}
        soloTipo={vista === 'otros' ? 'otros' : vista === 'mensualidades' ? 'mensualidad' : null}
        onCargoCreado={onCargoCreado}
      />

      {/*
        La barra de lo marcado. Igual que en la ficha de la familia.

        Aparece solo cuando hay algo marcado y va pegada abajo: la tabla de un
        año escolar no cabe en la pantalla, y un botón al final de la lista
        obliga a bajar hasta el último mes para pulsar lo que se decidió arriba.
      */}
      {puedeFacturar && resumenMarcados.ids.length > 0 && (
        <div className="sticky bottom-0 z-20 -mx-1 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-zero-200 bg-white/95 px-3.5 py-2.5 shadow-[0_-4px_12px_-6px_rgba(15,17,24,.18)] backdrop-blur">
          <span className="flex items-center gap-1.5 text-sm text-gray-700">
            <FileText className="h-4 w-4 text-zero-600" />
            <b className="font-semibold text-gray-900">
              {resumenMarcados.ids.length} {resumenMarcados.ids.length === 1 ? 'cargo' : 'cargos'}
            </b>
            <span className="text-gray-300">·</span>
            <b className="font-semibold text-gray-900">{fmtDOP(resumenMarcados.total)}</b>
          </span>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>
            Quitar marcas
          </Button>
          <Button size="sm" className="bg-zero-600 hover:bg-zero-700"
            onClick={() => { facturarCargos(resumenMarcados.ids); setMarcados(new Set()); }}>
            <Receipt className="mr-1.5 h-4 w-4" />
            {resumenMarcados.ids.length === 1 ? 'Facturar' : 'Facturar juntos'}
          </Button>
        </div>
      )}

      {/*
        Facturar: el mismo cajón que la ficha de la familia, con los mismos
        tres pasos —factura, pago y envío, comprobante— y las mismas reglas.

        Detrás de esto había DOS modales: uno para armar la factura y otro,
        después, con el resumen de lo que había salido y un botón «Realizar
        pago» que abría un tercero. El cobro ahora se registra dentro del
        propio cajón, en el paso 2, y el paso 3 ya ES el comprobante.
      */}
      <FacturaDrawer
        abierto={cajon != null}
        onCerrar={() => {
          setParams({ factura: null });
          // La ficha entera: los cargos pasan a tener factura, el saldo cambia
          // y el plan pierde el mes que se acaba de adelantar.
          onCargoCreado();
        }}
        perfilEmpresa={perfilEmpresa}
        cargosIniciales={cajon?.cargos ?? []}
        previsto={cajon?.previsto ?? null}
      />

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
// Selector de cargos a facturar en UNA sola factura (factura mayor). Se marca
// uno o varios meses/cargos y se crea una única factura que los cubre (un mes
// por línea). Luego esa factura se cobra normal: los abonos se acumulan en su
// historial hasta saldarla. Resuelve "pagar varios meses de golpe".
//
// Extra: permite crear un cargo nuevo aplicándolo a varios meses de una vez
// (concepto + monto + meses). Al crearlos, se refrescan y entran a la lista ya
// marcados, listos para incluirlos en la misma factura.
/**
 * Crear el MISMO concepto en varios meses de una vez.
 *
 * Es lo que queda del antiguo «Facturar varios meses». Aquel diálogo hacía dos
 * cosas: elegir cargos para facturarlos —que ahora se hace marcándolos en la
 * tabla, donde se leen— y esto, que no tiene sitio en una tabla porque crea
 * filas que todavía no existen: el uniforme de septiembre a diciembre, la
 * mensualidad de un alumno que entró a mitad de año.
 */
function CrearCargoVariosMesesDialog({ open, onOpenChange, estudianteId, matriculaId, periodoId, mesesAcademicos, soloTipo, onCargoCreado }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estudianteId: number;
  matriculaId: number | null;
  periodoId: number | null;
  mesesAcademicos: ReturnType<typeof mesesDelPeriodo>;
  soloTipo: 'mensualidad' | 'otros' | null;
  onCargoCreado: () => void;
}) {
  const [conceptos, setConceptos] = useState<{ id: number; nombre: string; tipo: string }[]>([]);
  const [conceptoId, setConceptoId] = useState('');
  const [monto, setMonto] = useState('');
  const [mesesCargo, setMesesCargo] = useState<Set<string>>(new Set());
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setErrorCrear(null); setMonto(''); setMesesCargo(new Set()); setConceptoId(''); return; }
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

  const montoCentavos = Math.round((parseFloat(monto.replace(',', '.')) || 0) * 100);

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
      onOpenChange(false);
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
        <ModalHeader title="Agregar cargo a varios meses"
          subtitle="El mismo concepto y el mismo monto, repetido en los meses que elijas." />
        <div className="space-y-3 px-6 pb-2">
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
          <p className="text-xs text-gray-500">
            {mesesCargo.size > 0 && montoCentavos > 0
              ? `${mesesCargo.size} ${mesesCargo.size === 1 ? 'cargo' : 'cargos'} · ${fmtDOP(montoCentavos * mesesCargo.size)} en total`
              : 'Elige concepto, monto y meses'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creando}>Cancelar</Button>
          <Button className="bg-zero-600 hover:bg-zero-700" onClick={crearCargos} disabled={creando}>
            {creando ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Creando…</> : 'Crear cargos'}
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
function MensualidadesTabla({ diaFacturaAuto, cargos, previstos, pagos, mesesAcademicos, enviadosPorCargo, puedePagos, puedeFacturar, puedeGestionar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onAgregarCargoMes, onPrevisto, onDetalle, aplicandoMoraFacturaId, onReenviarAviso, reenviandoCargoId, marcados, onMarcarCargo, onMarcarVarios }: {
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
  /** Cargos marcados para la próxima factura. */
  marcados: Set<number>;
  onMarcarCargo: (id: number) => void;
  /** Marca o desmarca de golpe los cargos facturables de un mes. */
  onMarcarVarios: (ids: number[]) => void;
  onPrevisto?: (p: Previsto, accion: 'adelantar' | 'omitir') => void;
  /** Abre el detalle de la cuota: fechas, recargo y avisos. */
  onDetalle?: (p: Previsto) => void;
  /** Canales por los que ya salió el aviso de cada cargo. */
  enviadosPorCargo?: Map<number, Set<string>>;
  aplicandoMoraFacturaId: number | null;
  onReenviarAviso: (cargoId: number) => void;
  reenviandoCargoId: number | null;
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
                onReenviarAviso={onReenviarAviso}
                reenviandoCargoId={reenviandoCargoId}
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
                  marcados={marcados}
                  onMarcarCargo={onMarcarCargo}
                  onMarcarVarios={onMarcarVarios}
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
function OtrosCargosTabla({ cargos, previstos, facturasSueltas = [], onEnviarFactura, enviadosPorCargo, puedePagos, puedeFacturar, puedeGestionar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onPrevisto, onDetalle, aplicandoMoraFacturaId, onReenviarAviso, reenviandoCargoId, marcados, onMarcarCargo }: {
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
  onReenviarAviso: (cargoId: number) => void;
  reenviandoCargoId: number | null;
  marcados: Set<number>;
  onMarcarCargo: (id: number) => void;
}) {
  const router = useRouter();
  const totalPrevisto = previstos.reduce((s, p) => s + p.montoCentavos, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500">
            {/* Sin título: una columna de casillas no se explica con una
                palabra, y «Facturar» encima invitaba a leerla como un botón. */}
            {puedeFacturar && <th className="w-9 px-3 py-2" />}
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
                {/* La columna de las casillas. Vacía aquí: no es un cargo
                    que se pueda meter en una factura nueva. */}
                {puedeFacturar && <td className="px-3 py-2.5" />}
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
                {/* Las mismas acciones que cualquier otra fila. Antes solo
                    tenía el sobre: desde aquí no se podía ni ver la factura ni
                    su PDF, y esta es la única tabla donde aparecen las facturas
                    del alumno que no salen de un cargo. */}
                <td className="px-3 py-2.5 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button"
                        aria-label={`Acciones de ${f.encf || f.codigo || 'la factura'}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 data-[state=open]:bg-gray-100">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => router.push(`/dashboard/facturas/${f.id}`)}>
                        <FileText className="h-4 w-4" />Ver factura
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`/api/pdf/factura/${f.codigo ?? f.id}`} target="_blank" rel="noreferrer"
                          className="flex cursor-pointer items-center gap-2">
                          <Printer className="h-4 w-4" />Ver PDF
                        </a>
                      </DropdownMenuItem>
                      {onEnviarFactura && (
                        <DropdownMenuItem
                          onSelect={() => onEnviarFactura(f.id, `${f.encf || f.codigo || 'la factura'}`)}>
                          <Mail className="h-4 w-4" />Enviar por correo
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            )];

            // Los conceptos, sangrados. Sin pagado ni pendiente propios: ese
            // dato no existe por línea, y ponerle uno sería inventarlo.
            for (const [i, l] of f.lineas.entries()) {
              filas.push(
                <tr key={`fs-${f.id}-l${i}`} className="border-t border-gray-50 bg-gray-50/30">
                  {puedeFacturar && <td className="px-3 py-2" />}
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
              <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50/60 ${marcados.has(c.id) ? 'bg-zero-50/60' : ''}`}>
                {puedeFacturar && (
                  <td className="px-3 py-2.5">
                    {cargoMarcable(c) && (
                      <CasillaCargo
                        marcado={marcados.has(c.id)}
                        onMarcar={() => onMarcarCargo(c.id)}
                        etiqueta={`Facturar ${c.concepto ?? 'este cargo'}`}
                      />
                    )}
                  </td>
                )}
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
                    <span className={clsSaldo(c.saldoCentavos, c.ecfDocumentId != null)}>
                      {fmtDOP(c.saldoCentavos)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    {/* Enlace de pago de la factura, visible: se copia y se manda
                        al padre sin tener que abrir el detalle de la factura. */}
                    {c.ecfDocumentId != null && ['pendiente', 'parcial', 'vencido'].includes(c.estado) && (
                      <BotonLinkPagoFactura facturaId={c.ecfDocumentId} />
                    )}
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
                      onReenviarAviso={onReenviarAviso}
                      reenviando={reenviandoCargoId === c.id}
                      aplicandoMora={aplicandoMoraFacturaId === c.ecfDocumentId}
                    />
                  </span>
                </td>
              </tr>
            );
          })}

          {previstos.map((p) => (
            <tr key={`p-${p.key}`} className="border-t border-dashed border-gray-200 bg-gray-50/30 hover:bg-gray-50/60">
              {/* Un previsto todavía no es deuda: no hay cargo que marcar. */}
              {puedeFacturar && <td className="px-3 py-2.5" />}
              <td className="px-3 py-2.5 text-gray-500">{p.concepto}</td>
              {/* Faltaba: la fila tenía siete celdas contra las ocho de la
                  cabecera, así que el vencimiento caía bajo «Avisos» y todo lo
                  demás iba corrido una columna hasta el final. */}
              <td className="px-3 py-2.5">
                <AvisoSemaforo titulo="Todavía no es deuda: el aviso sale cuando se genere la factura" />
              </td>
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

/**
 * La casilla para meter un cargo en la próxima factura.
 *
 * Va DENTRO de la primera celda y no en una columna nueva: las columnas de
 * esta tabla tienen anchos fijos —la del mes desplegado es otra tabla dentro de
 * una celda de ésta, y sin anchos declarados se descuadran— así que añadir una
 * décima obligaba a recalcular los nueve porcentajes en dos sitios.
 *
 * `stopPropagation` porque la fila del mes es clicable para desplegarse:
 * marcar un cargo abría el mes de paso.
 */
function CasillaCargo({ marcado, onMarcar, etiqueta }: {
  marcado: boolean;
  onMarcar: () => void;
  etiqueta: string;
}) {
  return (
    <input
      type="checkbox"
      checked={marcado}
      aria-label={etiqueta}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); onMarcar(); }}
      className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-gray-300 text-zero-600 focus:ring-zero-500"
    />
  );
}

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
function MesFila({ r, diaFacturaAuto, abierto, onToggle, enviadosPorCargo, puedePagos, puedeFacturar, puedeGestionar, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onPrevisto, onDetalle, aplicandoMoraFacturaId, onReenviarAviso, reenviandoCargoId, marcados, onMarcarCargo, onMarcarVarios }: {
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
  onReenviarAviso: (cargoId: number) => void;
  reenviandoCargoId: number | null;
  marcados: Set<number>;
  onMarcarCargo: (id: number) => void;
  onMarcarVarios: (ids: number[]) => void;
}) {
  /**
   * Los cargos de ESTE mes que se pueden facturar.
   *
   * La casilla de la fila del mes los coge todos a la vez: un mes con
   * mensualidad, uniforme y material son tres cargos, y marcarlos uno por uno
   * al desplegar es justo lo que el diálogo de antes ya obligaba a hacer.
   */
  const facturablesDelMes = r.cargosMes.filter(cargoMarcable).map((c) => c.id);
  const mesMarcado = facturablesDelMes.length > 0 && facturablesDelMes.every((id) => marcados.has(id));

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
            {puedeFacturar && (
              facturablesDelMes.length > 0
                ? <CasillaCargo
                    marcado={mesMarcado}
                    onMarcar={() => onMarcarVarios(facturablesDelMes)}
                    etiqueta={`Facturar ${MESES[r.mes]} ${r.anio}`}
                  />
                : <span className="h-3.5 w-3.5 shrink-0" />
            )}
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
            <span className={clsSaldo(r.saldo, !!r.factura)}>
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
              onReenviarAviso={onReenviarAviso}
              reenviando={reenviandoCargoId === accion.id}
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
          <tr key={`c-${c.id}`} className={`border-t border-gray-100 hover:bg-gray-50/60 ${marcados.has(c.id) ? 'bg-zero-50/60' : ''}`}>
            <td className="px-3 py-3 text-right">
              {puedeFacturar && cargoMarcable(c) && (
                <CasillaCargo
                  marcado={marcados.has(c.id)}
                  onMarcar={() => onMarcarCargo(c.id)}
                  etiqueta={`Facturar ${c.concepto ?? 'este cargo'} de ${MESES[r.mes]} ${r.anio}`}
                />
              )}
            </td>
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
                <span className={clsSaldo(c.saldoCentavos, c.ecfDocumentId != null)}>
                  {fmtDOP(c.saldoCentavos)}
                </span>
              )}
            </td>
            <td className="px-3 py-3 text-right">
              <span className="inline-flex items-center justify-end gap-2">
                {/* Enlace de pago de la factura, visible: se copia y se manda al
                    padre sin abrir el detalle de la factura. */}
                {c.ecfDocumentId != null && ['pendiente', 'parcial', 'vencido'].includes(c.estado) && (
                  <BotonLinkPagoFactura facturaId={c.ecfDocumentId} />
                )}
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
                  onReenviarAviso={onReenviarAviso}
                  reenviando={reenviandoCargoId === c.id}
                  aplicandoMora={aplicandoMoraFacturaId === c.ecfDocumentId}
                />
              </span>
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

function CargoActionsMenu({ cargo, puedePagos, puedeFacturar, puedeGestionar, mesTieneFactura, onRegistrarPago, onAplicarMora, onCrearFactura, onVincular, onAnular, onAnularFactura, onEnviarCorreo, onReenviarAviso, aplicandoMora, reenviando }: {
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
  /** Reenvía el aviso por WhatsApp. Solo tiene sentido con factura emitida. */
  onReenviarAviso: (cargoId: number) => void;
  aplicandoMora: boolean;
  reenviando: boolean;
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
        {/* Solo con factura: el aviso lleva el enlace de pago, y sin factura
            ese enlace lleva a una página donde el padre transfiere para que
            nadie pueda aplicarlo. */}
        {pendiente && tieneFactura && puedeGestionar && (
          <DropdownMenuItem disabled={reenviando} onSelect={() => onReenviarAviso(cargo.id)}>
            <MessageCircle className="h-4 w-4" />
            {reenviando ? 'Enviando…' : 'Reenviar por WhatsApp'}
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

export function construirGruposPeriodo(matriculas: Matricula[], cargos: Cargo[]) {
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
        <div className="flex justify-between gap-2"><span>Saldo</span><span className={clsSaldo(saldo, factura != null)}>{fmtDOP(saldo)}</span></div>
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
/**
 * El estado de UN cargo, no el del mes entero.
 *
 * Va aparte de `EstadoMesBadge` porque los valores no son los mismos: un mes
 * puede estar "adelantado" o "sin cargo", que son conclusiones sacadas de mirar
 * varios cargos a la vez, y un cargo suelto puede estar "anulado", que a nivel
 * de mes no significa nada.
 */
/**
 * Color del saldo pendiente de un cargo o mes.
 *
 * Rojo = deuda por cobrar: hay una factura emitida y su saldo sigue abierto. Un
 * cargo aún SIN factura se debe, pero lo que toca con él es emitirlo, no
 * cobrarlo — se pinta neutro para no confundirlo con una cuota vencida, que es
 * lo que el rojo significa en el resto de la pantalla.
 */
function clsSaldo(saldo: number, tieneFactura: boolean): string {
  if (saldo <= 0) return 'font-medium text-zero-700';
  return tieneFactura ? 'font-medium text-red-600' : 'font-medium text-gray-700';
}

function EstadoCargoBadge({ estado, sinFactura }: { estado: string; sinFactura?: boolean }) {
  if (estado === 'anulado') return <Badge variant="outline" className="text-gray-400">Anulado</Badge>;
  if (estado === 'pagado')  return <Badge className="bg-zero-50 text-zero-700 border-zero-200">Pagado</Badge>;
  // El cargo nace al matricular, no al facturar: la inscripción y el uniforme se
  // deben desde el primer día, mucho antes de que salga ningún comprobante.
  // «Sin facturar» gana a «Vencido»: sin factura emitida no hay documento que
  // pueda estar vencido ni saldo que cobrar todavía, aunque su fecha de
  // vencimiento ya haya pasado. El rojo/«Vencido» es de una factura emitida con
  // saldo abierto. Sigue contando como deuda; lo único que cambia es que lo dice
  // en vez de pintarlo en rojo.
  if (sinFactura) return <Badge variant="outline" className="border-gray-300 text-gray-600">Sin facturar</Badge>;
  if (estado === 'vencido') return <Badge className="bg-red-50 text-red-600 border-red-200">Vencido</Badge>;
  if (estado === 'parcial') return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Parcial</Badge>;
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

/**
 * Copia el enlace de pago DE ESA factura (no el agregado de la familia).
 *
 * El enlace ya existía escondido en el menú de tres puntos del detalle de la
 * factura, y llegar hasta ahí desde la ficha era un rodeo. Aquí queda a un clic,
 * junto a la factura. Abre el cobro de esa factura y su importe, no la suma de
 * todo lo que debe el responsable (`?f=` acota la página pública).
 */
function BotonLinkPagoFactura({ facturaId }: { facturaId: number }) {
  const [cargando, setCargando] = useState(false);
  async function copiar() {
    if (cargando) return;
    setCargando(true);
    try {
      const r = await fetch(`/api/administracion-escolar/link-pago?facturaId=${facturaId}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? 'No se pudo obtener el enlace'); return; }
      await navigator.clipboard.writeText(d.url);
      toast.success(`Enlace de pago copiado · referencia ${d.referencia}`);
    } catch {
      toast.error('No se pudo copiar el enlace');
    } finally {
      setCargando(false);
    }
  }
  return (
    <button type="button" onClick={copiar} disabled={cargando}
      title="Copiar el enlace de pago de esta factura"
      className="inline-flex items-center gap-1 text-xs text-zero-600 hover:text-zero-700 font-medium transition-colors disabled:opacity-50">
      {cargando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
      Link de pago
    </button>
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

// Chip compacto clave·valor para la tarjeta horizontal del estudiante.
/**
 * Facturas del alumno que no salieron de ningún cargo escolar.
 *
 * En Facturación la factura ya lleva al alumno como beneficiario, así que un
 * colegio que cobraba antes de tener el módulo tiene años de facturas suyas
 * que la ficha no enseñaba. Se listan aparte y no suman en los totales del
 * período: no son deuda del plan de cobro y cuadrarían mal.
 */
export function FacturasSueltas({ facturas }: { facturas: FacturaSuelta[] }) {
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
/** Cómo se llama cada aviso en cristiano. */
export const AVISO_TEXTO: Record<string, string> = {
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

export function CanalChip({ canal }: { canal: string }) {
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
export function EmptyBox({ text }: { text: string }) {
  return <div className="text-center py-10 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">{text}</div>;
}

/**
 * Ficha extendida (los campos "estilo SIGERD"). Solo lista lo que esté lleno; si
 * el estudiante no tiene ninguno, no pinta nada (no ensucia el perfil).
 */
export function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
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

