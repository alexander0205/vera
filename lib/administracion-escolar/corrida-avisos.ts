/**
 * La corrida de facturación del colegio, vista desde fuera: qué va a salir, qué
 * salió y qué hay que mirar.
 *
 * El colegio no ve la corrida: a las 3:00 a. m. el cron devenga y factura, y a
 * la mañana siguiente lo único que ve es el resultado —o su ausencia—. Esto es
 * lo que alimenta los tres correos que se lo cuentan a quien administra:
 *
 *   · `aviso-5`   cinco días antes de la emisión, con el SIMULACRO de lo que saldrá
 *   · `aviso-2`   dos días antes, lo mismo en corto
 *   · `resultado` el día de la emisión, ya pasada la corrida de las 3:00 a. m.
 *
 * Todo aquí es PURO: no toca la base ni el reloj. El simulacro recibe los datos
 * ya cargados (`ContextoColegio`) y repite las mismas reglas que el devengo y la
 * facturación automática, que viven en `devengar.ts`, `plan-cobro.ts`,
 * `tarifas.ts` y `facturar-emision.ts`. No inventa precios: usa
 * `resolverTarifasEnMemoria` y `montosPorCuota`, que son las que cobran.
 *
 * Lo que se promete en el correo tiene que ser lo que hace la corrida. Si una
 * regla cambia allá y no aquí, el correo miente, así que cada paso de abajo dice
 * de dónde lo copia.
 *
 * Pruebas en `tests/unit/escolar-corrida-avisos.test.ts`.
 */

import { sumarDias } from './calendario';
import { cargosQueFacturaElCalendario } from './facturar-emision';
import { cuotasDeLaTarifa, montosPorCuota } from './repartir';
import {
  resolverTarifasEnMemoria,
  type PrecioConfigurado,
  type TarifaResuelta,
} from './tarifas';

// ─── Qué avisos hay y para qué día ───────────────────────────────────────────

/** La acción con la que `audit_logs` recuerda qué aviso ya salió. */
export const ACCION_AVISO_CORRIDA = 'ESCOLAR_AVISO_CORRIDA';

export const TIPOS_AVISO = ['aviso-5', 'aviso-2', 'resultado'] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

/** Cuántos días ANTES de la emisión sale cada aviso. El resultado sale el mismo día. */
export const DIAS_DE_ANTELACION: Record<TipoAviso, number> = {
  'aviso-5': 5,
  'aviso-2': 2,
  resultado: 0,
};

export interface ObjetivoAviso {
  tipo: TipoAviso;
  /** La fecha de emisión de las cuotas de las que habla este aviso. */
  fecha: string;
}

/**
 * Las fechas de emisión que miran los tres avisos de HOY.
 *
 * `hoy` es la fecha calendario de la República Dominicana (`hoyRD()`), no la
 * UTC: a las 8:00 a. m. RD el cron corre a las 12:00 UTC y los dos días
 * coinciden, pero si algún día se mueve a la noche la UTC ya habría saltado al
 * día siguiente y cada aviso saldría un día corrido.
 */
export function objetivosDeAviso(hoy: string): ObjetivoAviso[] {
  return TIPOS_AVISO.map((tipo) => ({ tipo, fecha: sumarDias(hoy, DIAS_DE_ANTELACION[tipo]) }));
}

/**
 * La llave de idempotencia de un aviso: va en `audit_logs.resource`.
 *
 * Lleva el tipo Y la fecha de emisión, no la fecha de envío: el mismo aviso de
 * 5 días de la emisión del 30 es siempre `aviso-5:2026-10-30`, se mande el 25 o
 * se reintente a mano el 26.
 */
export function claveAviso(tipo: TipoAviso, fecha: string): string {
  return `${tipo}:${fecha}`;
}

/** El primer instante del día `fecha` en la República Dominicana (UTC-4, sin horario de verano), en UTC. */
export function inicioDiaRD(fecha: string): Date {
  return new Date(`${fecha}T04:00:00.000Z`);
}

// ─── Automática o manual ─────────────────────────────────────────────────────

export type ModoCorrida = 'automatico' | 'manual';

/**
 * ¿Esa emisión la factura Zero sola, o le toca al colegio?
 *
 * Es la misma condición con la que el cron decide: la facturación automática
 * trabaja de su línea de corte (`escolar_facturacion_automatica_desde`) en
 * adelante. Una emisión anterior a esa fecha no la factura nadie solo, aunque
 * hoy el colegio ya la tenga encendida.
 */
export function modoDeCorrida(facturarDesde: string | null | undefined, fecha: string): ModoCorrida {
  return facturarDesde && facturarDesde <= fecha ? 'automatico' : 'manual';
}

// ─── Lo que hace falta cargar para simular ───────────────────────────────────

export interface MatriculaCorrida {
  id: number;
  estudianteId: number;
  cursoId: number;
  gradoId: number;
  servicioId: number;
  /** 'activa' | 'finalizada' | 'retirada' | 'anulada'. Solo las activas devengan. */
  estado: string;
  fechaInscripcion: string | null;
  becaTipo: string | null;
  becaValor: number | null;
  conceptosIds: number[];
  conceptoMensualidadId: number | null;
  /**
   * Su plan recurrente de la mensualidad sigue ACTIVO. Con una sola matrícula
   * así basta para que el calendario le ceda la colegiatura al plan; uno
   * finalizado o pausado no factura nada y no cuenta (ver
   * `cargosQueFacturaElCalendario`).
   */
  conPlanActivo: boolean;
  /** `facturar_a_client_id` del alumno: quien paga. Null = nadie a quien facturarle. */
  clienteId: number | null;
}

export interface ConceptoCorrida {
  id: number;
  nombre: string;
  /** inscripcion | mensualidad | uniforme | actividad | otro */
  tipo: string;
  admiteBeca: boolean;
  /** El precio es por cuota o el total que se reparte (`precioEsPorCuota`). null = por el tipo. */
  precioPorCuota?: boolean | null;
  /** Producto de reserva: el de la tarifa manda, este solo si la tarifa no fija ninguno. */
  productId: number | null;
  activo: boolean;
}

export interface CuotaCorrida {
  id: number;
  conceptoId: number;
  numero: number;
  mes: number | null;
  fechaEmision: string;
  porcentajeMilesimas: number;
}

export interface CargoCorrida {
  id: number;
  matriculaId: number;
  conceptoId: number;
  cuotaId: number | null;
  mes: number | null;
  anio: number;
  montoCentavos: number;
  saldoCentavos: number;
  estado: string;
  ecfDocumentId: number | null;
  /** De su cuota, cuando la tiene. */
  cuotaFechaEmision: string | null;
  cuotaPorcentajeMilesimas: number | null;
}

/** Todo lo que el simulacro de UN colegio necesita, ya leído de la base. */
export interface ContextoColegio {
  teamId: number;
  periodoId: number;
  matriculas: MatriculaCorrida[];
  conceptos: ConceptoCorrida[];
  /** Las cuotas activas del año de TODOS los conceptos: de ahí salen los porcentajes. */
  cuotas: CuotaCorrida[];
  precios: PrecioConfigurado[];
  /** Los cargos del año de los conceptos que tienen cuota en las fechas que se miran. */
  cargos: CargoCorrida[];
}

// ─── Las líneas de una corrida ───────────────────────────────────────────────

export interface LineaCorrida {
  matriculaId: number;
  estudianteId: number;
  clienteId: number | null;
  conceptoId: number;
  concepto: string;
  conceptoTipo: string;
  cuotaId: number;
  /** Lo que se factura: el saldo del cargo si ya existe, el cálculo del plan si no. */
  montoCentavos: number;
  /** 'cargo' = ya existe en la base; 'estimado' = el devengo todavía no lo crea. */
  origen: 'cargo' | 'estimado';
  cargoId: number | null;
  ecfDocumentId: number | null;
  /** Ni la tarifa ni el concepto fijan un producto: saldría con ITBIS exento. */
  sinProducto: boolean;
  /** El monto del mismo concepto en la cuota anterior de esa matrícula, si es comparable. */
  anteriorCentavos: number | null;
}

export interface ResultadoLineas {
  lineas: LineaCorrida[];
  /** Cobros marcados al matricular cuyo concepto no tiene tarifa para esa sección. */
  sinTarifa: { matriculaId: number; conceptoId: number }[];
}

const COBRABLES = ['pendiente', 'parcial', 'vencido'];

/**
 * Cuánto puede variar un monto contra el del mes anterior sin llamar la
 * atención. Repartir en cuotas deja a veces una diferencia de centavos en la
 * primera, y avisar de eso sería ruido en cada colegio con evaluaciones.
 */
export const TOLERANCIA_MONTO_CENTAVOS = 100;

/** Dos cuotas de un concepto que no es mensualidad solo son comparables si pesan lo mismo. */
const TOLERANCIA_PORCENTAJE_MILESIMAS = 5;

/**
 * La llave con la que el devengo sabe que un cargo ya se creó.
 * Copia de `claveHecho` en `devengar.ts`: con cuota manda la cuota; sin ella, el concepto.
 */
function claveHecho(c: { matriculaId: number; cuotaId: number | null; conceptoId: number }): string {
  return c.cuotaId ? `q:${c.matriculaId}:${c.cuotaId}` : `c:${c.matriculaId}:${c.conceptoId}`;
}

/**
 * Las líneas de la corrida de `fecha`: los cargos de las cuotas que se emiten
 * ese día, los que ya existen y los que el devengo todavía va a crear.
 *
 * Replica, en este orden, lo que hace la corrida real:
 *
 *   1. `devengarPeriodo` crea el cargo de cada matrícula ACTIVA que eligió el
 *      concepto al matricular (o, en las viejas sin lista, que ya usó una cuota
 *      suyo), salvo que la cuota se emitiera antes de que el alumno entrara, que
 *      ya exista un cargo suyo o que el concepto no tenga tarifa para su sección.
 *   2. `facturarCuotasEmitidas` toma los cargos cobrables sin factura de esas
 *      cuotas. De los que existen ya se encargan las líneas `origen: 'cargo'`.
 *
 * El monto de lo que aún no existe sale de `resolverTarifasEnMemoria` (la cadena
 * alumno→sección→grado→servicio con la beca) y `montosPorCuota` (la mensualidad
 * cobra la tarifa entera en cada cuota; lo demás la reparte), igual que
 * `armarPlanDeCobro`.
 */
export function lineasDeLaCorrida(ctx: ContextoColegio, fecha: string): ResultadoLineas {
  const conceptos = new Map(ctx.conceptos.map((c) => [c.id, c]));

  // El calendario de cada concepto, en el orden en que el plan lo lee: el número
  // de cuota decide cuál de los porcentajes le toca a cada una.
  const calendario = new Map<number, CuotaCorrida[]>();
  for (const q of [...ctx.cuotas].sort((a, b) => a.numero - b.numero)) {
    const lista = calendario.get(q.conceptoId) ?? [];
    lista.push(q);
    calendario.set(q.conceptoId, lista);
  }

  const delDia = ctx.cuotas.filter((q) => q.fechaEmision === fecha && conceptos.get(q.conceptoId)?.activo);
  const cargosDelDia = ctx.cargos.filter((c) => c.cuotaFechaEmision === fecha);
  if (delDia.length === 0 && cargosDelDia.length === 0) return { lineas: [], sinTarifa: [] };

  const matriculas = new Map(ctx.matriculas.map((m) => [m.id, m]));
  const admiteBeca = new Map(ctx.conceptos.map((c) => [c.id, c.admiteBeca]));

  // La tarifa de cada matrícula, resuelta una vez para todos los conceptos que
  // el día toca: es la parte cara y se repetía por línea.
  const conceptosDelDia = [...new Set([
    ...delDia.map((q) => q.conceptoId),
    ...cargosDelDia.map((c) => c.conceptoId),
  ])];
  const tarifasCache = new Map<number, Map<number, TarifaResuelta>>();
  const tarifasDe = (m: MatriculaCorrida) => {
    let t = tarifasCache.get(m.id);
    if (!t) {
      t = resolverTarifasEnMemoria(ctx.precios, admiteBeca, {
        periodoId: ctx.periodoId,
        seccionId: m.cursoId,
        gradoId: m.gradoId,
        servicioId: m.servicioId,
        becaTipo: m.becaTipo,
        becaValor: m.becaValor,
        estudianteId: m.estudianteId,
        conceptoMensualidadId: m.conceptoMensualidadId,
      }, conceptosDelDia);
      tarifasCache.set(m.id, t);
    }
    return t;
  };

  // La cuota anterior de cada (matrícula, concepto), para el «cambió de monto».
  const historia = new Map<string, CargoCorrida[]>();
  for (const c of ctx.cargos) {
    if (c.estado === 'anulado' || !c.cuotaFechaEmision) continue;
    const k = `${c.matriculaId}:${c.conceptoId}`;
    const lista = historia.get(k) ?? [];
    lista.push(c);
    historia.set(k, lista);
  }
  for (const lista of historia.values()) {
    lista.sort((a, b) => b.cuotaFechaEmision!.localeCompare(a.cuotaFechaEmision!));
  }
  const anteriorDe = (
    matriculaId: number, conceptoId: number, tipo: string, porcentaje: number,
  ): number | null => {
    const previo = historia.get(`${matriculaId}:${conceptoId}`)
      ?.find((c) => c.cuotaFechaEmision! < fecha);
    if (!previo) return null;
    const comparable = tipo === 'mensualidad'
      || Math.abs((previo.cuotaPorcentajeMilesimas ?? 0) - porcentaje) <= TOLERANCIA_PORCENTAJE_MILESIMAS;
    return comparable ? previo.montoCentavos : null;
  };

  const lineas: LineaCorrida[] = [];

  // ── Los cargos que ya existen ──────────────────────────────────────────────
  // Entran los cobrables sin factura (la corrida los factura) y los que ya la
  // tienen (para poder contar lo que se facturó). Un cargo pagado o anulado no
  // es de la corrida.
  for (const c of cargosDelDia) {
    if (c.estado === 'anulado') continue;
    if (c.ecfDocumentId == null && !COBRABLES.includes(c.estado)) continue;
    const m = matriculas.get(c.matriculaId);
    const concepto = conceptos.get(c.conceptoId);
    if (!m || !concepto) continue;

    // Igual que el prefill de la factura: el producto de la tarifa y, si no fija
    // ninguno, el del concepto.
    const producto = tarifasDe(m).get(c.conceptoId)?.productId ?? concepto.productId ?? null;
    const pct = c.cuotaPorcentajeMilesimas ?? 0;
    lineas.push({
      matriculaId: m.id,
      estudianteId: m.estudianteId,
      clienteId: m.clienteId,
      conceptoId: concepto.id,
      concepto: concepto.nombre,
      conceptoTipo: concepto.tipo,
      cuotaId: c.cuotaId ?? 0,
      montoCentavos: c.saldoCentavos,
      origen: 'cargo',
      cargoId: c.id,
      ecfDocumentId: c.ecfDocumentId,
      sinProducto: producto == null,
      anteriorCentavos: anteriorDe(m.id, c.conceptoId, concepto.tipo, pct),
    });
  }

  // ── Los que el devengo todavía va a crear ──────────────────────────────────
  const sinTarifa: ResultadoLineas['sinTarifa'] = [];
  if (delDia.length > 0) {
    // Mismo cálculo que `devengarPeriodo`: lo que cada matrícula ya tiene.
    const existentes = new Set(ctx.cargos.map(claveHecho));
    const manualesPorMes = new Set(ctx.cargos
      .filter((c) => c.cuotaId == null && c.mes != null)
      .map((c) => `${c.matriculaId}:${c.conceptoId}:${c.anio}:${c.mes}`));
    const cuotasUsadas = new Map<number, Set<number | null>>();
    for (const c of ctx.cargos) {
      const s = cuotasUsadas.get(c.matriculaId) ?? new Set<number | null>();
      s.add(c.cuotaId);
      cuotasUsadas.set(c.matriculaId, s);
    }

    for (const m of ctx.matriculas) {
      if (m.estado !== 'activa') continue; // el devengo solo mira las activas
      const elegidos = new Set(m.conceptosIds ?? []);
      const yaUsadas = cuotasUsadas.get(m.id) ?? new Set<number | null>();

      for (const q of delDia) {
        const concepto = conceptos.get(q.conceptoId)!;
        const suyas = calendario.get(q.conceptoId) ?? [];

        // Se devenga lo que se marcó al matricular y nada más; el respaldo por
        // cuotas ya usadas es para las matrículas anteriores a la lista.
        const vivo = elegidos.has(q.conceptoId)
          || (elegidos.size === 0 && suyas.some((c) => yaUsadas.has(c.id)));
        if (!vivo) continue;

        // Una cuota emitida antes de que el alumno entrara no se le cobra.
        if (q.fechaEmision < String(m.fechaInscripcion ?? fecha)) continue;

        // El mes que el plan le pone a la cuota (el de su emisión; null en un
        // concepto de una sola cuota sin mes).
        const mesCuota = q.mes == null && suyas.length <= 1 ? null : Number(q.fechaEmision.slice(5, 7));
        const yaEsta = existentes.has(claveHecho({ matriculaId: m.id, cuotaId: q.id, conceptoId: q.conceptoId }))
          || (mesCuota == null
            ? existentes.has(`c:${m.id}:${q.conceptoId}`)
            : manualesPorMes.has(`${m.id}:${q.conceptoId}:${q.fechaEmision.slice(0, 4)}:${mesCuota}`));
        if (yaEsta) continue;

        const tarifa = tarifasDe(m).get(q.conceptoId);
        if (!tarifa) {
          // El plan salta el concepto sin tarifa y el devengo no crea nada: la
          // familia no recibe esa cobranza y nadie lo ve. Se cuenta para decirlo.
          sinTarifa.push({ matriculaId: m.id, conceptoId: q.conceptoId });
          continue;
        }

        // Las cuotas que cobra ESTA tarifa: si su grado paga 10 de 11, la
        // undécima no le toca y no se anuncia.
        const deLaTarifa = cuotasDeLaTarifa(suyas, tarifa.cuotas);
        const indice = deLaTarifa.findIndex((c) => c.id === q.id);
        if (indice < 0) continue;
        const montos = montosPorCuota(
          concepto.tipo, tarifa.montoCentavos, deLaTarifa.map((c) => c.porcentajeMilesimas), concepto.precioPorCuota);
        const monto = montos[indice] ?? 0;

        lineas.push({
          matriculaId: m.id,
          estudianteId: m.estudianteId,
          clienteId: m.clienteId,
          conceptoId: concepto.id,
          concepto: concepto.nombre,
          conceptoTipo: concepto.tipo,
          cuotaId: q.id,
          montoCentavos: monto,
          origen: 'estimado',
          cargoId: null,
          ecfDocumentId: null,
          sinProducto: (tarifa.productId ?? concepto.productId ?? null) == null,
          anteriorCentavos: anteriorDe(m.id, q.conceptoId, concepto.tipo, q.porcentajeMilesimas),
        });
      }
    }
  }

  return { lineas, sinTarifa };
}

// ─── Qué pasa con cada línea ─────────────────────────────────────────────────

export type EstadoLinea =
  | 'facturada-hoy'
  | 'ya-facturada'
  | 'sin-cargo'
  | 'planes'
  | 'sin-saldo'
  | 'sin-responsable'
  | 'facturable';

export interface OpcionesDeResumen {
  tipo: TipoAviso;
  modo: ModoCorrida;
  /** Algún alumno del año tiene un plan recurrente ACTIVO: la colegiatura no sale por calendario. */
  conPlanes: boolean;
  /** Ids de las facturas creadas HOY (solo cuenta en el resultado). */
  facturasDeHoy?: Set<number>;
}

/**
 * Qué le pasa a una línea cuando corre la facturación.
 *
 * El orden es el de `facturarCuotasEmitidas`: primero lo que no se factura por
 * calendario (la colegiatura con planes), luego el saldo en cero, luego el que
 * no tiene a quién facturarle. El «sin cargo» solo existe cuando la corrida ya
 * pasó: si hoy el devengo debió crear el cargo y no está, algo falló.
 */
export function clasificarLinea(l: LineaCorrida, o: OpcionesDeResumen): EstadoLinea {
  if (l.ecfDocumentId != null) {
    return o.facturasDeHoy?.has(l.ecfDocumentId) ? 'facturada-hoy' : 'ya-facturada';
  }
  if (o.tipo === 'resultado' && l.origen === 'estimado') return 'sin-cargo';
  if (cargosQueFacturaElCalendario([{ conceptoTipo: l.conceptoTipo }], o.conPlanes).length === 0) return 'planes';
  if (l.montoCentavos <= 0) return 'sin-saldo';
  if (l.clienteId == null) return 'sin-responsable';
  return 'facturable';
}

// ─── El resumen ──────────────────────────────────────────────────────────────

export interface ConceptoResumen {
  conceptoId: number;
  concepto: string;
  lineas: number;
  totalCentavos: number;
}

export type CodigoRevision =
  | 'sin-responsable'
  | 'sin-tarifa'
  | 'sin-producto'
  | 'planes'
  | 'monto-distinto'
  | 'sin-saldo'
  | 'sin-cargo'
  | 'sin-factura';

/** Un punto de «lo que hay que revisar». Solo cuentas: nunca el nombre de un alumno. */
export interface PuntoRevision {
  codigo: CodigoRevision;
  /** Alumnos, cargos, líneas o familias según el código. */
  cantidad: number;
  /** Solo en `monto-distinto`: de qué concepto. */
  concepto?: string;
  /** Solo en `monto-distinto`, cuando todos cambiaron igual: de cuánto a cuánto. */
  de?: number;
  a?: number;
}

export interface ResumenCorrida {
  /** Familias a las que hay que facturar (o a las que no se pudo): una factura cada una. */
  familias: number;
  lineas: number;
  totalCentavos: number;
  porConcepto: ConceptoResumen[];
  /** Lo que ya se facturó HOY, para el correo del resultado. */
  facturadasHoy: { facturas: number; lineas: number; totalCentavos: number };
  /**
   * Lo que debió existir hoy como cargo y no existe: el devengo no lo creó. Solo
   * el resultado lo llena. Va aparte de `totalCentavos` porque todavía no es
   * deuda ni hay nada que facturar, pero es justo la falla que más conviene contar.
   */
  sinCargo: { familias: number; lineas: number; totalCentavos: number };
  /** Líneas de esa fecha que ya estaban facturadas desde antes: no cuentan. */
  yaFacturadas: number;
  revisar: PuntoRevision[];
}

const distintos = <T>(xs: T[]) => new Set(xs).size;

/**
 * Agrupa las líneas de una corrida: cuántas familias, cuánto, por qué concepto,
 * y los puntos a revisar.
 *
 * Una factura por responsable de pago —no por alumno—, así que «familias» es el
 * número de `clienteId` distintos con algo que facturar. Es el mismo agrupado
 * de `facturarCuotasEmitidas`.
 */
export function resumirCorrida(
  lineas: LineaCorrida[],
  sinTarifa: number,
  o: OpcionesDeResumen,
): ResumenCorrida {
  const porEstado = new Map<EstadoLinea, LineaCorrida[]>();
  for (const l of lineas) {
    const e = clasificarLinea(l, o);
    const lista = porEstado.get(e) ?? [];
    lista.push(l);
    porEstado.set(e, lista);
  }
  const de = (e: EstadoLinea) => porEstado.get(e) ?? [];

  const facturables = de('facturable');
  const suma = (xs: LineaCorrida[]) => xs.reduce((n, l) => n + l.montoCentavos, 0);

  const conceptos = new Map<number, ConceptoResumen>();
  for (const l of facturables) {
    const c = conceptos.get(l.conceptoId)
      ?? { conceptoId: l.conceptoId, concepto: l.concepto, lineas: 0, totalCentavos: 0 };
    c.lineas += 1;
    c.totalCentavos += l.montoCentavos;
    conceptos.set(l.conceptoId, c);
  }

  const faltan = de('sin-cargo');
  const sinCargo = {
    familias: distintos(faltan.map((l) => l.clienteId ?? `alumno-${l.estudianteId}`)),
    lineas: faltan.length,
    totalCentavos: suma(faltan),
  };

  const hoy = de('facturada-hoy');
  const facturadasHoy = {
    facturas: distintos(hoy.map((l) => l.ecfDocumentId)),
    lineas: hoy.length,
    totalCentavos: suma(hoy),
  };

  // ── Lo que hay que revisar ─────────────────────────────────────────────────
  const revisar: PuntoRevision[] = [];
  const empuja = (p: PuntoRevision) => { if (p.cantidad > 0) revisar.push(p); };

  empuja({ codigo: 'sin-cargo', cantidad: de('sin-cargo').length });
  empuja({ codigo: 'sin-responsable', cantidad: distintos(de('sin-responsable').map((l) => l.estudianteId)) });
  empuja({ codigo: 'sin-tarifa', cantidad: sinTarifa });

  // El producto y el cambio de monto solo importan donde de verdad hay factura.
  const conFactura = [...facturables, ...hoy];
  empuja({ codigo: 'sin-producto', cantidad: conFactura.filter((l) => l.sinProducto).length });
  empuja({ codigo: 'planes', cantidad: de('planes').length });

  const cambiados = new Map<number, LineaCorrida[]>();
  for (const l of conFactura) {
    if (l.anteriorCentavos == null) continue;
    if (Math.abs(l.montoCentavos - l.anteriorCentavos) <= TOLERANCIA_MONTO_CENTAVOS) continue;
    const lista = cambiados.get(l.conceptoId) ?? [];
    lista.push(l);
    cambiados.set(l.conceptoId, lista);
  }
  for (const lista of cambiados.values()) {
    // Si todos pasaron de lo mismo a lo mismo (el aumento anual de la
    // colegiatura), se dice de cuánto a cuánto; si no, solo cuántos.
    const mismoSalto = lista.every((l) =>
      l.anteriorCentavos === lista[0].anteriorCentavos && l.montoCentavos === lista[0].montoCentavos);
    empuja({
      codigo: 'monto-distinto',
      cantidad: lista.length,
      concepto: lista[0].concepto,
      ...(mismoSalto ? { de: lista[0].anteriorCentavos!, a: lista[0].montoCentavos } : {}),
    });
  }

  empuja({ codigo: 'sin-saldo', cantidad: de('sin-saldo').length });

  // Corrida automática que ya pasó y dejó familias sin factura aunque tenían
  // todo para recibirla: se reintenta mañana, pero conviene que alguien lo sepa.
  if (o.tipo === 'resultado' && o.modo === 'automatico') {
    empuja({ codigo: 'sin-factura', cantidad: distintos(facturables.map((l) => l.clienteId)) });
  }

  return {
    familias: distintos(facturables.map((l) => l.clienteId)),
    lineas: facturables.length,
    totalCentavos: suma(facturables),
    porConcepto: [...conceptos.values()].sort((a, b) => b.totalCentavos - a.totalCentavos),
    facturadasHoy,
    sinCargo,
    yaFacturadas: de('ya-facturada').length,
    revisar,
  };
}

/**
 * ¿Hay algo que contarle al colegio? Una corrida en cero —todo con beca total,
 * o toda la colegiatura en manos de planes— no vale un correo.
 */
export function hayMontoQueContar(r: ResumenCorrida): boolean {
  // Un cargo que debió nacer hoy y no nació cuenta: callarlo sería esconder la
  // falla del devengo justo el día que el colegio espera su facturación.
  return r.totalCentavos + r.facturadasHoy.totalCentavos + r.sinCargo.totalCentavos > 0;
}

// ─── A quién le llega ────────────────────────────────────────────────────────

export interface DestinatarioCorrida {
  userId: number;
  email: string;
}

/**
 * Un correo, una vez. Si dos filas del equipo apuntan al mismo buzón (la misma
 * persona dada de alta dos veces), se queda la primera: no se le manda el aviso
 * doble. Compara sin mayúsculas ni espacios, como cualquier buzón.
 */
export function sinRepetidos(destinatarios: DestinatarioCorrida[]): DestinatarioCorrida[] {
  const vistos = new Set<string>();
  const out: DestinatarioCorrida[] = [];
  for (const d of destinatarios) {
    const email = d.email?.trim();
    if (!email) continue;
    const k = email.toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ userId: d.userId, email });
  }
  return out;
}

/**
 * La llave con la que se busca en `audit_logs` si a ESTE destinatario ya le
 * salió ESTE aviso. Una fila sin usuario cuenta como «a todo el colegio».
 */
export function llaveDeEnvio(teamId: number, clave: string, userId: number | null): string {
  return `${teamId}|${clave}|${userId ?? '*'}`;
}

export function yaSeEnvio(enviados: Set<string>, teamId: number, clave: string, userId: number): boolean {
  return enviados.has(llaveDeEnvio(teamId, clave, userId)) || enviados.has(llaveDeEnvio(teamId, clave, null));
}
