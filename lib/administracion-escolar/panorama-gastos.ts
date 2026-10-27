/**
 * Panorama de gastos y ganancias del colegio.
 *
 * Lizandro quiere ver «lo que de verdad queda»: lo cobrado menos lo que
 * cuesta el colegio. El Panorama solo enseñaba lo que entra; esto pone al lado
 * lo que sale, por mes y por tipo, y la resta.
 *
 * Tres tipos de gasto, que son las tres puertas por las que sale el dinero:
 *
 *   · Nómina  — cada corrida aprobada o pagada: salarios + aportes patronales
 *               a la TSS + INFOTEP. Es lo que le cuesta el personal al colegio,
 *               no lo que recibe el empleado (que es el neto).
 *   · Gastos  — lo registrado en Facturación › Gastos (luz, alquiler, honorarios…).
 *   · Compras — mercancía para el inventario (uniformes, libros para vender).
 *
 * Ganancia = lo que entró en caja ese mes − lo que salió. La proyectada usa lo
 * que se espera cobrar del mes (lo devengado) y, del mes que corre en adelante,
 * una nómina estimada igual a la del último mes cerrado: el colegio no aprueba
 * la nómina de mayo en octubre, pero sabe que la va a pagar.
 *
 * Puro: lo usan la ruta y los tests. Las consultas están en `panorama-gastos-datos.ts`.
 */

export type TipoGasto = 'nomina' | 'gastos' | 'compras';

export const ETIQUETA_TIPO_GASTO: Record<TipoGasto, string> = {
  nomina: 'Nómina',
  gastos: 'Gastos',
  compras: 'Compras',
};

/** Lo que devuelven las consultas: una suma por mes y tipo. */
export interface FilaGastoMes { key: string; tipo: TipoGasto; centavos: number }

export interface GastoMes {
  /** `YYYY-MM`. */
  key: string;
  nominaCentavos: number;
  gastosCentavos: number;
  comprasCentavos: number;
  totalCentavos: number;
  /**
   * La nómina de este mes no está aprobada (o no toda) y se estimó con la del
   * último mes cerrado. Solo en el mes que corre y los que vienen.
   */
  nominaEstimada: boolean;
}

/** Lo que trae la serie del Panorama de cada mes (ver `PuntoMensual`). */
export interface IngresoMes { key: string; cajaCentavos: number; devengadoCentavos: number }

export interface GananciaMes {
  key: string;
  /** Lo que entró en caja ese mes. */
  ingresosCentavos: number;
  /** Lo que se espera cobrar de ese mes (las cuotas del mes). */
  ingresosProyectadosCentavos: number;
  gastosCentavos: number;
  /** Caja − gastos. Solo dice algo en los meses que ya pasaron o corren. */
  gananciaCentavos: number;
  /** Lo esperado − gastos (con la nómina estimada en los meses que vienen). */
  gananciaProyectadaCentavos: number;
  transcurrido: boolean;
  nominaEstimada: boolean;
}

export interface ResumenGanancias {
  meses: GananciaMes[];
  /** Lo que va del año: solo los meses transcurridos. */
  hastaHoy: { ingresosCentavos: number; gastosCentavos: number; gananciaCentavos: number };
  /** El año completo, con lo esperado y la nómina estimada. */
  proyectado: { ingresosCentavos: number; gastosCentavos: number; gananciaCentavos: number };
}

const n = (v: unknown): number => (v == null ? 0 : Math.round(Number(v)) || 0);

/**
 * Los meses del año escolar, de su primer a su último mes, como `YYYY-MM`.
 * Sin fechas, los doce que terminan tres meses después de hoy.
 */
export function mesesDelPeriodo(
  periodo: { fechaInicio?: string | null; fechaFin?: string | null }, hoy: string,
): string[] {
  const aClave = (f: string) => { const [a, m] = f.split('-').map(Number); return a * 12 + (m - 1); };
  let ini: number; let fin: number;
  if (periodo.fechaInicio && periodo.fechaFin && periodo.fechaInicio <= periodo.fechaFin) {
    ini = aClave(periodo.fechaInicio); fin = aClave(periodo.fechaFin);
  } else {
    fin = aClave(hoy) + 3; ini = fin - 11;
  }
  const meses: string[] = [];
  for (let k = ini; k <= fin && meses.length < 24; k++) {
    meses.push(`${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`);
  }
  return meses;
}

/**
 * Los gastos de cada mes del año, por tipo.
 *
 * Un mes que no ha llegado y no tiene nómina aprobada lleva la de la última
 * corrida (`nominaEstimada`): sin ella, la ganancia de mayo saldría inflada por
 * todo el sueldo del personal.
 */
export function armarGastos(filas: FilaGastoMes[], meses: string[], hoy: string): GastoMes[] {
  const esteMes = hoy.slice(0, 7);
  const por = new Map<string, { nomina: number; gastos: number; compras: number }>();
  for (const f of filas) {
    const x = por.get(f.key) ?? { nomina: 0, gastos: 0, compras: 0 };
    x[f.tipo] += n(f.centavos);
    por.set(f.key, x);
  }
  // La nómina que se repite: la del último mes ya cerrado (completo, con sus
  // dos quincenas). Si no hay ninguno, la de este mes.
  const conNomina = (hasta: (k: string) => boolean) => [...por]
    .filter(([k, x]) => hasta(k) && x.nomina > 0).sort(([a], [b]) => a.localeCompare(b)).at(-1)?.[1].nomina ?? 0;
  const ultimaNomina = conNomina((k) => k < esteMes) || conNomina((k) => k === esteMes);

  return meses.map((key) => {
    const x = por.get(key) ?? { nomina: 0, gastos: 0, compras: 0 };
    // Este mes y los que vienen: lo aprobado, o la nómina de siempre si aún no
    // está toda (la primera quincena aprobada no es el mes entero).
    const estimar = key >= esteMes && x.nomina < ultimaNomina;
    const nomina = estimar ? ultimaNomina : x.nomina;
    return {
      key,
      nominaCentavos: nomina,
      gastosCentavos: x.gastos,
      comprasCentavos: x.compras,
      totalCentavos: nomina + x.gastos + x.compras,
      nominaEstimada: estimar,
    };
  });
}

/** Ingresos − gastos, mes a mes, y los dos totales: lo que va y el año entero. */
export function armarGanancias(ingresos: IngresoMes[], gastos: GastoMes[], hoy: string): ResumenGanancias {
  const esteMes = hoy.slice(0, 7);
  const deIngresos = new Map(ingresos.map((i) => [i.key, i]));
  const meses: GananciaMes[] = gastos.map((g) => {
    const i = deIngresos.get(g.key);
    const caja = n(i?.cajaCentavos);
    const esperado = n(i?.devengadoCentavos);
    return {
      key: g.key,
      ingresosCentavos: caja,
      ingresosProyectadosCentavos: esperado,
      gastosCentavos: g.totalCentavos,
      gananciaCentavos: caja - g.totalCentavos,
      gananciaProyectadaCentavos: esperado - g.totalCentavos,
      transcurrido: g.key <= esteMes,
      nominaEstimada: g.nominaEstimada,
    };
  });

  const suma = (xs: GananciaMes[], f: (m: GananciaMes) => number) => xs.reduce((s, m) => s + f(m), 0);
  const pasados = meses.filter((m) => m.transcurrido);
  const ingresosHoy = suma(pasados, (m) => m.ingresosCentavos);
  const gastosHoy = suma(pasados, (m) => m.gastosCentavos);
  const ingresosAnio = suma(meses, (m) => m.ingresosProyectadosCentavos);
  const gastosAnio = suma(meses, (m) => m.gastosCentavos);
  return {
    meses,
    hastaHoy: { ingresosCentavos: ingresosHoy, gastosCentavos: gastosHoy, gananciaCentavos: ingresosHoy - gastosHoy },
    proyectado: { ingresosCentavos: ingresosAnio, gastosCentavos: gastosAnio, gananciaCentavos: ingresosAnio - gastosAnio },
  };
}

/** Lo que el año lleva por tipo, sin estimaciones: lo que de verdad salió. */
export function totalesPorTipo(gastos: GastoMes[]): { tipo: TipoGasto; centavos: number }[] {
  const reales = gastos.map((g) => (g.nominaEstimada ? { ...g, nominaCentavos: 0 } : g));
  return (['nomina', 'gastos', 'compras'] as const).map((tipo) => ({
    tipo,
    centavos: reales.reduce((s, g) => s + (tipo === 'nomina' ? g.nominaCentavos : tipo === 'gastos' ? g.gastosCentavos : g.comprasCentavos), 0),
  }));
}
