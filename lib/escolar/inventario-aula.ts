/**
 * Inventario por aula (Gobernanza): lo que vale cada espacio del colegio y qué
 * hay dentro. Todo PURO, sin base ni red, para poder probarlo:
 *
 *   - los totales por aula (invertido, vale hoy, por estudiante),
 *   - la regla de «reponer pronto»,
 *   - la división de una ficha cuando se mueven solo unas unidades a otra aula,
 *   - cuándo se muestra u oculta la pantalla.
 *
 * Los datos salen de las fichas de activos fijos de contabilidad
 * (`contabilidad_activos_fijos`), que ya llevan costo, depreciación acumulada,
 * cantidad y vida útil. Aquí solo se agrupan por espacio.
 *
 * Las fichas de «solo control» se cuentan en unidades pero NO suman a lo
 * invertido, a lo que vale hoy ni a lo que hay que reponer: su costo se fue al
 * gasto, no está en las cuentas del activo fijo.
 */

// ── Catálogos ────────────────────────────────────────────────────────────────

export const TIPOS_ESPACIO = [
  { clave: 'aula', label: 'Aula' },
  { clave: 'laboratorio', label: 'Laboratorio' },
  { clave: 'biblioteca', label: 'Biblioteca' },
  { clave: 'oficina', label: 'Oficina' },
  { clave: 'transporte', label: 'Transporte' },
  { clave: 'general', label: 'Área general' },
  { clave: 'otro', label: 'Otro' },
] as const;

export type TipoEspacio = (typeof TIPOS_ESPACIO)[number]['clave'];

export function tipoEspacioValido(t: unknown): t is TipoEspacio {
  return TIPOS_ESPACIO.some((x) => x.clave === t);
}

export function labelTipoEspacio(t: string): string {
  return TIPOS_ESPACIO.find((x) => x.clave === t)?.label ?? 'Otro';
}

export const ESTADOS_ACTIVO = [
  { clave: 'bien', label: 'Bien' },
  { clave: 'regular', label: 'Regular' },
  { clave: 'danado', label: 'Dañado' },
] as const;

export type EstadoActivo = (typeof ESTADOS_ACTIVO)[number]['clave'];

export function estadoActivoValido(e: unknown): e is EstadoActivo {
  return ESTADOS_ACTIVO.some((x) => x.clave === e);
}

/** Lo que se ve en la tabla: el estado guardado, o «reponer pronto» si la vida útil se acaba. */
export type EstadoVisible = 'bien' | 'regular' | 'reponer' | 'danado';

export const LABEL_ESTADO_VISIBLE: Record<EstadoVisible, string> = {
  bien: 'Bien', regular: 'Regular', reponer: 'Reponer pronto', danado: 'Dañado',
};

export class TrasladoError extends Error {
  constructor(message: string, readonly status = 422) { super(message); this.name = 'TrasladoError'; }
}

// ── Fichas y estado ──────────────────────────────────────────────────────────

/** Lo que el inventario necesita de una ficha de activo fijo. Dinero en centavos. */
export interface FichaInventario {
  id: number;
  nombre: string;
  /** Aula donde está; null = sin aula asignada. */
  espacioId: number | null;
  categoria: string | null;
  /** Unidades que quedan (las dadas de baja ya no cuentan). */
  cantidadVigente: number;
  /** Costo de lo que queda. */
  costoVigenteCents: number;
  /** Depreciación acumulada de lo que queda. */
  acumuladaVigenteCents: number;
  vidaUtilMeses: number;
  /** 'YYYY-MM-DD'. */
  fechaAdquisicion: string;
  soloControl: boolean;
  estado: string;
  /** Abierta desde una compra y sin confirmar: su vida útil todavía es provisional. */
  enRevision: boolean;
  activa: boolean;
}

/** Meses completos de calendario entre dos fechas 'YYYY-MM-DD' (por mes, como la depreciación). */
export function mesesEntre(desde: string, hasta: string): number {
  const [y1, m1] = desde.split('-').map(Number);
  const [y2, m2] = hasta.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** Meses de vida útil que le quedan (nunca negativo). */
export function mesesDeVidaRestantes(f: Pick<FichaInventario, 'fechaAdquisicion' | 'vidaUtilMeses'>, hoy: string): number {
  return Math.max(0, f.vidaUtilMeses - mesesEntre(f.fechaAdquisicion, hoy));
}

/** Fracción de la vida útil ya consumida, de 0 a 1. */
export function fraccionConsumida(f: Pick<FichaInventario, 'fechaAdquisicion' | 'vidaUtilMeses'>, hoy: string): number {
  if (f.vidaUtilMeses <= 0) return 1;
  return Math.min(1, Math.max(0, mesesEntre(f.fechaAdquisicion, hoy) / f.vidaUtilMeses));
}

/** Tope de meses para avisar que hay que reponer. */
export const MESES_REPONER = 12;
/** Pasado este tanto de la vida útil, también hay que reponer. */
export const CONSUMO_REPONER = 0.85;

/**
 * «Reponer pronto»: le quedan 12 meses o menos de vida útil, o ya se consumió más
 * del 85 %. No aplica a lo de «solo control» (no tiene vida útil que contar), a
 * los terrenos (no se desgastan) ni a una ficha sin confirmar (su vida útil es
 * provisional).
 */
export function debeReponerPronto(f: FichaInventario, hoy: string): boolean {
  if (f.soloControl || f.enRevision || f.categoria === 'terrenos') return false;
  return mesesDeVidaRestantes(f, hoy) <= MESES_REPONER || fraccionConsumida(f, hoy) > CONSUMO_REPONER;
}

/** Dañado manda sobre todo; luego la vida útil; si no, el estado que anotó la persona. */
export function estadoVisible(f: FichaInventario, hoy: string): EstadoVisible {
  if (f.estado === 'danado') return 'danado';
  if (debeReponerPronto(f, hoy)) return 'reponer';
  return f.estado === 'regular' ? 'regular' : 'bien';
}

/** Lo invertido en la ficha. «Solo control» no cuenta: su costo fue al gasto. */
export function invertidoDe(f: FichaInventario): number {
  return f.soloControl ? 0 : f.costoVigenteCents;
}

/** Lo que vale hoy en libros. «Solo control» no cuenta. Nunca negativo. */
export function valeHoyDe(f: FichaInventario): number {
  return f.soloControl ? 0 : Math.max(0, f.costoVigenteCents - f.acumuladaVigenteCents);
}

// ── Totales por aula ─────────────────────────────────────────────────────────

export interface EspacioBase {
  id: number;
  nombre: string;
  tipo: string;
  capacidad: number | null;
  responsableId: number | null;
  responsable: string | null;
  activo: boolean;
  secciones: { cursoId: number; etiqueta: string; matriculados: number }[];
}

export interface TotalesAula {
  espacioId: number | null;
  nombre: string;
  tipo: string;
  unidades: number;
  /** Fichas distintas. */
  fichas: number;
  invertidoCents: number;
  valeHoyCents: number;
  /** Matriculados activos de las secciones del aula. */
  estudiantes: number;
  /** Vale hoy entre estudiantes; null si el aula no tiene secciones o ninguna con alumnos. */
  porEstudianteCents: number | null;
  /** Lo que costaría reponer lo que está por vencer o dañado. */
  porReponerCents: number;
  unidadesPorReponer: number;
  unidadesDanadas: number;
  unidadesSoloControl: number;
}

/** Cociente entero redondeado (centavos). */
function dividirRedondeado(num: number, den: number): number {
  return Math.round(num / den);
}

function totalesDe(fichas: readonly FichaInventario[], hoy: string): Omit<TotalesAula, 'espacioId' | 'nombre' | 'tipo' | 'estudiantes' | 'porEstudianteCents'> {
  let unidades = 0, invertido = 0, valeHoy = 0, porReponer = 0, unidadesPorReponer = 0, danadas = 0, control = 0;
  for (const f of fichas) {
    unidades += f.cantidadVigente;
    invertido += invertidoDe(f);
    valeHoy += valeHoyDe(f);
    if (f.soloControl) control += f.cantidadVigente;
    const v = estadoVisible(f, hoy);
    if (v === 'danado' || v === 'reponer') {
      unidadesPorReponer += f.cantidadVigente;
      porReponer += invertidoDe(f);
    }
    if (v === 'danado') danadas += f.cantidadVigente;
  }
  return {
    unidades, fichas: fichas.length, invertidoCents: invertido, valeHoyCents: valeHoy,
    porReponerCents: porReponer, unidadesPorReponer, unidadesDanadas: danadas, unidadesSoloControl: control,
  };
}

/** Totales de un espacio con las fichas que tiene y los alumnos de sus secciones. */
export function totalesPorAula(espacio: EspacioBase, fichas: readonly FichaInventario[], hoy: string): TotalesAula {
  const estudiantes = espacio.secciones.reduce((s, x) => s + x.matriculados, 0);
  const t = totalesDe(fichas, hoy);
  return {
    espacioId: espacio.id, nombre: espacio.nombre, tipo: espacio.tipo,
    ...t,
    estudiantes,
    porEstudianteCents: espacio.secciones.length > 0 && estudiantes > 0 ? dividirRedondeado(t.valeHoyCents, estudiantes) : null,
  };
}

export interface ResumenInventario {
  tarjetas: {
    invertidoCents: number;
    valeHoyCents: number;
    /** Vale hoy entre todos los matriculados activos del colegio; null si no hay. */
    porEstudianteCents: number | null;
    porReponerCents: number;
    unidadesPorReponer: number;
    estudiantes: number;
  };
  aulas: TotalesAula[];
  /** Lo que no tiene aula asignada. Null si no hay nada suelto. */
  sinAula: TotalesAula | null;
}

/**
 * Arma lo que enseña la pantalla: las tarjetas de arriba, una fila por aula y el
 * grupo «Sin aula asignada». Solo cuentan las fichas activas; los espacios
 * inactivos se dejan fuera (lo que tengan se va a «sin aula»).
 */
export function resumirInventario(
  espacios: readonly EspacioBase[],
  fichasTodas: readonly FichaInventario[],
  estudiantesTotal: number,
  hoy: string,
): ResumenInventario {
  const fichas = fichasTodas.filter((f) => f.activa && f.cantidadVigente > 0);
  const vivos = espacios.filter((e) => e.activo);
  const idsVivos = new Set(vivos.map((e) => e.id));

  const aulas = vivos.map((e) => totalesPorAula(e, fichas.filter((f) => f.espacioId === e.id), hoy));
  const sueltas = fichas.filter((f) => f.espacioId == null || !idsVivos.has(f.espacioId));
  const sinAula: TotalesAula | null = sueltas.length === 0 ? null : {
    espacioId: null, nombre: 'Sin aula asignada', tipo: 'otro',
    ...totalesDe(sueltas, hoy), estudiantes: 0, porEstudianteCents: null,
  };

  const todas = sinAula ? [...aulas, sinAula] : aulas;
  const invertido = todas.reduce((s, a) => s + a.invertidoCents, 0);
  const valeHoy = todas.reduce((s, a) => s + a.valeHoyCents, 0);
  const porReponer = todas.reduce((s, a) => s + a.porReponerCents, 0);
  const unidadesPorReponer = todas.reduce((s, a) => s + a.unidadesPorReponer, 0);
  return {
    tarjetas: {
      invertidoCents: invertido, valeHoyCents: valeHoy,
      porEstudianteCents: estudiantesTotal > 0 ? dividirRedondeado(valeHoy, estudiantesTotal) : null,
      porReponerCents: porReponer, unidadesPorReponer, estudiantes: estudiantesTotal,
    },
    aulas, sinAula,
  };
}

// ── Mostrar u ocultar ────────────────────────────────────────────────────────

export interface EstadoPlanta {
  /** Corrieron las migraciones que necesita (0225 y 0236). */
  disponible: boolean;
  espacios: number;
  /** Fichas activas con aula asignada. */
  activosConEspacio: number;
}

/**
 * ¿Se enseña «Inventario por aula»? Solo si todo está migrado, la empresa tiene
 * espacios y hay al menos un activo con aula. En cualquier otro caso no hay
 * entrada en el menú ni pantalla: solo queda «Planta física» para empezar.
 */
export function inventarioAulaVisible(e: EstadoPlanta | null | undefined): boolean {
  return !!e && e.disponible && e.espacios > 0 && e.activosConEspacio > 0;
}

/** Para la configuración: la entrada «Planta física» sale en cuanto las tablas existen. */
export function plantaFisicaDisponible(e: EstadoPlanta | null | undefined): boolean {
  return !!e && e.disponible;
}

// ── Etiquetas de sección ─────────────────────────────────────────────────────

const ORDINALES: [RegExp, string][] = [
  [/^(primero|primer)\b/i, '1.º'], [/^(segundo)\b/i, '2.º'], [/^(tercero|tercer)\b/i, '3.º'],
  [/^(cuarto)\b/i, '4.º'], [/^(quinto)\b/i, '5.º'], [/^(sexto)\b/i, '6.º'],
  [/^(séptimo|septimo)\b/i, '7.º'], [/^(octavo)\b/i, '8.º'],
];

const TANDAS: Record<string, string> = {
  matutina: 'mañana', matutino: 'mañana', vespertina: 'tarde', vespertino: 'tarde',
  nocturna: 'noche', nocturno: 'noche', sabatina: 'sábado', sabatino: 'sábado', 'jornada extendida': 'jornada extendida',
};

/**
 * «1.º A · mañana»: el grado abreviado cuando empieza por su ordinal («Primero»,
 * «Primer grado (7mo Nivel Básico)»), la letra de la sección y la tanda. Lo que no
 * se reconoce se deja como viene.
 */
export function etiquetaSeccion(grado: string, seccion: string, tanda?: string | null): string {
  const limpio = grado.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  let g = limpio;
  for (const [re, abrev] of ORDINALES) {
    if (re.test(limpio)) { g = abrev; break; }
  }
  const t = tanda ? (TANDAS[tanda.trim().toLowerCase()] ?? tanda.trim().toLowerCase()) : '';
  return [g, seccion.trim()].filter(Boolean).join(' ') + (t ? ` · ${t}` : '');
}

// ── Dividir una ficha ────────────────────────────────────────────────────────

export interface CuotaDeFicha { periodo: string; montoCents: number }

export interface FichaParaDividir {
  costoCents: number;
  valorResidualCents: number;
  /** Unidades que cubre la ficha. */
  cantidad: number;
  /** Cuotas de depreciación ya asentadas, en el orden de sus periodos. */
  depreciaciones: readonly CuotaDeFicha[];
}

export interface ParteDeFicha {
  cantidad: number;
  costoCents: number;
  valorResidualCents: number;
  /** Una por cada cuota original (misma lista de periodos), con su parte del monto. Puede haber ceros. */
  depreciaciones: CuotaDeFicha[];
}

export interface DivisionFicha {
  /** La que se queda en el aula de origen. */
  madre: ParteDeFicha;
  /** La que se va al aula nueva. */
  hija: ParteDeFicha;
}

/** a·b/c redondeado al entero más cercano (mitad hacia arriba), sin perder precisión con montos grandes. */
function mulDivRound(a: number, b: number, c: number): number {
  const A = BigInt(a), B = BigInt(b), C = BigInt(c);
  return Number((2n * A * B + C) / (2n * C));
}

function acotar(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/**
 * Reparte `total` entre las cuotas en proporción a su monto, en centavos enteros y
 * sin que la suma se mueva ni un centavo (método del mayor resto). Cada parte es
 * a lo más el monto de su cuota.
 */
function repartirProporcional(montos: readonly number[], total: number): number[] {
  const suma = montos.reduce((s, m) => s + m, 0);
  if (total <= 0 || suma <= 0) return montos.map(() => 0);
  const T = BigInt(total), S = BigInt(suma);
  const base = montos.map((m) => (BigInt(m) * T) / S);
  const resto = montos.map((m, i) => ({ i, r: BigInt(m) * T - base[i] * S }));
  let faltan = Number(T - base.reduce((s, b) => s + b, 0n));
  resto.sort((x, y) => (x.r === y.r ? x.i - y.i : x.r > y.r ? -1 : 1));
  const out = base.map((b) => Number(b));
  for (const { i, r } of resto) {
    if (faltan <= 0) break;
    if (r > 0n) { out[i] += 1; faltan -= 1; }
  }
  return out;
}

/**
 * Divide una ficha cuando solo se mueven `mover` de sus unidades a otra aula.
 *
 * Reparte costo, valor residual y depreciación acumulada en proporción a las
 * unidades, en centavos exactos: lo que se lleva la hija más lo que se queda la
 * madre da SIEMPRE el original, mes por mes en la depreciación. Eso es lo que
 * deja el libro como estaba: los asientos de depreciación ya hechos no se tocan,
 * solo cambia a cuál de las dos fichas pertenece cada pedazo.
 *
 * Cada mitad queda válida por sí sola: costo mayor que cero, residual menor que
 * el costo, y depreciación acumulada que no pasa de lo depreciable (costo −
 * residual). Por eso el reparto de la depreciación se acota a esos límites.
 */
export function dividirFicha(f: FichaParaDividir, mover: number): DivisionFicha {
  if (!Number.isSafeInteger(mover) || mover < 1) throw new TrasladoError('Indica cuántas unidades se mueven (al menos una).');
  if (!Number.isSafeInteger(f.cantidad) || mover >= f.cantidad) {
    throw new TrasladoError('Para dividir la ficha tiene que quedar al menos una unidad en el aula de origen.');
  }
  if (f.costoCents < 2) throw new TrasladoError('El costo de la ficha es muy pequeño para dividirlo.');
  const n = f.cantidad, k = mover;

  // Costo: ninguna de las dos mitades puede quedar en cero.
  const costoHija = acotar(mulDivRound(f.costoCents, k, n), 1, f.costoCents - 1);
  const costoMadre = f.costoCents - costoHija;

  // Residual: menor que el costo en cada mitad.
  const resLo = Math.max(0, f.valorResidualCents - (costoMadre - 1));
  const resHi = Math.min(f.valorResidualCents, costoHija - 1);
  if (resLo > resHi) throw new TrasladoError('El valor residual de esta ficha es casi igual a su costo: no se puede dividir.');
  const resHija = acotar(mulDivRound(f.valorResidualCents, k, n), resLo, resHi);
  const resMadre = f.valorResidualCents - resHija;

  // Depreciación: la parte de la hija sigue la proporción, pero sin pasarse de lo depreciable de ninguna mitad.
  const montos = f.depreciaciones.map((d) => d.montoCents);
  const acumulada = montos.reduce((s, m) => s + m, 0);
  const baseHija = costoHija - resHija;
  const baseMadre = costoMadre - resMadre;
  const hijaDeprec = acumulada === 0 ? 0 : Math.min(
    acotar(mulDivRound(acumulada, k, n), Math.max(0, acumulada - baseMadre), acumulada),
    Math.max(0, baseHija),
  );
  const partes = repartirProporcional(montos, hijaDeprec);

  return {
    hija: {
      cantidad: k, costoCents: costoHija, valorResidualCents: resHija,
      depreciaciones: f.depreciaciones.map((d, i) => ({ periodo: d.periodo, montoCents: partes[i] })),
    },
    madre: {
      cantidad: n - k, costoCents: costoMadre, valorResidualCents: resMadre,
      depreciaciones: f.depreciaciones.map((d, i) => ({ periodo: d.periodo, montoCents: d.montoCents - partes[i] })),
    },
  };
}
