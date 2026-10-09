import { mesesDelPeriodo } from './periodo-utils';

/**
 * El calendario de cuotas de un concepto, deducido del año escolar.
 *
 * Hasta ahora las cuotas se sembraban a mano con SQL, y por eso el colegio de
 * pruebas tiene diez mensualidades para un año de doce meses: nadie contó. El
 * número de cuotas no es una pregunta que haya que hacerle a nadie —sale del
 * largo del período— y las fechas tampoco: salen del día del mes en que el
 * colegio emite. Un año de agosto a junio da ONCE mensualidades, no doce.
 *
 * Todo aquí es puro y sin fechas del sistema: las mismas entradas dan siempre
 * el mismo calendario, se genere en la pantalla o en el servidor.
 */

export type Frecuencia = 'unico' | 'mensual' | 'trimestral' | 'semestral';

export const FRECUENCIAS: readonly Frecuencia[] = ['unico', 'mensual', 'trimestral', 'semestral'];

export function esFrecuencia(v: unknown): v is Frecuencia {
  return typeof v === 'string' && (FRECUENCIAS as readonly string[]).includes(v);
}

/**
 * Cómo se dice cada frecuencia. En el ritmo del cobro y no en el nombre del
 * ciclo: al director le dice más "cada tres meses" que "trimestral", y así la
 * frase queda armada para meterse detrás de "Se cobra…".
 */
export const ETIQUETA_FRECUENCIA: Record<Frecuencia, string> = {
  unico:      'Una sola vez',
  mensual:    'Cada mes',
  trimestral: 'Cada tres meses',
  semestral:  'Cada seis meses',
};

/** Cada cuántos meses cae una cuota. El pago único no repite. */
const PASO: Record<Frecuencia, number> = { unico: 0, mensual: 1, trimestral: 3, semestral: 6 };

/**
 * El 31 no se puede elegir. Medio calendario no lo tiene, y entonces hay que
 * decidir en cada mes si se adelanta o se atrasa —dos respuestas defendibles,
 * ninguna que el colegio pueda predecir. Con el tope en 30 el recorte es
 * siempre hacia el último día real del mes y se explica en una frase.
 */
export const DIA_EMISION_MAX = 30;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** Días que tiene un mes. `Date` resuelve solo los bisiestos. */
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * El día en que de verdad se emite en un mes concreto.
 *
 * Quien pide el 30 en febrero cobra el 28 (o el 29 en bisiesto). Se recorta y
 * no se corre al mes siguiente porque la cuota es DE febrero: moverla al 2 de
 * marzo dejaría febrero sin cobrar y marzo con dos.
 */
export function recortarDiaAlMes(anio: number, mes: number, dia: number): number {
  const pedido = Math.min(Math.max(Math.trunc(dia) || 1, 1), DIA_EMISION_MAX);
  return Math.min(pedido, diasDelMes(anio, mes));
}

/** Fecha ISO de emisión de un mes, con el día ya recortado. */
export function fechaDeEmision(anio: number, mes: number, dia: number): string {
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(recortarDiaAlMes(anio, mes, dia))}`;
}

/** Suma días a una fecha ISO. En UTC, para que no la mueva el horario local. */
export function sumarDias(fechaISO: string, dias: number): string {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${dosDigitos(t.getUTCMonth() + 1)}-${dosDigitos(t.getUTCDate())}`;
}

/**
 * Cuándo vence una cuota. `null` = no vence nunca.
 *
 * El vencimiento NO se guarda: se calcula. Guardarlo obligaría a reescribir el
 * calendario entero cada vez que el colegio cambia los días para pagar, y basta
 * con que una fila se quede sin actualizar para que un padre reciba una fecha
 * límite que el sistema ya no cree.
 *
 * `diasParaPago = null` significa "sin fecha límite" —es lo que apaga el
 * interruptor «Tiene fecha de vencimiento»— y por eso devuelve null.
 *
 * Antes hacía `diasParaPago ?? 0`, que convertía "no vence nunca" en "vence a
 * los 0 días", o sea el mismo día de emisión. El colegio apagaba el
 * vencimiento y el cargo aparecía venciendo hoy: nacía vencido, y con mora
 * activada habría empezado a acumular recargo al día siguiente.
 */
export function vencimientoDe(fechaEmision: string, diasParaPago: number | null): string | null {
  if (diasParaPago == null) return null;
  return sumarDias(fechaEmision, Math.max(0, diasParaPago));
}

/**
 * Reparte `total` milésimas entre `n` cuotas sin perder ninguna.
 *
 * Se puede pedir menos del 100% para el caso de rehacer un calendario que ya
 * tiene cuotas facturadas: lo que ya se cobró se queda con su parte y solo se
 * reparte lo que queda del año.
 */
export function repartirMilesimasEntre(total: number, n: number): number[] {
  if (n <= 0 || total <= 0) return Array.from({ length: Math.max(0, n) }, () => 0);
  const parte = Math.floor(total / n);
  const partes = Array.from({ length: n }, () => parte);
  // Lo que sobra al truncar va a la primera, igual que el reparto de montos en
  // plan-cobro.ts. Doce cuotas dan 8.333% y la primera se queda con el 8.337%:
  // desviar cuatro milésimas en la primera es preferible a que el año no sume
  // el 100% y el padre termine debiendo un peso suelto en junio.
  partes[0] += total - parte * n;
  return partes;
}

/** Reparte el 100% entre `n` cuotas. */
export function repartirMilesimas(n: number): number[] {
  return repartirMilesimasEntre(100_000, n);
}

const ORDINALES = ['1er', '2do', '3er', '4to', '5to', '6to', '7mo', '8vo', '9no', '10mo', '11vo', '12vo'];

function etiquetaDe(frecuencia: Frecuencia, indice: number, mes: number, nombre?: string): string {
  // Un pago único no necesita nombre propio: ES el concepto. Poner "Pago único"
  // al lado de "Inscripción" obliga a leer dos veces para entender que son la
  // misma cosa, y en el recibo del padre "Inscripción" es lo que reconoce.
  if (frecuencia === 'unico')   return nombre?.trim() || 'Pago único';
  // El mes es la etiqueta que el padre reconoce en su recibo: "Septiembre" le
  // dice de qué está pagando, "Cuota 1" no.
  if (frecuencia === 'mensual') return MESES[mes - 1].replace(/^./, (c) => c.toUpperCase());
  const orden = ORDINALES[indice] ?? `${indice + 1}º`;
  return `${orden} ${frecuencia === 'trimestral' ? 'trimestre' : 'semestre'}`;
}

export interface CuotaGenerada {
  numero: number;
  etiqueta: string;
  /** Mes 1-12 al que pertenece; alimenta `admin_escolar_cargos.mes`. */
  mes: number | null;
  /** El día que sale la factura. El vencimiento se deriva de él. */
  fechaEmision: string;
  porcentajeMilesimas: number;
}

/**
 * El calendario que le toca a un concepto.
 *
 * Sin fechas del año escolar no se devuelve nada, en vez de inventar doce
 * meses: un período sin configurar es un problema que hay que enseñar, no
 * tapar con un calendario que nadie pidió.
 */
export function generarCalendario(opts: {
  frecuencia: Frecuencia;
  /** Día del mes en que emite el colegio, 1-30. */
  diaEmision: number;
  fechaInicio: string | null | undefined;
  fechaFin: string | null | undefined;
  /** Nombre del concepto. Solo lo usa el pago único, que se llama como él. */
  nombre?: string;
}): CuotaGenerada[] {
  const meses = mesesDelPeriodo(opts.fechaInicio, opts.fechaFin);
  if (meses.length === 0) return [];

  const paso = PASO[opts.frecuencia];
  const anclas = paso === 0
    ? [meses[0]]
    : meses.filter((_, i) => i % paso === 0);

  const partes = repartirMilesimas(anclas.length);

  return anclas.map((m, i) => ({
    numero: i + 1,
    etiqueta: etiquetaDe(opts.frecuencia, i, m.mes, opts.nombre),
    // El pago único no pertenece a ningún mes: la inscripción no es "la cuota
    // de agosto", es la inscripción del año.
    mes: opts.frecuencia === 'unico' ? null : m.mes,
    // El día del mes ordena un cobro que se repite; en el pago único no hay
    // nada que ordenar y aplicarlo lo saca del año: con el año empezando el 30
    // de septiembre y el día 1, la inscripción salía el 1 de septiembre, antes
    // de que el año exista. El pago único se ancla al arranque del período.
    fechaEmision: opts.frecuencia === 'unico' && opts.fechaInicio
      ? opts.fechaInicio
      : fechaDeEmision(m.anio, m.mes, opts.diaEmision),
    porcentajeMilesimas: partes[i],
  }));
}

/**
 * Cuántas cuotas saldrían, para avisar antes de generar.
 *
 * La pantalla lo enseña junto al selector de frecuencia: quien ve "11 cuotas"
 * antes de pulsar nota que su año escolar está mal configurado sin tener que
 * generar el calendario y contar filas.
 */
export function cuantasCuotas(
  frecuencia: Frecuencia,
  fechaInicio: string | null | undefined,
  fechaFin: string | null | undefined,
): number {
  const meses = mesesDelPeriodo(fechaInicio, fechaFin);
  if (meses.length === 0) return 0;
  const paso = PASO[frecuencia];
  return paso === 0 ? 1 : Math.ceil(meses.length / paso);
}
