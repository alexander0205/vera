/**
 * Bancos: reconocerlos por su nombre y elegir la cuenta de la empresa a la que
 * entró un cobro. Pura, sin base ni red: la usan la pantalla de aprobar un
 * comprobante, la ruta que lo aprueba, el selector de cuentas y las pruebas.
 *
 * Existe porque el mismo banco llega escrito de diez maneras —«Popular»,
 * «Banco Popular Dominicano», «BPD», «bco. popular»— y ni el padre ni la IA que
 * lee la captura de pantalla tienen por qué usar el nombre con el que el colegio
 * dio de alta su cuenta. Comparar textos crudos dejaría el desplegable vacío
 * justo cuando la IA acertó.
 */

/** Métodos de cobro en los que preguntar «¿a qué banco entró?» es parte del registro. */
export const METODOS_CON_BANCO: ReadonlySet<string> = new Set(['transferencia', 'deposito']);

// ── Etiquetas de cuenta ─────────────────────────────────────────────────────

/** Una cuenta de la empresa, lista para ofrecerla en un desplegable. */
export interface CuentaBancoOpcion {
  id: number;
  banco: string;
  tipoCuenta: string | null;
  /** Últimos 4 del número, para distinguir dos cuentas del mismo banco. */
  ultimos4: string | null;
  titular: string | null;
  /** Ya armada para pintar: «Banco Popular · Ahorros ····4821». */
  etiqueta: string;
}

/** Los últimos 4 dígitos, ignorando guiones y espacios. */
export function ultimos4(numero: string | null | undefined): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '');
  return digitos.length >= 4 ? digitos.slice(-4) : null;
}

/**
 * La etiqueta se GUARDA en `pagos_recibidos.cuenta`, que es `varchar(100)`,
 * mientras que `banco` es `varchar(120)`. Un nombre de banco largo desbordaría
 * la columna al registrar el cobro, así que se acota aquí —en el único sitio
 * donde se arma— y no en cada pantalla que la pinte.
 */
export const MAX_ETIQUETA = 100;

/** «Banco Popular · Ahorros ····4821». */
export function etiquetaDe(banco: string, tipo: string | null, fin: string | null): string {
  const cola = [tipo?.trim(), fin ? `····${fin}` : null].filter(Boolean).join(' ');
  const completa = cola ? `${banco.trim()} · ${cola}` : banco.trim();
  if (completa.length <= MAX_ETIQUETA) return completa;

  // Se recorta el NOMBRE, nunca la cola: los últimos cuatro dígitos son lo que
  // distingue dos cuentas del mismo banco, y sin ellos la etiqueta no sirve.
  const sitio = MAX_ETIQUETA - (cola ? cola.length + 3 : 0) - 1;
  return cola
    ? `${banco.trim().slice(0, Math.max(1, sitio))}… · ${cola}`
    : banco.trim().slice(0, MAX_ETIQUETA);
}

// ── Reconocer el banco por su nombre ────────────────────────────────────────

export interface BancoConocido {
  /** Clave estable, para comparar. */
  clave: string;
  /** Cómo se le enseña al usuario. */
  nombre: string;
  /** Maneras de escribirlo, ya normalizadas (minúsculas, sin acentos ni puntos). */
  alias: readonly string[];
}

/**
 * Los bancos que más se ven en una transferencia dominicana. No es un catálogo
 * cerrado: un banco que no esté aquí se compara por su texto (ver `mismoBanco`).
 *
 * Los alias van normalizados. Dos de ellos se pisan a propósito —«popular» es
 * del Banco Popular y también está dentro de «Asociación Popular» (APAP)—, y
 * lo resuelve `normalizarBanco` quedándose con el alias MÁS LARGO que aparezca.
 */
export const BANCOS_RD: readonly BancoConocido[] = [
  { clave: 'popular', nombre: 'Banco Popular', alias: ['popular', 'banco popular', 'banco popular dominicano', 'popular dominicano', 'bpd'] },
  { clave: 'bhd', nombre: 'Banco BHD', alias: ['bhd', 'banco bhd', 'bhd leon', 'banco bhd leon', 'banco multiple bhd'] },
  { clave: 'banreservas', nombre: 'Banreservas', alias: ['banreservas', 'banco de reservas', 'banco reservas', 'banco de reservas de la republica dominicana', 'reservas'] },
  { clave: 'scotiabank', nombre: 'Scotiabank', alias: ['scotiabank', 'scotia bank', 'scotia', 'banco scotiabank'] },
  { clave: 'santa_cruz', nombre: 'Banco Santa Cruz', alias: ['santa cruz', 'banco santa cruz', 'bsc'] },
  { clave: 'promerica', nombre: 'Banco Promerica', alias: ['promerica', 'banco promerica'] },
  { clave: 'bdi', nombre: 'Banco BDI', alias: ['bdi', 'banco bdi'] },
  { clave: 'caribe', nombre: 'Banco Caribe', alias: ['caribe', 'banco caribe'] },
  { clave: 'vimenca', nombre: 'Banco Vimenca', alias: ['vimenca', 'banco vimenca'] },
  { clave: 'lopez_de_haro', nombre: 'Banco López de Haro', alias: ['lopez de haro', 'banco lopez de haro', 'blh'] },
  { clave: 'ademi', nombre: 'Banco Ademi', alias: ['ademi', 'banco ademi'] },
  { clave: 'apap', nombre: 'APAP', alias: ['apap', 'asociacion popular', 'asociacion popular de ahorros y prestamos'] },
  { clave: 'cibao', nombre: 'Asociación Cibao', alias: ['asociacion cibao', 'acap', 'asociacion cibaena', 'asociacion cibaena de ahorros y prestamos'] },
  { clave: 'la_nacional', nombre: 'Asociación La Nacional', alias: ['la nacional', 'asociacion la nacional', 'alnap'] },
  { clave: 'banesco', nombre: 'Banesco', alias: ['banesco', 'banco banesco'] },
  { clave: 'lafise', nombre: 'Banco Lafise', alias: ['lafise', 'banco lafise'] },
  { clave: 'citibank', nombre: 'Citibank', alias: ['citibank', 'citi bank', 'citi'] },
  { clave: 'qik', nombre: 'Qik Banco Digital', alias: ['qik', 'qik banco digital', 'banco digital qik'] },
];

/** Minúsculas, sin acentos ni signos, un solo espacio entre palabras. */
export function normalizarTexto(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // «bco.» y «bco» son «banco»; sin esto «Bco. Popular» no reconoce el alias.
    .replace(/\bbco\b\.?/g, 'banco')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Qué banco es este texto, o `null` si no se reconoce.
 *
 * Busca el alias como PALABRA(S) completas —«bdi» dentro de «bdix» no cuenta— y,
 * si encaja más de un banco, gana el alias más largo: «Asociación Popular de
 * Ahorros y Préstamos» contiene «popular», pero el alias largo es el de APAP.
 */
export function normalizarBanco(texto: string | null | undefined): BancoConocido | null {
  const t = normalizarTexto(texto);
  if (!t) return null;
  // Una cooperativa NO es un banco de la lista, aunque su nombre lleve una de
  // sus palabras («Cooperativa Popular de Maestros» no es el Banco Popular).
  // Queda sin reconocer y se compara por su texto.
  if (/\bcoop[a-z]*\b/.test(t)) return null;
  const pegado = ` ${t} `;

  let mejor: BancoConocido | null = null;
  let largo = 0;
  for (const banco of BANCOS_RD) {
    for (const alias of banco.alias) {
      if (alias.length > largo && pegado.includes(` ${alias} `)) {
        mejor = banco;
        largo = alias.length;
      }
    }
  }
  return mejor;
}

/**
 * ¿Es el mismo banco? Si los dos se reconocen, por su clave. Si alguno no está
 * en la lista, por su texto: uno contenido en el otro («Fihogar» y «Banco
 * Fihogar») con al menos cuatro letras, para que «bco» no case con todo.
 */
export function mismoBanco(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = normalizarBanco(a);
  const kb = normalizarBanco(b);
  if (ka && kb) return ka.clave === kb.clave;
  // Uno conocido y el otro no: no son el mismo. Evita que un banco raro cuyo
  // nombre incluye «popular» (p. ej. «Cooperativa Popular») case con el Popular.
  if (ka || kb) return false;

  const ta = normalizarTexto(a).replace(/\bbanco\b/g, '').trim();
  const tb = normalizarTexto(b).replace(/\bbanco\b/g, '').trim();
  if (ta.length < 4 || tb.length < 4) return false;
  return ta === tb || ta.includes(tb) || tb.includes(ta);
}

// ── Elegir la cuenta ────────────────────────────────────────────────────────

export interface CuentaParaCasar {
  id: number;
  banco: string;
  ultimos4: string | null;
}

/**
 * La cuenta del colegio que corresponde a lo que la IA leyó en el comprobante,
 * o `null` si no hay una que lo sea con seguridad.
 *
 *  · Por banco. Si solo una cuenta es de ese banco, es esa.
 *  · Si el colegio tiene varias del mismo banco, desempatan los últimos cuatro
 *    dígitos de la cuenta destino que la IA haya visto.
 *  · Sin banco legible pero con los últimos cuatro que coinciden con UNA sola
 *    cuenta, también es esa.
 *
 * Ante la duda NO elige: preseleccionar mal es peor que dejar el desplegable
 * vacío, porque el revisor confía en lo que ya viene marcado.
 */
export function casarCuentaBanco(
  leido: { banco?: string | null; ultimos4?: string | null },
  cuentas: readonly CuentaParaCasar[],
): number | null {
  const fin = (leido.ultimos4 ?? '').replace(/\D/g, '').slice(-4);
  const hayBanco = Boolean(leido.banco && leido.banco.trim());

  if (hayBanco) {
    const delBanco = cuentas.filter((c) => mismoBanco(leido.banco, c.banco));
    if (delBanco.length === 1) return delBanco[0].id;
    if (delBanco.length > 1 && fin.length === 4) {
      const exacta = delBanco.filter((c) => c.ultimos4 === fin);
      if (exacta.length === 1) return exacta[0].id;
    }
    return null;
  }

  if (fin.length === 4) {
    const porFin = cuentas.filter((c) => c.ultimos4 === fin);
    if (porFin.length === 1) return porFin[0].id;
  }
  return null;
}

/**
 * ¿Hay que elegir banco antes de aprobar? Sí cuando el cobro es una
 * transferencia o un depósito y la empresa tiene MÁS de una cuenta: con una sola
 * no hay nada que elegir (se usa esa), y sin ninguna cargada nadie puede quedar
 * bloqueado por falta de configuración.
 */
export function bancoObligatorio(metodo: string, cuentasActivas: number): boolean {
  return METODOS_CON_BANCO.has((metodo ?? '').trim().toLowerCase()) && cuentasActivas > 1;
}

/**
 * Qué cuenta queda marcada al abrir el desplegable.
 *
 *  1. Una sola cuenta en el colegio: esa.
 *  2. Si no, la que casó con lo que leyó la IA.
 *  3. Si no, ninguna — y `bancoObligatorio` decide si se puede seguir así.
 */
export function cuentaInicial(
  cuentas: readonly CuentaParaCasar[],
  leido: { banco?: string | null; ultimos4?: string | null } | null,
): number | null {
  if (cuentas.length === 1) return cuentas[0].id;
  if (!leido) return null;
  return casarCuentaBanco(leido, cuentas);
}

/**
 * Qué cuenta queda atada a un cobro que se aprueba, o por qué no se puede.
 *
 * `cuentas` son TODAS las del equipo que aprueba (activas o no), leídas de la
 * base por quien llama: que el id exista ahí es lo que impide atar un cobro a la
 * cuenta de OTRA empresa, porque el id viaja desde el navegador. Una cuenta
 * apagada se acepta —un depósito viejo puede haber entrado a una cuenta ya
 * cerrada—, pero solo las activas cuentan para decidir si hay que elegir.
 */
export function resolverBancoDeAprobacion(args: {
  cuentaBancoId: number | null | undefined;
  metodo: string;
  cuentas: readonly { id: number; activa: boolean }[];
}): { ok: true; cuentaId: number | null } | { ok: false; error: string } {
  const { cuentaBancoId, metodo, cuentas } = args;

  if (cuentaBancoId != null) {
    return cuentas.some((c) => c.id === cuentaBancoId)
      ? { ok: true, cuentaId: cuentaBancoId }
      : { ok: false, error: 'Esa cuenta bancaria no es de este colegio.' };
  }

  if (bancoObligatorio(metodo, cuentas.filter((c) => c.activa).length)) {
    return { ok: false, error: 'Elige el banco donde entró el dinero.' };
  }
  return { ok: true, cuentaId: null };
}
