/**
 * Facturar por lote: las reglas que no necesitan pantalla ni base de datos.
 *
 * El colegio pidió «un botón que te permita seleccionar un montón de
 * estudiantes, seleccionar conceptos y poder agregarle una factura a cada
 * uno». Esto es el cerebro de ese botón: dado lo que hay pendiente, DECIDE
 * cuántas facturas salen, de quién y con qué líneas, y a quién deja fuera con
 * su razón. No crea nada.
 *
 * Existe aparte de `facturar-emision.ts` por dos motivos:
 *
 *  - La vista previa («se van a crear 87 facturas») y la creación tienen que
 *    salir del MISMO cálculo. Si la pantalla enseñara una cuenta y el servidor
 *    creara otra, la secretaria confirmaría una cosa y pasaría otra. La
 *    creación recibe los grupos de este plan; no vuelve a agrupar por su lado.
 *  - Es lo que se puede probar sin base de datos (`tests/unit/facturar-lote.test.ts`),
 *    y esta pantalla no se puede ejecutar en las pruebas.
 *
 * Importable desde el navegador: no toca `db`. La parte que escribe vive en
 * `facturar-emision.ts` (`facturarGrupos`), que es el mismo constructor de
 * facturas del cron — no hay un segundo.
 *
 * Dos reglas que aquí son distintas a las del cron, a propósito:
 *
 *  1. **Una factura por ALUMNO, no por responsable** (salvo que se pida lo
 *     contrario con «Juntar hermanos»). El cron junta a los hermanos porque
 *     nadie se lo pidió separado; el colegio sí lo pidió así.
 *  2. **Entra también lo que no tiene calendario** (inscripción, uniforme, un
 *     paseo cobrado a mano). El cron solo mira cuotas con fecha de emisión
 *     porque es lo que lo dispara; aquí hay una persona eligiendo qué facturar.
 *     Por eso tampoco se aplica `cargosQueFacturaElCalendario`: si pidió la
 *     colegiatura, la quiere — y la recurrente no la duplica después, porque
 *     `mesYaFacturadoAMano` mira el cargo, que ya tendrá factura.
 */

import { fechaEnLetras } from './cargo-lote';
import { fmtFechaCorta } from '@/lib/utils/format';

/**
 * Cuántas facturas se crean en una sola petición.
 *
 * Medido en producción, una factura tarda ~2 s (el prefill resuelve tarifa y
 * producto de cada línea), y la ruta vive 300 s. Cien deja holgura de sobra.
 * La pantalla manda las facturas de 25 en 25 y enseña el avance, así que el
 * tope no se ve en el uso normal: es el seguro de quien llame a la ruta directo.
 */
export const MAX_FACTURAS_POR_PETICION = 100;

/** Cuántas facturas manda la pantalla por petición: lo bastante pocas para enseñar el avance. */
export const FACTURAS_POR_TANDA = 25;

/** Alumnos y conceptos que acepta una petición: más que cualquier colegio del plan. */
export const MAX_ALUMNOS_POR_PETICION = 5000;
export const MAX_CONCEPTOS_POR_PETICION = 200;

/** Estados de cargo que se pueden cobrar. Mismo criterio que el prefill y el cron. */
const COBRABLES = ['pendiente', 'parcial', 'vencido'];

/* ------------------------------------------------------------------ */
/*  Lo que entra                                                       */
/* ------------------------------------------------------------------ */

/** Un alumno elegido, con a quién se le factura. */
export interface AlumnoLote {
  id: number;
  nombre: string;
  /** `facturar_a_client_id`: el responsable de pago. `null` = nadie a quien facturarle. */
  clienteId: number | null;
  responsable: string | null;
}

/** Un cargo del alumno, venga o no de un calendario. */
export interface CargoLote {
  id: number;
  estudianteId: number;
  conceptoId: number;
  conceptoNombre: string;
  mes: number | null;
  anio: number;
  estado: string;
  saldoCentavos: number;
  fechaVencimiento: string | null;
  /**
   * Cuándo se emitió: la fecha de emisión de su cuota, o —un cargo sin
   * calendario— el día en que se creó. Es contra lo que se compara el corte
   * «cuotas emitidas hasta».
   */
  fechaEmision: string;
  ecfDocumentId: number | null;
}

export interface OpcionesLote {
  /** Los alumnos que se marcaron, en el orden en que se quiere enseñarlos. */
  alumnos: AlumnoLote[];
  /** Los conceptos que se marcaron. Un cargo de otro concepto no entra. */
  conceptoIds: number[];
  /** «Cuotas emitidas hasta»: 'YYYY-MM-DD', inclusive. */
  hasta: string;
  /** false = una factura por alumno · true = una por responsable, como el cron. */
  juntarHermanos: boolean;
}

/* ------------------------------------------------------------------ */
/*  Lo que sale                                                        */
/* ------------------------------------------------------------------ */

export interface LineaPlan {
  cargoId: number;
  estudianteId: number;
  estudiante: string;
  concepto: string;
  mes: number | null;
  anio: number;
  saldoCentavos: number;
  /** Con el más tardío de la factura se calcula su plazo de pago (ver `facturarGrupo`). */
  fechaVencimiento: string | null;
}

/** Una factura futura. Nada de esto existe todavía en la base. */
export interface FacturaPlan {
  /** `e:ID` (por alumno) o `r:ID` (por responsable). Identifica la fila en la pantalla. */
  clave: string;
  clienteId: number;
  responsable: string | null;
  estudiantes: { id: number; nombre: string }[];
  lineas: LineaPlan[];
  cargoIds: number[];
  /**
   * La suma de los cargos. NO es el total de la factura: si el producto lleva
   * ITBIS, la factura lo añade encima al crearse (ver `facturarGrupo`).
   */
  totalCentavos: number;
}

export type MotivoOmitido =
  | 'sin-responsable'
  | 'sin-cargos'
  | 'ya-facturado'
  | 'despues-del-corte'
  | 'sin-saldo';

/** Un alumno marcado que se queda sin factura, y por qué. */
export interface OmitidoPlan {
  estudianteId: number;
  nombre: string;
  motivo: MotivoOmitido;
  detalle: string;
  /** Los cargos que tocaba facturar, si el motivo es que falta el responsable. */
  cargoIds: number[];
}

export interface PlanLote {
  facturas: FacturaPlan[];
  omitidos: OmitidoPlan[];
  totalCargos: number;
  totalCentavos: number;
}

/* ------------------------------------------------------------------ */
/*  El planificador                                                    */
/* ------------------------------------------------------------------ */

const alfabetico = (a: string, b: string) => a.localeCompare(b, 'es');

/** Mes ausente al final, como en el prefill: «Inscripción» después de «Octubre». */
function porFecha(a: CargoLote, b: CargoLote): number {
  if (a.anio !== b.anio) return a.anio - b.anio;
  if ((a.mes == null) !== (b.mes == null)) return a.mes == null ? 1 : -1;
  if ((a.mes ?? 0) !== (b.mes ?? 0)) return (a.mes ?? 0) - (b.mes ?? 0);
  return a.id - b.id;
}

/**
 * Qué se le dice a un alumno que se queda sin nada que facturar.
 *
 * El orden importa: si tiene cuotas que todavía no se emiten, ESO es lo que
 * explica por qué hoy no sale nada (y la fecha de la próxima dice cuándo
 * volver). Solo si no hay nada de eso se habla de lo ya hecho.
 */
function razonSinNada(
  alumno: AlumnoLote,
  cuenta: { despues: number; proxima: string | null; sinSaldo: number; hechos: number },
): OmitidoPlan {
  const base = { estudianteId: alumno.id, nombre: alumno.nombre, cargoIds: [] as number[] };
  if (cuenta.despues > 0) {
    return {
      ...base, motivo: 'despues-del-corte',
      detalle: cuenta.proxima
        ? `Sus cuotas pendientes se emiten después del corte (la próxima, el ${fmtFechaCorta(cuenta.proxima)}).`
        : 'Sus cuotas pendientes se emiten después del corte.',
    };
  }
  if (cuenta.sinSaldo > 0) {
    return { ...base, motivo: 'sin-saldo', detalle: 'Sus cargos no tienen saldo que cobrar (beca total): no hay nada que facturar.' };
  }
  if (cuenta.hechos > 0) {
    return { ...base, motivo: 'ya-facturado', detalle: 'Lo de estos conceptos ya está facturado o pagado.' };
  }
  return { ...base, motivo: 'sin-cargos', detalle: 'No tiene esos conceptos en su plan, o sus cuotas se emiten después del corte. Para agregárselos, usa «Servicios por alumno».' };
}

/**
 * Decide qué facturas salen.
 *
 * De cada cargo de los conceptos elegidos mira, en este orden:
 *   - anulado → no existe, ni se cuenta;
 *   - ya tiene factura, o ya está pagado → «ya hecho» (nunca se factura dos veces);
 *   - se emite después del corte → todavía no toca;
 *   - sin saldo → una beca total deja constancia pero no hay nada que cobrar, y
 *     una factura de RD$0 o una línea de cero en la de la familia es ruido;
 *   - si no, entra.
 *
 * Los alumnos que se quedan sin ningún cargo que entre, o sin a quién
 * facturarles, NO desaparecen: salen en `omitidos` con su razón, que es lo que
 * la persona necesita leer antes de confirmar («¿y Pedro?»).
 */
export function planearFacturasPorLote(cargos: CargoLote[], opciones: OpcionesLote): PlanLote {
  const conceptos = new Set(opciones.conceptoIds);

  const porAlumno = new Map<number, CargoLote[]>();
  for (const c of cargos) {
    if (!conceptos.has(c.conceptoId) || c.estado === 'anulado') continue;
    const lista = porAlumno.get(c.estudianteId) ?? [];
    lista.push(c);
    porAlumno.set(c.estudianteId, lista);
  }

  const omitidos: OmitidoPlan[] = [];
  /** Alumno → lo que de verdad se le va a facturar. */
  const aFacturar: { alumno: AlumnoLote; cargos: CargoLote[] }[] = [];
  const vistos = new Set<number>();

  for (const alumno of opciones.alumnos) {
    // La misma persona dos veces en la lista no puede facturarse dos veces.
    if (vistos.has(alumno.id)) continue;
    vistos.add(alumno.id);

    const entran: CargoLote[] = [];
    const cuenta = { despues: 0, proxima: null as string | null, sinSaldo: 0, hechos: 0 };

    for (const c of porAlumno.get(alumno.id) ?? []) {
      if (c.ecfDocumentId != null || !COBRABLES.includes(c.estado)) { cuenta.hechos += 1; continue; }
      if (c.fechaEmision > opciones.hasta) {
        cuenta.despues += 1;
        if (cuenta.proxima === null || c.fechaEmision < cuenta.proxima) cuenta.proxima = c.fechaEmision;
        continue;
      }
      if (c.saldoCentavos <= 0) { cuenta.sinSaldo += 1; continue; }
      entran.push(c);
    }

    if (entran.length === 0) { omitidos.push(razonSinNada(alumno, cuenta)); continue; }

    // Sin responsable el cargo existe pero no hay a quién ponerle la factura.
    // Se dice con el conteo: es un problema de la ficha, no de este envío.
    if (alumno.clienteId == null) {
      omitidos.push({
        estudianteId: alumno.id,
        nombre: alumno.nombre,
        motivo: 'sin-responsable',
        detalle: `Tiene ${entran.length === 1 ? '1 cargo' : `${entran.length} cargos`} por facturar, pero no tiene responsable de pago.`,
        cargoIds: entran.map((c) => c.id),
      });
      continue;
    }

    aFacturar.push({ alumno, cargos: [...entran].sort(porFecha) });
  }

  // ── Agrupar: un alumno por factura, o un responsable por factura ──────────
  const grupos = new Map<string, { clienteId: number; alumnos: AlumnoLote[]; cargos: { alumno: AlumnoLote; cargo: CargoLote }[] }>();
  for (const { alumno, cargos: suyos } of aFacturar) {
    const clave = opciones.juntarHermanos ? `r:${alumno.clienteId}` : `e:${alumno.id}`;
    const grupo = grupos.get(clave) ?? { clienteId: alumno.clienteId!, alumnos: [], cargos: [] };
    grupo.alumnos.push(alumno);
    for (const cargo of suyos) grupo.cargos.push({ alumno, cargo });
    grupos.set(clave, grupo);
  }

  const facturas: FacturaPlan[] = [...grupos].map(([clave, g]) => {
    const lineas: LineaPlan[] = g.cargos.map(({ alumno, cargo }) => ({
      cargoId: cargo.id,
      estudianteId: alumno.id,
      estudiante: alumno.nombre,
      concepto: cargo.conceptoNombre,
      mes: cargo.mes,
      anio: cargo.anio,
      saldoCentavos: cargo.saldoCentavos,
      fechaVencimiento: cargo.fechaVencimiento,
    }));
    return {
      clave,
      clienteId: g.clienteId,
      responsable: g.alumnos[0].responsable,
      estudiantes: g.alumnos.map((a) => ({ id: a.id, nombre: a.nombre })),
      lineas,
      cargoIds: lineas.map((l) => l.cargoId),
      totalCentavos: lineas.reduce((n, l) => n + l.saldoCentavos, 0),
    };
  });

  // Por familia o por alumno según se junte, en orden alfabético: es como la
  // secretaria busca a quien tiene delante.
  facturas.sort((a, b) => alfabetico(
    opciones.juntarHermanos ? (a.responsable ?? a.estudiantes[0].nombre) : a.estudiantes[0].nombre,
    opciones.juntarHermanos ? (b.responsable ?? b.estudiantes[0].nombre) : b.estudiantes[0].nombre,
  ));
  omitidos.sort((a, b) => alfabetico(a.nombre, b.nombre));

  return {
    facturas,
    omitidos,
    totalCargos: facturas.reduce((n, f) => n + f.cargoIds.length, 0),
    totalCentavos: facturas.reduce((n, f) => n + f.totalCentavos, 0),
  };
}

/* ------------------------------------------------------------------ */
/*  La petición                                                        */
/* ------------------------------------------------------------------ */

/** Lo que manda la pantalla, ya leído y saneado. */
export interface PeticionLote {
  periodoId: number | null;
  estudianteIds: number[];
  conceptoIds: number[];
  hasta: string;
  juntarHermanos: boolean;
  /** false = vista previa (no escribe) · true = crear de verdad. */
  confirmar: boolean;
}

function idsEnteros(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const ids = v.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return [...new Set(ids)];
}

const esFecha = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

/**
 * Lee el cuerpo de la petición. Estricto a propósito: esto termina creando
 * documentos, y una lista que no es lo que parece (un `null`, un texto) se
 * rechaza en vez de leerse como «todos».
 */
export function leerPeticionLote(
  cuerpo: unknown, hoy: string,
): { ok: true; datos: PeticionLote } | { ok: false; error: string } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>;

  const estudianteIds = idsEnteros(c.estudianteIds);
  if (!estudianteIds || estudianteIds.length === 0) {
    return { ok: false, error: 'Marca al menos un alumno.' };
  }
  if (estudianteIds.length > MAX_ALUMNOS_POR_PETICION) {
    return { ok: false, error: `Son demasiados alumnos de una vez (máximo ${MAX_ALUMNOS_POR_PETICION}).` };
  }

  const conceptoIds = idsEnteros(c.conceptoIds);
  if (!conceptoIds || conceptoIds.length === 0) {
    return { ok: false, error: 'Marca al menos un concepto.' };
  }
  if (conceptoIds.length > MAX_CONCEPTOS_POR_PETICION) {
    return { ok: false, error: `Son demasiados conceptos de una vez (máximo ${MAX_CONCEPTOS_POR_PETICION}).` };
  }

  // Sin fecha se corta en hoy —lo ya emitido—, no en «todo»: facturar cuotas
  // que todavía no se emiten tiene que pedirse a propósito.
  const hasta = c.hasta === undefined || c.hasta === null ? hoy : c.hasta;
  if (!esFecha(hasta)) return { ok: false, error: 'La fecha de corte debe ser YYYY-MM-DD.' };

  const periodoId = c.periodoId === undefined || c.periodoId === null ? null : Number(c.periodoId);
  if (periodoId !== null && (!Number.isInteger(periodoId) || periodoId <= 0)) {
    return { ok: false, error: 'El año escolar no es válido.' };
  }

  return {
    ok: true,
    datos: {
      periodoId,
      estudianteIds,
      conceptoIds,
      hasta,
      juntarHermanos: c.juntarHermanos === true,
      confirmar: c.confirmar === true,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Lo que contesta el servidor                                        */
/* ------------------------------------------------------------------ */

/** Una factura que se creó. */
export interface FacturaCreada {
  clave: string;
  documentoId: number;
  codigo: string;
  /** El total REAL de la factura, con el ITBIS que llevara. */
  montoCentavos: number;
  estudiantes: { id: number; nombre: string }[];
  responsable: string | null;
  cargos: number;
}

/** Una factura que tocaba crear y no salió. */
export interface FacturaFallida {
  clave: string;
  estudiantes: { id: number; nombre: string }[];
  responsable: string | null;
  motivo: string;
  detalle: string;
  /** Otra persona (o el cron) facturó esos cargos entre la vista previa y el clic. */
  yaFacturados: boolean;
}

export interface RespuestaLote {
  confirmar: boolean;
  periodo: string;
  hasta: string;
  juntarHermanos: boolean;
  plan: PlanLote;
  /** Solo al crear. */
  creadas?: FacturaCreada[];
  fallidas?: FacturaFallida[];
}

/* ------------------------------------------------------------------ */
/*  Lo que la pantalla ofrece para elegir                              */
/* ------------------------------------------------------------------ */

/** Un alumno matriculado, con lo justo para reconocerlo y filtrarlo. */
export interface AlumnoCatalogo {
  estudianteId: number;
  nombre: string;
  codigo: string | null;
  servicioId: number | null;
  /** Con la tanda: «Primaria · Matutina». */
  servicio: string | null;
  gradoId: number | null;
  grado: string | null;
  cursoId: number | null;
  seccion: string | null;
  responsableId: number | null;
  responsable: string | null;
  /** Cargos cobrables sin factura y con saldo, de todos los conceptos. */
  sinFactura: number;
  sinFacturaCentavos: number;
}

export interface ConceptoCatalogo {
  id: number;
  nombre: string;
  tipo: string;
  /** Cuántos cargos cobrables sin factura tiene este concepto en el año. */
  sinFactura: number;
  sinFacturaCentavos: number;
}

export interface FiltroAlumnos {
  gradoId: number | null;
  cursoId: number | null;
  texto: string;
  /** Solo los que tienen algo sin factura. */
  soloConPendientes: boolean;
}

export const SIN_FILTRO: FiltroAlumnos = { gradoId: null, cursoId: null, texto: '', soloConPendientes: false };

/** Minúsculas y sin tildes: «jose» encuentra «José». */
function plano(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Los alumnos que se ven con los filtros puestos. La búsqueda mira el nombre,
 * el código y el responsable: con trescientos alumnos, a veces lo único que se
 * tiene a mano es «el hijo de la señora Gómez».
 */
export function filtrarAlumnos(alumnos: AlumnoCatalogo[], f: FiltroAlumnos): AlumnoCatalogo[] {
  const q = plano(f.texto);
  return alumnos.filter((a) => {
    if (f.gradoId != null && a.gradoId !== f.gradoId) return false;
    if (f.cursoId != null && a.cursoId !== f.cursoId) return false;
    if (f.soloConPendientes && a.sinFactura === 0) return false;
    if (!q) return true;
    return [a.nombre, a.codigo, a.responsable].some((t) => t && plano(t).includes(q));
  });
}

/**
 * Los grados que hay entre los alumnos, con su servicio cuando el colegio tiene
 * más de uno: «Primero» de Primaria y «Primero» de Secundaria no son lo mismo.
 */
export function opcionesDeGrado(alumnos: AlumnoCatalogo[]): { id: number; etiqueta: string }[] {
  const servicios = new Set(alumnos.map((a) => a.servicioId).filter((x) => x != null));
  const vistos = new Map<number, string>();
  for (const a of alumnos) {
    if (a.gradoId == null || !a.grado || vistos.has(a.gradoId)) continue;
    vistos.set(a.gradoId, servicios.size > 1 && a.servicio ? `${a.grado} · ${a.servicio}` : a.grado);
  }
  return [...vistos].map(([id, etiqueta]) => ({ id, etiqueta })).sort((x, y) => alfabetico(x.etiqueta, y.etiqueta));
}

/** Las secciones del grado elegido (sin grado elegido, ninguna: no hay qué ofrecer). */
export function opcionesDeSeccion(alumnos: AlumnoCatalogo[], gradoId: number | null): { id: number; etiqueta: string }[] {
  if (gradoId == null) return [];
  const vistos = new Map<number, string>();
  for (const a of alumnos) {
    if (a.gradoId !== gradoId || a.cursoId == null || !a.seccion || vistos.has(a.cursoId)) continue;
    vistos.set(a.cursoId, a.seccion);
  }
  return [...vistos].map(([id, etiqueta]) => ({ id, etiqueta })).sort((x, y) => alfabetico(x.etiqueta, y.etiqueta));
}

/** Marca o desmarca VARIOS a la vez sin tocar al resto. Devuelve un `Set` nuevo. */
export function marcarVarios(marcados: Set<number>, ids: number[], marcar: boolean): Set<number> {
  const siguiente = new Set(marcados);
  for (const id of ids) {
    if (marcar) siguiente.add(id); else siguiente.delete(id);
  }
  return siguiente;
}

/**
 * Cómo está la casilla de «seleccionar todos los filtrados»: marcada solo si
 * están marcados TODOS los que se ven, a medias si algunos.
 */
export function estadoDeLaCasilla(visibles: { estudianteId: number }[], marcados: Set<number>): 'ninguno' | 'algunos' | 'todos' {
  if (visibles.length === 0) return 'ninguno';
  const n = visibles.filter((a) => marcados.has(a.estudianteId)).length;
  return n === 0 ? 'ninguno' : n === visibles.length ? 'todos' : 'algunos';
}

/**
 * Los motivos de los que se quedan sin factura, juntos y contados: con 300
 * alumnos marcados y 280 sin nada pendiente, una lista de 280 filas tapa las 20
 * que sí importan.
 */
export function agruparOmitidos(omitidos: OmitidoPlan[]): { motivo: MotivoOmitido; titulo: string; alumnos: OmitidoPlan[] }[] {
  // El orden es el de importancia: primero lo que se arregla en una ficha.
  const orden: MotivoOmitido[] = ['sin-responsable', 'despues-del-corte', 'sin-saldo', 'ya-facturado', 'sin-cargos'];
  const titulos: Record<MotivoOmitido, string> = {
    'sin-responsable': 'Sin responsable de pago (hay que asignárselo en su ficha)',
    'despues-del-corte': 'Sus cuotas se emiten después de la fecha de corte',
    'sin-saldo': 'Sin saldo que cobrar (beca total)',
    'ya-facturado': 'Ya está todo facturado o pagado',
    'sin-cargos': 'Sin cargos de estos conceptos',
  };
  return orden
    .map((motivo) => ({ motivo, titulo: titulos[motivo], alumnos: omitidos.filter((o) => o.motivo === motivo) }))
    .filter((g) => g.alumnos.length > 0);
}

/* ------------------------------------------------------------------ */
/*  Las frases                                                         */
/* ------------------------------------------------------------------ */

export function facturasEnLetras(n: number): string {
  return n === 1 ? '1 factura' : `${n} facturas`;
}

/** El texto del botón que crea: dice lo que va a pasar y cuántas son. */
export function textoCrear(n: number): string {
  return `Crear ${facturasEnLetras(n)} en borrador`;
}

/** Lo que contesta una petición de crear: sus facturas, o por qué no llegó. */
export type EnvioTanda =
  | { ok: true; creadas: FacturaCreada[]; fallidas: FacturaFallida[] }
  | { ok: false; error: string };

/**
 * Crea las facturas del plan que se vio, de tanda en tanda.
 *
 * Crear 80 facturas tarda minutos y una petición no aguanta tanto, así que se
 * mandan de 25 en 25 y entre una y otra se enseña el avance. Cada tanda manda
 * los alumnos de SUS facturas; el servidor recalcula el plan con ellos y, como
 * un plan solo mira a los alumnos que recibe, las facturas salen iguales a las
 * de la vista previa — también juntando hermanos, porque los hermanos de una
 * factura van todos en la misma tanda.
 *
 * Si una tanda se pierde, se para: no se sabe si llegó a crear algo, y seguir
 * con la siguiente solo enredaría. No hace falta saberlo para arreglarlo: lo
 * ya facturado nunca vuelve a entrar en un plan, así que volver a revisar
 * enseña exactamente lo que falta.
 *
 * `enviar` y `debeDetenerse` llegan de fuera para poder probar esto sin red.
 */
export async function crearPorTandas({ facturas, enviar, debeDetenerse, alAvanzar, tanda = FACTURAS_POR_TANDA }: {
  facturas: FacturaPlan[];
  enviar: (estudianteIds: number[]) => Promise<EnvioTanda>;
  debeDetenerse: () => boolean;
  alAvanzar?: (hechas: number, total: number) => void;
  tanda?: number;
}): Promise<{ creadas: FacturaCreada[]; fallidas: FacturaFallida[]; procesadas: number; interrumpido: string | null }> {
  const creadas: FacturaCreada[] = [];
  const fallidas: FacturaFallida[] = [];
  let hechas = 0;
  let interrumpido: string | null = null;
  alAvanzar?.(0, facturas.length);

  for (const grupo of dividirEnTandas(facturas, tanda)) {
    if (debeDetenerse()) {
      interrumpido = `Te detuviste a mitad: faltan ${facturasEnLetras(facturas.length - hechas)} por revisar.`;
      break;
    }
    const estudianteIds = [...new Set(grupo.flatMap((f) => f.estudiantes.map((e) => e.id)))];
    let envio: EnvioTanda;
    try {
      envio = await enviar(estudianteIds);
    } catch {
      envio = { ok: false, error: 'Se cortó la conexión a mitad. Lo ya creado se conserva y no se duplica: revisa de nuevo para ver lo que falta.' };
    }
    if (!envio.ok) { interrumpido = envio.error; break; }
    creadas.push(...envio.creadas);
    fallidas.push(...envio.fallidas);
    hechas += grupo.length;
    alAvanzar?.(hechas, facturas.length);
  }

  return { creadas, fallidas, procesadas: hechas, interrumpido };
}

/** Parte una lista en tandas del mismo tamaño (la última, la que sobre). */
export function dividirEnTandas<T>(items: T[], tanda = FACTURAS_POR_TANDA): T[][] {
  const tandas: T[][] = [];
  for (let i = 0; i < items.length; i += tanda) tandas.push(items.slice(i, i + tanda));
  return tandas;
}

/** «septiembre de 2026» o, sin mes, solo el año: así se rotula una línea. */
const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function periodoDeLinea(mes: number | null, anio: number): string {
  return mes ? `${MESES[mes] ?? ''} ${anio}` : String(anio);
}

/** La fecha de corte dicha con palabras, para repetirla en la confirmación. */
export function corteEnLetras(hasta: string): string {
  return fechaEnLetras(hasta) || hasta;
}
