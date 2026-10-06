/**
 * El «mes a mes» del panorama financiero: qué meses se enseñan y con qué cifra.
 *
 * Vive aparte de `dashboard.ts` por lo mismo que `cartera.ts`: ese módulo es
 * `server-only` —abre la base— y esto lo necesitan los dos lados. El servidor
 * arma la serie; la pantalla usa los mismos nombres de mes y la misma regla
 * para saber si un `?mes=` de la URL es un mes de verdad.
 *
 * Sin base de datos: recibe las filas ya sumadas y devuelve los puntos.
 */

/** Un mes de la serie. Todas las cifras son de los cargos DE ese mes. */
export interface PuntoMensual {
  /** `YYYY-MM`. */
  key: string;
  mes: number;
  anio: number;
  /** Lo que se esperaba cobrar de ese mes. */
  devengadoCentavos: number;
  /** De eso, lo cobrado: `monto − saldo`. */
  cobradoCentavos: number;
  /** De eso, lo que falta. */
  pendienteCentavos: number;
  /**
   * Lo que ENTRÓ en caja durante ese mes, sea de la cuota que sea.
   *
   * No es lo mismo que `cobradoCentavos`: la colegiatura de septiembre pagada
   * el 3 de octubre es «cobrado» de septiembre y «caja» de octubre.
   */
  cajaCentavos: number;
  /** El mes ya llegó (o es el que corre). */
  transcurrido: boolean;
  /** Es el mes de hoy. */
  enCurso: boolean;
  /**
   * Cae fuera de las fechas del año escolar.
   *
   * Pasa con la inscripción, que se cobra en agosto para un año que empieza en
   * septiembre. Se enseña igual: el dinero es de este año aunque el mes no.
   */
  fueraDelAnio: boolean;
}

export interface FilaSerie { key: string | null; devengado: unknown; cobrado: unknown }
export interface FilaCaja { key: string | null; centavos: unknown }

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `SUM(...)` de Postgres vuelve como `string` (es `bigint`) o `null`. */
const n = (v: unknown): number => (v == null ? 0 : Number(v));

/** `2026-10` si lo es; `null` con cualquier otra cosa. Lo que llega por URL no se cree. */
export function normalizarMes(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim();
  return MES_VALIDO.test(v) ? v : null;
}

const NOMBRES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «octubre 2026». En minúscula: quien lo pone al principio de frase lo sube. */
export function nombreDeMes(key: string): string {
  const [anio, mes] = key.split('-').map(Number);
  return `${NOMBRES[mes] ?? key} ${anio}`;
}

/** «oct». Para la gráfica, donde no cabe más. */
export function mesCorto(mes: number): string {
  return (NOMBRES[mes] ?? '').slice(0, 3);
}

/** Claves `YYYY-MM` de `desde` a `hasta`, ambas incluidas. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const [a1, m1] = desde.split('-').map(Number);
  const [a2, m2] = hasta.split('-').map(Number);
  const total = (a2 * 12 + m2) - (a1 * 12 + m1);
  if (!Number.isFinite(total) || total < 0) return [];
  return Array.from({ length: total + 1 }, (_, i) => {
    const idx = a1 * 12 + (m1 - 1) + i;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  });
}

export interface SerieArmada {
  puntos: PuntoMensual[];
  /**
   * Cargos sin mes y sin vencimiento: existen, se deben, y no caben en ninguna
   * columna. Van aparte para que la suma de la tabla siga dando el total.
   */
  sinMes: { devengadoCentavos: number; cobradoCentavos: number; pendienteCentavos: number };
}

/**
 * De las filas sumadas a los meses que se pintan.
 *
 * Dos cosas que hace además de ordenar:
 *
 *  · Rellena los meses del año escolar que no devolvieron fila. Un mes sin
 *    cargos no es un hueco que la gráfica pueda saltarse: omitir la barra hace
 *    que la serie parezca continua cuando no lo es.
 *
 *  · NO tira los meses con dinero que caen fuera del año. Se tiraban: la serie
 *    recorría solo de la fecha de inicio a la de fin, y un colegio que cobra la
 *    inscripción en agosto para un año que arranca en septiembre perdía de la
 *    gráfica justo el mes en que más había entrado.
 */
export function armarSerie(
  filas: FilaSerie[],
  caja: FilaCaja[],
  fechaInicio: string | null,
  fechaFin: string | null,
  hoy: string,
): SerieArmada {
  const mesActual = hoy.slice(0, 7);
  const sinMes = { devengadoCentavos: 0, cobradoCentavos: 0, pendienteCentavos: 0 };

  const porKey = new Map<string, { devengado: number; cobrado: number }>();
  for (const f of filas) {
    const devengado = n(f.devengado);
    const cobrado = n(f.cobrado);
    const key = normalizarMes(f.key);
    if (!key) {
      sinMes.devengadoCentavos += devengado;
      sinMes.cobradoCentavos += cobrado;
      continue;
    }
    const previo = porKey.get(key) ?? { devengado: 0, cobrado: 0 };
    porKey.set(key, { devengado: previo.devengado + devengado, cobrado: previo.cobrado + cobrado });
  }
  sinMes.pendienteCentavos = sinMes.devengadoCentavos - sinMes.cobradoCentavos;

  const cajaPorKey = new Map<string, number>();
  for (const f of caja) {
    const key = normalizarMes(f.key);
    if (key) cajaPorKey.set(key, (cajaPorKey.get(key) ?? 0) + n(f.centavos));
  }

  const delAnio = fechaInicio && fechaFin
    ? mesesEntre(fechaInicio.slice(0, 7), fechaFin.slice(0, 7))
    : [];
  const dentro = new Set(delAnio);

  // Los del calendario, más cualquier otro mes que tenga cargos o en el que
  // haya entrado dinero. El segundo caso también cuenta: la inscripción que se
  // pagó en julio no tiene cuota «de julio», pero si ese mes no sale, la
  // columna de caja deja de sumar lo que de verdad se recibió.
  const claves = [...new Set([...delAnio, ...porKey.keys(), ...cajaPorKey.keys()])].sort();

  return {
    puntos: claves.map((key) => {
      const f = porKey.get(key);
      const [anio, mes] = key.split('-').map(Number);
      const devengado = f?.devengado ?? 0;
      const cobrado = f?.cobrado ?? 0;
      return {
        key, mes, anio,
        devengadoCentavos: devengado,
        cobradoCentavos: cobrado,
        pendienteCentavos: devengado - cobrado,
        cajaCentavos: cajaPorKey.get(key) ?? 0,
        transcurrido: key <= mesActual,
        enCurso: key === mesActual,
        // Sin fechas de año escolar no hay «fuera»: se enseña lo que haya.
        fueraDelAnio: delAnio.length > 0 && !dentro.has(key),
      };
    }),
    sinMes,
  };
}
