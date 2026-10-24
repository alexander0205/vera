/**
 * Cuánto sugerir en «Agregar cargo» de la ficha del alumno.
 *
 * El formulario pedía el monto en blanco aunque el colegio ya tuviera el
 * precio configurado para el curso del alumno: había que ir a Tarifas, buscar
 * el grado y copiarlo a mano. Aquí se calcula lo mismo que cobraría el plan,
 * para que el campo salga lleno y la secretaria solo lo cambie si es un caso
 * aparte.
 *
 * Sin base de datos: la ruta `matriculas/[id]/precio` resuelve la tarifa y el
 * calendario, y esto decide qué número se pone. Pruebas en
 * `tests/unit/precio-cargo-individual.test.ts`.
 */
import { cuotasDeLaTarifa, montosPorCuota, precioEsPorCuota } from './repartir';
import type { OrigenTarifa } from './tarifas';

export interface CuotaDelConcepto {
  /** Id de la cuota del calendario; el cargo se ata a ella. */
  id?: number;
  etiqueta: string;
  /** Mes en que se emite (1-12), o null si es un pago sin mes. */
  mes: number | null;
  porcentajeMilesimas: number;
  /** El alumno ya tiene un cargo vivo de esta cuota. */
  cargada?: boolean;
}

export interface SugerenciaDeMonto {
  /** Lo que se rellena en el campo «Monto». */
  montoCentavos: number;
  /** La tarifa tal como está configurada (el total del año si se reparte). */
  tarifaCentavos: number;
  origen: OrigenTarifa;
  /** La cuota que representa este cargo, cuando la tarifa se reparte. */
  cuota: { id?: number; etiqueta: string; de: number } | null;
}

/**
 * El monto de UN cargo de este concepto para este alumno.
 *
 * Misma regla que `armarPlanDeCobro`: la colegiatura cobra la tarifa entera en
 * cada cuota; lo demás toma la tarifa como el total del año y la reparte. Una
 * evaluación de RD$600 en tres cuotas es un cargo de RD$200, no de RD$600.
 *
 * Si el concepto se reparte, la cuota es la que eligió la secretaria; si no
 * eligió, la del mes del cargo que aún no tenga cargo, luego la primera que no
 * lo tenga, y si todas lo tienen, la del mes o la primera.
 */
export function sugerirMontoDelCargo(
  tipoDeConcepto: string,
  tarifa: { montoCentavos: number; origen: OrigenTarifa; cuotas?: number | null } | null,
  todasLasCuotas: CuotaDelConcepto[],
  mes: number | null,
  elegida: number | null = null,
  /** Lo que dijo el colegio en el concepto; sin él decide el tipo (`precioEsPorCuota`). */
  precioPorCuota: boolean | null = null,
): SugerenciaDeMonto | null {
  if (!tarifa) return null;
  // Las cuotas que cobra esta tarifa (un grado puede pagar 10 de 11).
  const cuotas = cuotasDeLaTarifa(todasLasCuotas, tarifa.cuotas);
  const base = { tarifaCentavos: tarifa.montoCentavos, origen: tarifa.origen };
  if (precioEsPorCuota({ tipo: tipoDeConcepto, precioPorCuota }) || cuotas.length <= 1) {
    return { ...base, montoCentavos: tarifa.montoCentavos, cuota: null };
  }
  const montos = montosPorCuota(
    tipoDeConcepto, tarifa.montoCentavos, cuotas.map((c) => c.porcentajeMilesimas), precioPorCuota);
  const i = indiceCuota(cuotas, mes, elegida);
  return {
    ...base,
    montoCentavos: montos[i],
    cuota: { ...(cuotas[i].id != null ? { id: cuotas[i].id } : {}), etiqueta: cuotas[i].etiqueta, de: cuotas.length },
  };
}

function indiceCuota(cuotas: CuotaDelConcepto[], mes: number | null, elegida: number | null): number {
  const candidatos = [
    (c: CuotaDelConcepto) => elegida != null && c.id === elegida,
    (c: CuotaDelConcepto) => mes != null && c.mes === mes && !c.cargada,
    (c: CuotaDelConcepto) => !c.cargada,
    (c: CuotaDelConcepto) => mes != null && c.mes === mes,
  ];
  for (const regla of candidatos) {
    const i = cuotas.findIndex(regla);
    if (i >= 0) return i;
  }
  return 0;
}

/** De dónde sale el precio, dicho como lo diría la secretaria. */
export function deDondeSaleElPrecio(origen: OrigenTarifa): string {
  switch (origen) {
    case 'estudiante': return 'su precio personal';
    case 'beca':       return 'su beca';
    case 'seccion':    return 'su sección';
    case 'grado':      return 'su grado';
    case 'servicio':   return 'su servicio';
  }
}
