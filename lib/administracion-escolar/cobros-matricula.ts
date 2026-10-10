/**
 * Lo que se le cobra a UNA matrícula, contado por concepto.
 *
 * «Editar matrícula» enseñaba dos listas —arriba los conceptos que el sistema
 * le carga por su cuenta, abajo los trece cargos del año, mes por mes— y se
 * leían como la misma cosa contada dos veces. Ahora es UNA lista de conceptos:
 * cada fila dice cuánto se le cobra por él, y desde ahí se le cambia el
 * precio, se le quita o se le agrega otro. El detalle mes por mes vive en la
 * ficha del estudiante.
 *
 * Aquí están las reglas de esa lista: qué filas salen, qué precio enseña cada
 * una, a qué cargos alcanza un cambio de precio y cuáles se pueden quitar. Lo
 * único que se toca son los cargos SIN factura: uno facturado vale lo que diga
 * su factura, y el servidor lo vuelve a comprobar cargo por cargo.
 *
 * Un límite que hay que tener presente al escribir textos con esto: la
 * frecuencia es lo que el colegio le puso al concepto, y el motor no la mira.
 * Mira si el concepto tiene cuotas de calendario en el año. Por eso aquí nada
 * promete lo que el motor va a hacer: se dice el ritmo que tiene puesto.
 *
 * TypeScript puro, sin React ni base de datos: lo usa un componente de cliente
 * y lo prueba vitest sin montar nada.
 */

import { ETIQUETA_FRECUENCIA, esFrecuencia, type Frecuencia } from './calendario';

/**
 * «cada mes», «cada tres meses», «una sola vez»… en minúscula, para ir detrás
 * del nombre del concepto o de «Se cobra…».
 *
 * `null` cuando no se sabe (un concepto que ya no está en el catálogo, una
 * respuesta vieja sin el campo): se calla en vez de inventar un ritmo. Decir
 * «cada mes» de algo que el sistema cobra una vez es peor que no decir nada.
 */
export function cadaCuanto(frecuencia: unknown): string | null {
  return esFrecuencia(frecuencia) ? ETIQUETA_FRECUENCIA[frecuencia].toLowerCase() : null;
}

/**
 * Los conceptos en los dos montones que distingue la ficha del alumno: las
 * mensualidades —se cobran por mes, y al agregarlas hay que decir cuál— y los
 * demás cargos. Con los mismos nombres que sus dos pestañas.
 *
 * Dentro de cada montón se respeta el orden en que llegan. Sin grupos vacíos:
 * un título sin opciones debajo solo estorba.
 */
export function conceptosPorClase<T extends { tipo?: unknown }>(
  conceptos: T[],
): { titulo: string; conceptos: T[] }[] {
  return [
    { titulo: 'Mensualidades', conceptos: conceptos.filter((c) => c.tipo === 'mensualidad') },
    { titulo: 'Otros cargos', conceptos: conceptos.filter((c) => c.tipo !== 'mensualidad') },
  ].filter((g) => g.conceptos.length > 0);
}

/** Lo que la lista lee de cada cargo de la matrícula. */
export interface CargoDeMatricula {
  id: number;
  concepto: string | null;
  conceptoId?: number | null;
  /** La cuota del calendario de la que nació. Nulo en lo puesto a mano. */
  cuotaId?: number | null;
  montoCentavos: number;
  saldoCentavos: number;
  estado: string;
  /** Con factura detrás, el cargo ya no se toca desde aquí. */
  ecfDocumentId?: number | null;
}

/**
 * Lo que el sistema le carga por su cuenta a esta matrícula, DE VERDAD.
 *
 * Normalmente es la lista guardada. Pero una matrícula antigua puede tenerla
 * vacía y seguir cobrando: el devengo, con la lista vacía, sigue con todo
 * concepto del que ya exista un cargo nacido de una cuota (cuenta también los
 * anulados). Si la pantalla solo mirara la lista guardada, esos conceptos se
 * verían como cobros sueltos, «quitarlos» no los pararía, y agregarle uno
 * nuevo apagaría de golpe todos los demás.
 *
 * Con esto la pantalla los trata como lo que son, y la primera vez que guarda
 * la lista la escribe entera.
 */
export function listaEfectiva(guardados: readonly number[], cargos: readonly CargoDeMatricula[]): number[] {
  if (guardados.length > 0) return [...new Set(guardados)];
  const ids: number[] = [];
  for (const c of [...cargos].sort((x, y) => x.id - y.id)) {
    if (c.cuotaId != null && c.cuotaId > 0 && c.conceptoId != null && !ids.includes(c.conceptoId)) ids.push(c.conceptoId);
  }
  return ids;
}

/** El precio que enseña una fila. */
export type PrecioDeConcepto =
  /** Todos los cargos que mandan valen lo mismo. */
  | { clase: 'uno'; centavos: number }
  /** Hay cargos del mismo concepto con montos distintos. */
  | { clase: 'varios' }
  /** Todavía no tiene ningún cargo: el precio lo pondrá su tarifa. */
  | null;

/** Una fila de «Lo que se le cobra»: un concepto y lo que hay de él en la cuenta. */
export interface FilaDeConcepto {
  /** 0 = cargos que no tienen concepto. */
  conceptoId: number;
  nombre: string;
  /** El sistema se lo carga solo (ver `listaEfectiva`). */
  automatico: boolean;
  /** El ritmo que el colegio le puso al concepto, si se sabe. */
  frecuencia: Frecuencia | null;
  /** `mensualidad`, `inscripcion`…, si el concepto sigue en el catálogo. */
  tipo: string | null;
  /** Retirado del catálogo del colegio: ya no genera cargos nuevos. */
  deBaja: boolean;
  /** Cargos vivos (sin anular) de este concepto. */
  cargos: number;
  /** De esos, los que ya tienen factura: no se tocan desde aquí. */
  facturados: number;
  /**
   * Sin factura pero con dinero ya aplicado, o en un estado que no es
   * «pendiente»/«vencido». Tampoco se tocan: cambiarles el monto les reabriría
   * deuda, y anularlos borraría un cobro.
   */
  conAbono: number;
  /**
   * Los únicos que se tocan desde aquí: sin factura, sin un peso pagado y
   * pendientes. A estos alcanza cambiar el monto o quitar.
   */
  libresIds: number[];
  /** Los montos distintos que hay entre esos, de menor a mayor. */
  montosLibres: number[];
  /** Lo que el alumno DEBE en esos cargos: es lo que se le perdona al quitarlos. */
  debeCentavos: number;
  precio: PrecioDeConcepto;
  /** Lo que queda por pagar de todo el concepto. */
  pendienteCentavos: number;
  /** Ya se le quitaron cargos de este concepto: esos no vuelven a salir solos. */
  tieneAnulados: boolean;
}

const SE_PUEDE_TOCAR = ['pendiente', 'vencido'];

/**
 * Las filas de «Lo que se le cobra».
 *
 * Sale una por cada concepto que el sistema le carga solo (aunque todavía no
 * haya generado nada) y una por cada concepto del que ya tiene algún cargo
 * vivo —la inscripción, lo que se le puso a mano o en grupo—. Los cargos
 * anulados no hacen fila: quitar un concepto lo saca de la lista.
 *
 * Primero lo automático, en el orden de la matrícula; después lo demás, por
 * orden de llegada.
 */
export function filasDeConceptos(
  cargos: readonly CargoDeMatricula[],
  /** La lista EFECTIVA (ver `listaEfectiva`), no la guardada a secas. */
  automaticos: readonly number[],
  catalogo: readonly { id: number; nombre: string; tipo?: unknown; frecuencia?: unknown; activo?: boolean }[],
): FilaDeConcepto[] {
  const porId = new Map(catalogo.map((c) => [c.id, c]));
  const vivos = cargos.filter((c) => c.estado !== 'anulado');

  const fila = (conceptoId: number): FilaDeConcepto => {
    const suyos = vivos.filter((c) => (c.conceptoId ?? 0) === conceptoId);
    const sinFactura = suyos.filter((c) => c.ecfDocumentId == null);
    const libres = sinFactura.filter((c) =>
      SE_PUEDE_TOCAR.includes(c.estado) && c.saldoCentavos === c.montoCentavos);
    const delCatalogo = porId.get(conceptoId);
    // El precio lo dicen los cargos que todavía se pueden cambiar; si ya no
    // queda ninguno, todos, para que la fila no se quede sin cifra.
    const mandan = libres.length > 0 ? libres : suyos;
    const montos = new Set(mandan.map((c) => c.montoCentavos));
    return {
      conceptoId,
      nombre: delCatalogo?.nombre ?? suyos[0]?.concepto ?? 'Sin concepto',
      automatico: automaticos.includes(conceptoId),
      frecuencia: esFrecuencia(delCatalogo?.frecuencia) ? delCatalogo.frecuencia : null,
      tipo: typeof delCatalogo?.tipo === 'string' ? delCatalogo.tipo : null,
      deBaja: delCatalogo?.activo === false,
      cargos: suyos.length,
      facturados: suyos.length - sinFactura.length,
      conAbono: sinFactura.length - libres.length,
      libresIds: libres.map((c) => c.id),
      montosLibres: [...new Set(libres.map((c) => c.montoCentavos))].sort((x, y) => x - y),
      debeCentavos: libres.reduce((s, c) => s + c.saldoCentavos, 0),
      precio: mandan.length === 0 ? null
        : montos.size === 1 ? { clase: 'uno', centavos: mandan[0].montoCentavos }
        : { clase: 'varios' },
      pendienteCentavos: suyos.reduce((s, c) => s + c.saldoCentavos, 0),
      tieneAnulados: cargos.some((c) => c.estado === 'anulado' && (c.conceptoId ?? 0) === conceptoId),
    };
  };

  const ids: number[] = [...new Set(automaticos)];
  for (const c of [...vivos].sort((a, b) => a.id - b.id)) {
    const id = c.conceptoId ?? 0;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.map(fila);
}

/** Lo que dice la línea gris de una fila: cuántos cargos hay y en qué están. */
export function resumenDeConcepto(f: Pick<FilaDeConcepto, 'cargos' | 'facturados' | 'conAbono'>): string {
  if (f.cargos === 0) return 'todavía sin cargos';
  const total = cuantos(f.cargos, 'cargo', 'cargos');
  const libres = f.cargos - f.facturados - f.conAbono;
  const partes: string[] = [];
  if (f.facturados > 0) partes.push(`${f.facturados} con factura`);
  if (f.conAbono > 0) partes.push(`${f.conAbono} con pagos`);
  if (libres > 0) partes.push(`${libres} sin factura`);
  // Un solo estado para todos: se dice de corrido, sin los dos puntos.
  if (partes.length === 1) {
    if (libres === f.cargos) return `${total} sin factura`;
    if (f.facturados === f.cargos) return `${total} con factura`;
    return `${total} con pagos`;
  }
  return `${total}: ${partes.join(', ')}`;
}

/**
 * ¿Se le puede cambiar el monto desde la lista?
 *
 * Solo si queda algún cargo libre al que cambiárselo: el cambio va a esos
 * cargos, uno por uno, por la misma ruta que corrige un monto suelto.
 */
export function precioCambiable(f: Pick<FilaDeConcepto, 'libresIds'>, gestionar: boolean): boolean {
  return gestionar && f.libresIds.length > 0;
}

/**
 * Qué se puede hacer al quitar un concepto, o por qué no se puede.
 *
 * Son DOS cosas distintas y la pantalla las ofrece por separado:
 *  - dejar de cobrárselo: sacarlo de lo que el sistema le carga solo. No toca
 *    nada de lo que ya tiene en la cuenta;
 *  - perdonarle lo que debe: anular sus cargos libres. Eso es dinero, y se
 *    dice cuánto.
 *
 * En un colegio que factura al cobrar, lo que el alumno debe ES lo que no
 * tiene factura: si quitar el transporte anulara siempre esos cargos, a quien
 * lo deja en noviembre se le perdonarían septiembre y octubre.
 *
 * El servidor no deja a una matrícula sin nada que cargarle cuando ya tenía
 * algo (para eso se cambia su estado a Retirada o Anulada), así que el último
 * no se quita desde aquí.
 */
export type AlQuitar =
  | {
      se: 'puede';
      /** Se puede sacar de lo que el sistema le carga solo. */
      dejaDeCargarse: boolean;
      /** Cargos que se anularían si además se le perdona lo que debe. */
      anula: number;
      /** Lo que se le perdonaría, en centavos. */
      perdona: number;
      /** Cargos que se quedan pase lo que pase: con factura o con pagos. */
      seQueda: number;
    }
  | { se: 'no'; porque: 'sin-permiso' | 'nada-que-quitar' | 'ultimo-automatico' };

export function alQuitarConcepto(
  f: Pick<FilaDeConcepto, 'automatico' | 'libresIds' | 'debeCentavos' | 'facturados' | 'conAbono'>,
  /** La lista EFECTIVA de lo que el sistema le carga solo. */
  automaticos: readonly number[],
  gestionar: boolean,
): AlQuitar {
  if (!gestionar) return { se: 'no', porque: 'sin-permiso' };
  if (f.automatico && automaticos.length <= 1) return { se: 'no', porque: 'ultimo-automatico' };
  if (!f.automatico && f.libresIds.length === 0) return { se: 'no', porque: 'nada-que-quitar' };
  return {
    se: 'puede',
    dejaDeCargarse: f.automatico,
    anula: f.libresIds.length,
    perdona: f.debeCentavos,
    seQueda: f.facturados + f.conAbono,
  };
}

/**
 * Un concepto que se repite entra a lo que el sistema le carga solo; uno de
 * una sola vez se le pone como un cargo, ahora.
 *
 * Una mensualidad va siempre por la lista aunque su frecuencia no esté puesta:
 * un cargo suelto de mensualidad pide además de qué mes es, y eso se hace
 * desde la ficha del estudiante.
 */
export function seAgregaComo(c: { tipo?: unknown; frecuencia?: unknown }): 'automatico' | 'cargo' {
  if (c.tipo === 'mensualidad') return 'automatico';
  return esFrecuencia(c.frecuencia) && c.frecuencia !== 'unico' ? 'automatico' : 'cargo';
}

/**
 * Los conceptos que se le pueden agregar, en sus dos montones.
 *
 * No se ofrece lo que ya tiene: ni lo que el sistema ya le carga —aunque sea
 * de una sola vez y todavía no haya salido: agregarlo a mano y esperar a su
 * fecha serían dos cargos—, ni un cobro de una sola vez del que ya hay un
 * cargo vivo. Tampoco lo retirado del catálogo.
 */
export function conceptosParaAgregar<T extends { id: number; tipo?: unknown; frecuencia?: unknown; activo?: boolean }>(
  catalogo: readonly T[],
  filas: readonly Pick<FilaDeConcepto, 'conceptoId' | 'automatico' | 'cargos'>[],
): { titulo: string; conceptos: T[] }[] {
  const yaAutomatico = new Set(filas.filter((f) => f.automatico).map((f) => f.conceptoId));
  const conCargo = new Set(filas.filter((f) => f.cargos > 0).map((f) => f.conceptoId));
  const libres = catalogo.filter((c) => c.activo !== false && !yaAutomatico.has(c.id));
  return [
    {
      titulo: 'Se cobra todos los meses o cada cierto tiempo',
      conceptos: libres.filter((c) => seAgregaComo(c) === 'automatico'),
    },
    {
      titulo: 'Se cobra una sola vez',
      conceptos: libres.filter((c) => seAgregaComo(c) === 'cargo' && !conCargo.has(c.id)),
    },
  ].filter((g) => g.conceptos.length > 0);
}

/**
 * La mensualidad que ya se le carga, si la que se va a agregar es OTRA.
 *
 * En un colegio con una colegiatura por generación, agregar la correcta sin
 * quitar la anterior le carga dos cada mes. Devuelve el nombre de la que ya
 * tiene, para avisarlo antes de confirmar.
 */
export function otraMensualidadQueYaTiene(
  nuevo: { id: number; tipo?: unknown },
  filas: readonly Pick<FilaDeConcepto, 'conceptoId' | 'automatico' | 'tipo' | 'nombre'>[],
): string | null {
  if (nuevo.tipo !== 'mensualidad') return null;
  const otra = filas.find((f) => f.automatico && f.tipo === 'mensualidad' && f.conceptoId !== nuevo.id);
  return otra?.nombre ?? null;
}

/** «1 cobro», «3 cobros». El «(s)» pegado al final se leía como un formulario. */
export function cuantos(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}
