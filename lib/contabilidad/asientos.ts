import { cache } from 'react';
/**
 * lib/contabilidad/asientos.ts — Generación de asientos contables. Paso 4.
 *
 * Aquí el módulo empieza a escribir números de verdad. Los Pasos 2 y 3 definían
 * el destino; esto lo usa para producir partida doble a partir de facturas y
 * pagos que ya existen.
 *
 * Tres reglas que gobiernan todo el archivo:
 *
 * 1. **Nunca se guarda un asiento descuadrado.** Se valida debe == haber antes
 *    de insertar, dentro de la transacción. Un libro descuadrado no se arregla
 *    solo y contamina todos los reportes que vengan después.
 *
 * 2. **Un origen produce un asiento y nada más.** Lo garantiza el índice único
 *    `(team_id, origen_tipo, origen_id)`. La generación se puede reintentar sin
 *    duplicar contabilidad, que es el error más caro que puede cometer esto.
 *
 * 3. **Si la contabilidad está apagada, no se genera nada.** El interruptor del
 *    Paso 3 es una puerta real, no un adorno.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { parseLineas } from '@/lib/reportes/shared';
import { getConfig, resolverCuentaCobro, claveContableDePago } from './config';
import type { ClaveMetodo } from './metodos';
import { distribuirCompra } from './compras';

/** Estados de un documento que representan una venta emitida y viva. */
const ESTADOS_VENTA = ['ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO'];
/** Tipos e-CF que suman ingreso. La nota de crédito (34) resta y va aparte. */
const TIPOS_VENTA = ['31', '32', '33', '44', '45'];
/** Nota de crédito: reduce la deuda del cliente en vez de aumentarla. */
const TIPO_NOTA_CREDITO = '34';
/**
 * Venta interna sin comprobante fiscal. NO va a la DGII, así que **vive
 * permanentemente en BORRADOR** — nunca pasa a ACEPTADO. Es como el flujo
 * escolar registra un cargo cobrable. La cartera ya la cuenta como cobrable
 * (`lib/db/queries.ts`, CTE de CxC); contabilidad debe reconocer la venta igual,
 * o asentaría el cobro sin la venta y dejaría Cuentas por cobrar acreedor
 * (nivel 2.3). Ver `esVentaAsentable`.
 */
const TIPO_SIN_NCF = 'sin-ncf';

/**
 * ¿Este documento genera asiento de venta? Dos familias:
 *  - e-CF fiscal emitido y vivo (`TIPOS_VENTA` en un `ESTADOS_VENTA`), y
 *  - venta interna `sin-ncf` no anulada (permanece en BORRADOR a propósito).
 *
 * ⚠️ `VENTA_ASENTABLE_SQL` es el espejo de esta función para el barrido.
 * **Cambiar las dos juntas** o el barrido y el generador se desincronizan.
 */
export function esVentaAsentable(estado: string, tipoEcf: string): boolean {
  if (tipoEcf === TIPO_SIN_NCF) return estado !== 'ANULADO' && estado !== 'RECHAZADO';
  return ESTADOS_VENTA.includes(estado) && TIPOS_VENTA.includes(tipoEcf);
}

/** Espejo SQL de `esVentaAsentable`, sobre el alias `d`. Mantener en sync. */
export const VENTA_ASENTABLE_SQL = sql`(
  (d.estado IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO') AND d.tipo_ecf IN ('31', '32', '33', '44', '45'))
  OR (d.tipo_ecf = 'sin-ncf' AND d.estado NOT IN ('ANULADO', 'RECHAZADO'))
)`;

export interface LineaAsiento {
  cuentaId:    number;
  debeCents:   number;
  haberCents:  number;
  descripcion: string;
}

/** Por qué un documento no generó asiento. Se le muestra al usuario. */
export type MotivoSalto =
  | 'contabilidad-apagada'
  | 'ya-tiene-asiento'
  | 'no-es-venta'
  | 'sin-monto'
  | 'sin-cuenta-por-cobrar'
  | 'sin-cuenta-itbis'
  | 'sin-cuenta-ingresos'
  | 'sin-cuenta-cobro'
  | 'sin-cuenta-mora'
  | 'sin-cuenta-descuentos'
  | 'sin-cuenta-saldos-favor'
  | 'sin-cuenta-retenciones'
  | 'sin-asiento-que-reversar'
  | 'no-esta-anulado'
  | 'nc-solo-texto'
  | 'sin-cuenta-inventario'
  | 'sin-cuenta-itbis-adelantado'
  | 'sin-cuenta-por-pagar'
  | 'sin-cuenta-gastos'
  | 'sin-cuenta-caja'
  | 'no-es-gasto';

export interface ResultadoGeneracion {
  creado:  boolean;
  motivo?: MotivoSalto;
  asientoId?: number;
}

/** Error de cuadre. Si esto salta hay un bug, no un dato malo. */
export class AsientoDescuadradoError extends Error {
  constructor(debe: number, haber: number, concepto: string) {
    super(
      `Asiento descuadrado en "${concepto}": debe ${debe} ≠ haber ${haber}. ` +
      'No se guardó nada.',
    );
    this.name = 'AsientoDescuadradoError';
  }
}

// ─── Escritura, con el cuadre como guardián ──────────────────────────────────

/**
 * Inserta un asiento y sus líneas en una transacción, previa comprobación de
 * cuadre.
 *
 * El `ON CONFLICT DO NOTHING` sobre el índice de origen es la idempotencia: si
 * dos procesos intentan asentar la misma factura a la vez, uno gana y el otro
 * se entera sin romper nada.
 */
async function insertarAsiento(
  teamId: number,
  datos: { fecha: string; concepto: string; origenTipo: string; origenId: number },
  lineas: LineaAsiento[],
  userId: number | null,
): Promise<number | null> {
  const debe  = lineas.reduce((s, l) => s + l.debeCents, 0);
  const haber = lineas.reduce((s, l) => s + l.haberCents, 0);

  if (debe !== haber) throw new AsientoDescuadradoError(debe, haber, datos.concepto);
  if (debe === 0) throw new AsientoDescuadradoError(0, 0, datos.concepto);

  return db.transaction(async (tx) => {
    const filas = await tx.execute(sql`
      INSERT INTO contabilidad_asientos
        (team_id, fecha, concepto, origen_tipo, origen_id, total_cents, created_by)
      VALUES (${teamId}, ${datos.fecha}, ${datos.concepto},
              ${datos.origenTipo}, ${datos.origenId}, ${debe}, ${userId})
      ON CONFLICT (team_id, origen_tipo, origen_id) DO NOTHING
      RETURNING id
    `);

    const asientoId = (filas as unknown as { id: number }[])[0]?.id;
    // Otro proceso ya lo asentó. No es un error: es la idempotencia funcionando.
    if (!asientoId) return null;

    let orden = 0;
    for (const l of lineas) {
      await tx.execute(sql`
        INSERT INTO contabilidad_asiento_lineas
          (asiento_id, team_id, cuenta_id, debe_cents, haber_cents, descripcion, orden)
        VALUES (${asientoId}, ${teamId}, ${l.cuentaId},
                ${l.debeCents}, ${l.haberCents}, ${l.descripcion}, ${orden++})
      `);
    }

    return asientoId;
  });
}

// ─── Asiento de factura ──────────────────────────────────────────────────────

interface DocumentoParaAsiento {
  id: number;
  encf: string | null;
  tipoEcf: string;
  estado: string;
  montoTotal: number;
  totalItbis: number;
  totalRetenciones: number;
  lineasJson: string | null;
  fecha: string;
  /** Si viene, el documento es una nota de débito por mora de esa factura. */
  moraOrigenId: number | null;
  /** Solo notas de crédito: cuánto del monto quedó como saldo a favor. */
  creditoGeneradoCents: number | null;
  /** Código DGII de modificación. 2 = "corrige texto", sin efecto monetario. */
  codigoModificacion: number | null;
}

/** Todo lo que necesita saberse de un documento para asentarlo. */
const SELECT_DOCUMENTO = sql`
  SELECT id, encf, tipo_ecf AS "tipoEcf", estado,
         monto_total AS "montoTotal", total_itbis AS "totalItbis",
         COALESCE(total_retenciones, 0) AS "totalRetenciones",
         lineas_json AS "lineasJson",
         mora_origen_id AS "moraOrigenId",
         credito_generado_cents AS "creditoGeneradoCents",
         codigo_modificacion AS "codigoModificacion",
         to_char(fecha_emision AT TIME ZONE 'America/Santo_Domingo', 'YYYY-MM-DD') AS fecha
  FROM ecf_documents
`;

/**
 * Reparte el ingreso entre cuentas según las líneas de la factura.
 *
 * **Aquí vive la trampa de unidades del proyecto.** `lineas_json` guarda pesos y
 * el encabezado guarda centavos (ver `lib/reportes/shared.ts`). `parseLineas`
 * ya devuelve centavos, pero la suma de las líneas redondeadas **no tiene por
 * qué coincidir** con `monto_total − total_itbis` del encabezado.
 *
 * Por eso el encabezado manda: es la cifra que se le facturó al cliente y la que
 * la DGII tiene. Las líneas solo deciden **cómo se reparte**, y la diferencia de
 * redondeo se le da al grupo más grande. Así el asiento cuadra al centavo
 * siempre, pase lo que pase con el JSON.
 *
 * **Segunda trampa:** las líneas no llevan id de producto, solo `referencia`
 * (SKU) o el nombre. Por eso el mapeo a producto va por `referencia`, y una
 * línea sin SKU (o con SKU que no case) cae a la cuenta de ingresos general.
 */
async function repartirIngreso(
  teamId: number,
  doc: DocumentoParaAsiento,
  cuentaIngresosGeneral: number,
): Promise<Map<number, number>> {
  const ingresoTotal = doc.montoTotal - doc.totalItbis;
  const lineas = parseLineas(doc.lineasJson);

  // Sin líneas utilizables, todo el ingreso va a la cuenta general.
  const conBase = lineas.filter((l) => l.baseCents > 0);
  if (conBase.length === 0) {
    return new Map([[cuentaIngresosGeneral, ingresoTotal]]);
  }

  // Resolución por SKU, en una sola consulta para no ir a la base por línea.
  const refs = [...new Set(conBase.map((l) => l.referencia).filter(Boolean))] as string[];
  const cuentaPorRef = new Map<string, number>();

  if (refs.length > 0) {
    const filas = await db.execute(sql`
      WITH prods AS (
        -- DISTINCT ON: products.referencia no es único por team. Si hay dos
        -- productos con el mismo SKU se toma el de menor id, de forma estable,
        -- en vez de que el reparto cambie entre ejecuciones.
        SELECT DISTINCT ON (p.referencia)
               p.referencia, p.id, p.tipo, p.categoria_id
        FROM products p
        WHERE p.team_id = ${teamId}
          AND p.referencia IN (${sql.join(refs.map((r) => sql`${r}`), sql`, `)})
        ORDER BY p.referencia, p.id
      )
      SELECT pr.referencia,
             COALESCE(
               (SELECT cuenta_id FROM contabilidad_config_ingresos
                 WHERE team_id = ${teamId} AND producto_id = pr.id),
               (SELECT cuenta_id FROM contabilidad_config_ingresos
                 WHERE team_id = ${teamId} AND categoria_id = pr.categoria_id
                   AND categoria_id IS NOT NULL),
               (SELECT id FROM contabilidad_cuentas
                 WHERE team_id = ${teamId} AND activa
                   AND codigo = CASE pr.tipo
                                  WHEN 'bien'     THEN '4101'
                                  WHEN 'servicio' THEN '4104'
                                END)
             ) AS "cuentaId"
      FROM prods pr
    `);

    for (const f of filas as unknown as { referencia: string; cuentaId: number | null }[]) {
      if (f.cuentaId) cuentaPorRef.set(f.referencia, f.cuentaId);
    }
  }

  // Agrupar por cuenta destino.
  const porCuenta = new Map<number, number>();
  for (const l of conBase) {
    const cuenta = (l.referencia && cuentaPorRef.get(l.referencia)) || cuentaIngresosGeneral;
    porCuenta.set(cuenta, (porCuenta.get(cuenta) ?? 0) + l.baseCents);
  }

  // Cuadrar contra el encabezado: la diferencia de redondeo va al grupo mayor.
  const sumaLineas = [...porCuenta.values()].reduce((a, b) => a + b, 0);
  const diferencia = ingresoTotal - sumaLineas;

  if (diferencia !== 0) {
    const mayor = [...porCuenta.entries()].sort((a, b) => b[1] - a[1])[0];
    porCuenta.set(mayor[0], mayor[1] + diferencia);
  }

  // Un grupo que quedara en 0 o negativo tras el ajuste no puede ser una línea
  // de asiento (el CHECK exige > 0 en una de las dos columnas).
  for (const [cuenta, monto] of porCuenta) {
    if (monto <= 0) porCuenta.delete(cuenta);
  }

  return porCuenta;
}

/**
 * Asiento de una factura:
 *
 *   Debe  Cuentas por cobrar    monto total
 *     Haber  Ingresos              total − ITBIS  (repartido entre cuentas)
 *     Haber  ITBIS por pagar       ITBIS
 *
 * Se usa `monto_total` como débito incluso en facturas de contado. El pago
 * genera su propio asiento (débito a caja, crédito a cuentas por cobrar), así
 * que la cuenta por cobrar se abre y se cierra. Registrar la venta directo
 * contra caja perdería la trazabilidad de qué se cobró y cuándo.
 */
export async function generarAsientoFactura(
  teamId: number,
  documentoId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };

  const filas = await db.execute(sql`
    ${SELECT_DOCUMENTO}
    WHERE team_id = ${teamId} AND id = ${documentoId}
  `);
  const doc = (filas as unknown as DocumentoParaAsiento[])[0];
  if (!doc) return { creado: false, motivo: 'no-es-venta' };

  if (!esVentaAsentable(doc.estado, doc.tipoEcf)) {
    return { creado: false, motivo: 'no-es-venta' };
  }
  if (doc.montoTotal <= 0) return { creado: false, motivo: 'sin-monto' };

  if (!cfg.cuentaPorCobrarId) return { creado: false, motivo: 'sin-cuenta-por-cobrar' };
  if (doc.totalItbis > 0 && !cfg.cuentaItbisId) {
    return { creado: false, motivo: 'sin-cuenta-itbis' };
  }

  const esMora = doc.moraOrigenId !== null;
  const concepto = esMora
    ? `Mora ${doc.encf ?? doc.id}`
    : `Factura ${doc.encf ?? doc.id}`;

  // ── Reparto del ingreso ───────────────────────────────────────────────────
  // Una nota de débito por mora NO es una venta: es un recargo por atraso.
  // Acreditarla a "Ingresos por ventas" inflaría las ventas y distorsionaría el
  // margen del negocio. Va entera a la cuenta de mora, sin repartir por líneas
  // (su única línea es el producto de sistema `esMora`).
  let reparto: Map<number, number>;
  if (esMora) {
    if (!cfg.cuentaMoraId) return { creado: false, motivo: 'sin-cuenta-mora' };
    reparto = new Map([[cfg.cuentaMoraId, doc.montoTotal - doc.totalItbis]]);
  } else {
    if (!cfg.cuentaIngresosId) return { creado: false, motivo: 'sin-cuenta-ingresos' };
    reparto = await repartirIngreso(teamId, doc, cfg.cuentaIngresosId);
  }

  // ── Retenciones ───────────────────────────────────────────────────────────
  // Cuando el comprador retiene ITBIS o ISR, esa plata NO va a entrar al banco:
  // la paga él a la DGII por cuenta de la empresa. La venta sigue siendo por el
  // total, así que el ingreso no cambia; lo que cambia es que el débito se parte
  // en dos: lo que el cliente todavía debe, y el crédito fiscal retenido.
  const retenido = doc.totalRetenciones;
  if (retenido > 0 && !cfg.cuentaRetencionesId) {
    return { creado: false, motivo: 'sin-cuenta-retenciones' };
  }

  const lineas: LineaAsiento[] = [
    {
      cuentaId: cfg.cuentaPorCobrarId,
      debeCents: doc.montoTotal - retenido,
      haberCents: 0,
      descripcion: concepto,
    },
    ...[...reparto.entries()].map(([cuentaId, monto]) => ({
      cuentaId,
      debeCents: 0,
      haberCents: monto,
      descripcion: esMora ? 'Recargo por mora' : 'Ingreso por ventas',
    })),
  ];

  if (retenido > 0) {
    lineas.splice(1, 0, {
      cuentaId: cfg.cuentaRetencionesId!,
      debeCents: retenido,
      haberCents: 0,
      descripcion: 'Retención practicada por el cliente',
    });
  }

  if (doc.totalItbis > 0) {
    lineas.push({
      cuentaId: cfg.cuentaItbisId!,
      debeCents: 0,
      haberCents: doc.totalItbis,
      descripcion: 'ITBIS facturado',
    });
  }

  const asientoId = await insertarAsiento(
    teamId,
    { fecha: doc.fecha, concepto, origenTipo: 'factura', origenId: doc.id },
    lineas,
    userId,
  );

  return asientoId === null
    ? { creado: false, motivo: 'ya-tiene-asiento' }
    : { creado: true, asientoId };
}

// ─── Asiento de nota de crédito ──────────────────────────────────────────────

/**
 * Asiento de una nota de crédito (tipo e-CF 34). Es el espejo de una factura:
 *
 *   Debe  Descuentos y devoluciones   base
 *   Debe  ITBIS por pagar             ITBIS  ← se devuelve lo que se le debía a la DGII
 *     Haber  Cuentas por cobrar         lo que reduce la deuda
 *     Haber  Saldos a favor de clientes lo que sobra
 *
 * **Por qué el sobrante no va contra cuentas por cobrar:** si la nota supera lo
 * que el cliente debía, ese exceso no es "menos deuda", es dinero que la empresa
 * le debe a él. Restarlo de la cartera la dejaría en negativo y el balance mal.
 * Por eso `credito_generado_cents` —que el sistema ya calcula— va a un pasivo.
 *
 * El débito a descuentos usa la cuenta de contrapartida `4103`, que es de
 * naturaleza deudora precisamente para esto (ver Paso 2).
 */
export async function generarAsientoNotaCredito(
  teamId: number,
  documentoId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };

  const filas = await db.execute(sql`
    ${SELECT_DOCUMENTO}
    WHERE team_id = ${teamId} AND id = ${documentoId}
  `);
  const doc = (filas as unknown as DocumentoParaAsiento[])[0];
  if (!doc) return { creado: false, motivo: 'no-es-venta' };

  if (doc.tipoEcf !== TIPO_NOTA_CREDITO || !ESTADOS_VENTA.includes(doc.estado)) {
    return { creado: false, motivo: 'no-es-venta' };
  }
  if (doc.montoTotal <= 0) return { creado: false, motivo: 'sin-monto' };

  // Código 2 = "corrige texto": la nota no mueve dinero, solo enmienda datos del
  // documento original. Sin efecto monetario no hay asiento que hacer.
  if (doc.codigoModificacion === 2) return { creado: false, motivo: 'nc-solo-texto' };

  if (!cfg.cuentaDescuentosId) return { creado: false, motivo: 'sin-cuenta-descuentos' };
  if (!cfg.cuentaPorCobrarId) return { creado: false, motivo: 'sin-cuenta-por-cobrar' };
  if (doc.totalItbis > 0 && !cfg.cuentaItbisId) {
    return { creado: false, motivo: 'sin-cuenta-itbis' };
  }

  // El sobrante que quedó como crédito del cliente. Capado al total por si el
  // dato viniera inconsistente: nunca debe generar más pasivo que el importe
  // de la propia nota.
  const aSaldoFavor = Math.min(
    Math.max(0, doc.creditoGeneradoCents ?? 0),
    doc.montoTotal,
  );
  const aCuentaPorCobrar = doc.montoTotal - aSaldoFavor;

  if (aSaldoFavor > 0 && !cfg.cuentaSaldosFavorId) {
    return { creado: false, motivo: 'sin-cuenta-saldos-favor' };
  }

  const concepto = `Nota de crédito ${doc.encf ?? doc.id}`;
  const base = doc.montoTotal - doc.totalItbis;

  const lineas: LineaAsiento[] = [];

  if (base > 0) {
    lineas.push({
      cuentaId: cfg.cuentaDescuentosId,
      debeCents: base,
      haberCents: 0,
      descripcion: 'Descuento o devolución sobre ventas',
    });
  }

  if (doc.totalItbis > 0) {
    lineas.push({
      cuentaId: cfg.cuentaItbisId!,
      debeCents: doc.totalItbis,
      haberCents: 0,
      descripcion: 'ITBIS revertido',
    });
  }

  if (aCuentaPorCobrar > 0) {
    lineas.push({
      cuentaId: cfg.cuentaPorCobrarId,
      debeCents: 0,
      haberCents: aCuentaPorCobrar,
      descripcion: 'Reducción de la deuda del cliente',
    });
  }

  if (aSaldoFavor > 0) {
    lineas.push({
      cuentaId: cfg.cuentaSaldosFavorId!,
      debeCents: 0,
      haberCents: aSaldoFavor,
      descripcion: 'Saldo a favor generado',
    });
  }

  const asientoId = await insertarAsiento(
    teamId,
    { fecha: doc.fecha, concepto, origenTipo: 'nota', origenId: doc.id },
    lineas,
    userId,
  );

  return asientoId === null
    ? { creado: false, motivo: 'ya-tiene-asiento' }
    : { creado: true, asientoId };
}

// ─── Asiento reverso de una anulación ────────────────────────────────────────

/**
 * Reversa el asiento de un documento anulado.
 *
 * **No se borra ni se edita el asiento original.** Un libro contable no se
 * reescribe: lo que pasó, pasó, y la anulación es un hecho posterior con su
 * propia fecha. Se crea un segundo asiento con debe y haber intercambiados, así
 * que los saldos vuelven a donde estaban y las dos operaciones quedan visibles.
 *
 * El índice único sobre `(team_id, 'anulacion', origen_id)` impide reversar dos
 * veces el mismo documento.
 */
export async function generarAsientoAnulacion(
  teamId: number,
  documentoId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };

  const docs = await db.execute(sql`
    SELECT estado, encf,
           to_char(COALESCE(updated_at, fecha_emision) AT TIME ZONE 'America/Santo_Domingo',
                   'YYYY-MM-DD') AS fecha
    FROM ecf_documents
    WHERE team_id = ${teamId} AND id = ${documentoId}
  `);
  const doc = (docs as unknown as { estado: string; encf: string | null; fecha: string }[])[0];
  if (!doc) return { creado: false, motivo: 'no-es-venta' };
  if (doc.estado !== 'ANULADO') return { creado: false, motivo: 'no-esta-anulado' };

  // Se busca el asiento original por cualquiera de los dos orígenes: una factura
  // anulada tiene 'factura', una nota de crédito anulada tiene 'nota'.
  const originales = await db.execute(sql`
    SELECT l.cuenta_id AS "cuentaId", l.debe_cents AS "debeCents",
           l.haber_cents AS "haberCents", l.descripcion
    FROM contabilidad_asientos a
    JOIN contabilidad_asiento_lineas l ON l.asiento_id = a.id
    WHERE a.team_id = ${teamId}
      AND a.origen_id = ${documentoId}
      AND a.origen_tipo IN ('factura', 'nota')
    ORDER BY l.orden
  `);

  const lineasOriginales = originales as unknown as
    { cuentaId: number; debeCents: unknown; haberCents: unknown; descripcion: string | null }[];

  // Sin asiento original no hay nada que reversar. Es el caso normal de un
  // documento que se anuló antes de que nadie barriera el libro.
  if (lineasOriginales.length === 0) {
    return { creado: false, motivo: 'sin-asiento-que-reversar' };
  }

  // Los montos vienen como string desde `bigint`: convertir antes de usarlos.
  const lineas: LineaAsiento[] = lineasOriginales.map((l) => ({
    cuentaId: l.cuentaId,
    debeCents: Number(l.haberCents ?? 0),
    haberCents: Number(l.debeCents ?? 0),
    descripcion: `Reverso: ${l.descripcion ?? ''}`.slice(0, 255),
  }));

  const asientoId = await insertarAsiento(
    teamId,
    {
      fecha: doc.fecha,
      concepto: `Anulación de ${doc.encf ?? documentoId}`,
      origenTipo: 'anulacion',
      origenId: documentoId,
    },
    lineas,
    userId,
  );

  return asientoId === null
    ? { creado: false, motivo: 'ya-tiene-asiento' }
    : { creado: true, asientoId };
}

// ─── Asiento de pago ─────────────────────────────────────────────────────────

/**
 * Asiento de un cobro:
 *
 *   Debe  Caja / Banco / Cobros por liquidar   monto
 *     Haber  Cuentas por cobrar                  monto
 *
 * La cuenta de débito **sale de `claveContableDePago()`, nunca del `metodo`
 * crudo**. Un cobro por link de pago se guarda como `metodo='tarjeta'` y sin esa
 * traducción acabaría en el banco, cuando el dinero todavía está en la pasarela.
 */
export async function generarAsientoPago(
  teamId: number,
  pagoId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };
  if (!cfg.cuentaPorCobrarId) return { creado: false, motivo: 'sin-cuenta-por-cobrar' };

  const filas = await db.execute(sql`
    SELECT p.id, p.metodo, p.monto_centavos AS "montoCentavos",
           to_char(p.fecha_pago, 'YYYY-MM-DD') AS fecha,
           d.encf
    FROM pagos_recibidos p
    LEFT JOIN ecf_documents d ON d.id = p.ecf_document_id
    WHERE p.team_id = ${teamId} AND p.id = ${pagoId}
  `);
  const pago = (filas as unknown as {
    id: number; metodo: string; montoCentavos: number; fecha: string; encf: string | null;
  }[])[0];

  if (!pago) return { creado: false, motivo: 'no-es-venta' };
  if (pago.montoCentavos <= 0) return { creado: false, motivo: 'sin-monto' };

  // ── Aplicación de un saldo a favor ────────────────────────────────────────
  // No entra dinero: se consume el crédito que la nota de crédito dejó abierto.
  //
  //   Debe  Saldos a favor de clientes   ← se cancela el pasivo con el cliente
  //     Haber  Cuentas por cobrar          ← se cancela su deuda
  //
  // Es la otra mitad del asiento de la nota de crédito: allí se creó el pasivo,
  // aquí se salda. Sin esto, el saldo a favor crecería para siempre y nunca se
  // vería consumido en el balance.
  const esAplicacionDeCredito =
    pago.metodo === 'saldo_favor' || pago.metodo === 'nota_credito';

  if (esAplicacionDeCredito) {
    if (!cfg.cuentaSaldosFavorId) {
      return { creado: false, motivo: 'sin-cuenta-saldos-favor' };
    }
    const conceptoCredito = `Aplicación de saldo a favor ${pago.encf ? `· factura ${pago.encf}` : `#${pago.id}`}`;
    const idCredito = await insertarAsiento(
      teamId,
      { fecha: pago.fecha, concepto: conceptoCredito, origenTipo: 'pago', origenId: pago.id },
      [
        { cuentaId: cfg.cuentaSaldosFavorId, debeCents: pago.montoCentavos, haberCents: 0,
          descripcion: 'Consumo del crédito del cliente' },
        { cuentaId: cfg.cuentaPorCobrarId, debeCents: 0, haberCents: pago.montoCentavos,
          descripcion: 'Cancelación de cuenta por cobrar' },
      ],
      userId,
    );
    return idCredito === null
      ? { creado: false, motivo: 'ya-tiene-asiento' }
      : { creado: true, asientoId: idCredito };
  }

  const clave = await claveContableDePago(teamId, pago.id, pago.metodo);
  const cuentaCobro = await resolverCuentaCobro(teamId, clave);
  if (!cuentaCobro) return { creado: false, motivo: 'sin-cuenta-cobro' };

  const concepto = `Cobro ${pago.encf ? `factura ${pago.encf}` : `#${pago.id}`}`;

  const asientoId = await insertarAsiento(
    teamId,
    { fecha: pago.fecha, concepto, origenTipo: 'pago', origenId: pago.id },
    [
      { cuentaId: cuentaCobro, debeCents: pago.montoCentavos, haberCents: 0, descripcion: concepto },
      { cuentaId: cfg.cuentaPorCobrarId, debeCents: 0, haberCents: pago.montoCentavos,
        descripcion: 'Cancelación de cuenta por cobrar' },
    ],
    userId,
  );

  return asientoId === null
    ? { creado: false, motivo: 'ya-tiene-asiento' }
    : { creado: true, asientoId };
}

// ─── Compras y gastos de caja (nivel 3.2) ────────────────────────────────────

/**
 * Resuelve una cuenta por su código base cuando la config no la fija. Solo
 * imputables y activas. Deja que compras/gastos funcionen sin configurar,
 * usando los códigos estándar (1105/2101/6101/1101), y personalizables si el
 * team los cambia en la config.
 */
const cuentaPorCodigo = cache(async function cuentaPorCodigo(teamId: number, codigo: string): Promise<number | null> {
  const rows = await db.execute(sql`
    SELECT id FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND codigo = ${codigo} AND imputable AND activa
    LIMIT 1
  `);
  return (rows as unknown as { id: number }[])[0]?.id ?? null;
});

/**
 * Asiento de una compra local (entrada de inventario). Nivel 3.2.
 *
 *   Debe  Inventario            monto de la compra
 *     Haber  Cuentas por pagar    la deuda con el proveedor
 *
 * Nivel 4.3: la compra guarda total + ITBIS. Empresas gravadas separan el
 * crédito fiscal (1104); las exentas conservan el total en Inventario. El haber
 * sigue en CxP hasta que Nivel 4.1 añada compras al contado y pagos proveedores.
 */
export async function generarAsientoCompra(
  teamId: number,
  compraId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };

  const filas = await db.execute(sql`
    SELECT id, monto_total AS "montoTotal", itbis_cents AS "itbisCents", forma_pago AS "formaPago", metodo_pago AS "metodoPago",
           to_char(fecha, 'YYYY-MM-DD') AS fecha,
           proveedor_nombre AS "proveedorNombre"
    FROM compras_locales
    WHERE team_id = ${teamId} AND id = ${compraId}
  `);
  const compra = (filas as unknown as {
    id: number; montoTotal: number; itbisCents: number; formaPago: string; metodoPago: string; fecha: string; proveedorNombre: string | null;
  }[])[0];

  if (!compra) return { creado: false, motivo: 'no-es-gasto' };
  if (compra.montoTotal <= 0) return { creado: false, motivo: 'sin-monto' };

  const cuentaInv = cfg.cuentaInventarioId ?? await cuentaPorCodigo(teamId, '1105');
  if (!cuentaInv) return { creado: false, motivo: 'sin-cuenta-inventario' };
  const distribucion = distribuirCompra(compra.montoTotal, compra.itbisCents, cfg.regimenItbis);
  const cuentaItbisAdelantado = distribucion.itbisAdelantadoCents > 0
    ? await cuentaPorCodigo(teamId, '1104')
    : null;
  if (distribucion.itbisAdelantadoCents > 0 && !cuentaItbisAdelantado) {
    return { creado: false, motivo: 'sin-cuenta-itbis-adelantado' };
  }
  const esContado = compra.formaPago === 'contado';
  const cuentaHaber = esContado
    ? (await resolverCuentaCobro(teamId, compra.metodoPago as ClaveMetodo)) ??
      (compra.metodoPago === 'efectivo' ? await cuentaPorCodigo(teamId, '1101') : null)
    : cfg.cuentaPorPagarId ?? await cuentaPorCodigo(teamId, '2101');
  if (!cuentaHaber) return { creado: false, motivo: esContado ? 'sin-cuenta-cobro' : 'sin-cuenta-por-pagar' };

  const concepto = `Compra #${compra.id}${compra.proveedorNombre ? ` · ${compra.proveedorNombre}` : ''}`;
  const asientoId = await insertarAsiento(
    teamId,
    { fecha: compra.fecha, concepto, origenTipo: 'compra', origenId: compra.id },
    [
      { cuentaId: cuentaInv, debeCents: distribucion.inventarioCents, haberCents: 0, descripcion: 'Entrada de inventario' },
      ...(distribucion.itbisAdelantadoCents > 0 ? [{
        cuentaId: cuentaItbisAdelantado!, debeCents: distribucion.itbisAdelantadoCents, haberCents: 0,
        descripcion: 'ITBIS adelantado (crédito fiscal)',
      }] : []),
      { cuentaId: cuentaHaber, debeCents: 0, haberCents: compra.montoTotal,
        descripcion: esContado ? 'Pago al contado' : 'Deuda con proveedor' },
    ],
    userId,
  );

  return asientoId === null
    ? { creado: false, motivo: 'ya-tiene-asiento' }
    : { creado: true, asientoId };
}

/** Pago a proveedor: Debe 2101 CxP / Haber caja o banco según método. */
export async function generarAsientoPagoProveedor(teamId: number, pagoId: number, userId: number | null = null): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };
  const filas = await db.execute(sql`
    SELECT p.id, p.monto_cents AS "montoCents", p.metodo, to_char(p.fecha_pago,'YYYY-MM-DD') AS fecha,
           c.proveedor_nombre AS "proveedorNombre"
    FROM pagos_proveedores p JOIN compras_locales c ON c.id = p.compra_id AND c.team_id = p.team_id
    WHERE p.team_id = ${teamId} AND p.id = ${pagoId}
  `);
  const pago = (filas as unknown as { id: number; montoCents: number; metodo: string; fecha: string; proveedorNombre: string | null }[])[0];
  if (!pago || pago.montoCents <= 0) return { creado: false, motivo: 'sin-monto' };
  const cxp = cfg.cuentaPorPagarId ?? await cuentaPorCodigo(teamId, '2101');
  const salida = (await resolverCuentaCobro(teamId, pago.metodo as ClaveMetodo)) ??
    (pago.metodo === 'efectivo' ? await cuentaPorCodigo(teamId, '1101') : null);
  if (!cxp) return { creado: false, motivo: 'sin-cuenta-por-pagar' };
  if (!salida) return { creado: false, motivo: 'sin-cuenta-cobro' };
  const concepto = `Pago proveedor #${pago.id}${pago.proveedorNombre ? ` · ${pago.proveedorNombre}` : ''}`;
  const asientoId = await insertarAsiento(teamId, { fecha: pago.fecha, concepto, origenTipo: 'pago_proveedor', origenId: pago.id }, [
    { cuentaId: cxp, debeCents: pago.montoCents, haberCents: 0, descripcion: 'Cancelación de cuenta por pagar' },
    { cuentaId: salida, debeCents: 0, haberCents: pago.montoCents, descripcion: 'Salida para proveedor' },
  ], userId);
  return asientoId === null ? { creado: false, motivo: 'ya-tiene-asiento' } : { creado: true, asientoId };
}

/**
 * Asiento de un movimiento de caja tipo GASTO. Nivel 3.2.
 *
 *   Debe  Gastos (de caja)     el gasto
 *     Haber  Caja                el efectivo que salió
 *
 * El Haber es la cuenta del efectivo, la misma donde entran los cobros en
 * efectivo: se reusa la config del método 'efectivo' y, si falta, se cae al
 * código base 1101. `caja_movimientos.descripcion` es texto libre, así que todo
 * gasto va a una sola cuenta de gastos configurable (hueco 3); refinar por
 * categoría solo si hiciera falta, sin tocar la tabla de caja.
 */
export async function generarAsientoGastoCaja(
  teamId: number,
  movimientoId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };

  const filas = await db.execute(sql`
    SELECT id, tipo, monto_centavos AS "montoCentavos",
           to_char(created_at AT TIME ZONE 'America/Santo_Domingo', 'YYYY-MM-DD') AS fecha,
           descripcion
    FROM caja_movimientos
    WHERE team_id = ${teamId} AND id = ${movimientoId}
  `);
  const mov = (filas as unknown as {
    id: number; tipo: string; montoCentavos: number; fecha: string; descripcion: string | null;
  }[])[0];

  if (!mov || mov.tipo !== 'GASTO') return { creado: false, motivo: 'no-es-gasto' };
  if (mov.montoCentavos <= 0) return { creado: false, motivo: 'sin-monto' };

  const cuentaGasto = cfg.cuentaGastosId ?? await cuentaPorCodigo(teamId, '6101');
  if (!cuentaGasto) return { creado: false, motivo: 'sin-cuenta-gastos' };
  const cuentaCaja = (await resolverCuentaCobro(teamId, 'efectivo')) ?? await cuentaPorCodigo(teamId, '1101');
  if (!cuentaCaja) return { creado: false, motivo: 'sin-cuenta-caja' };

  const concepto = `Gasto de caja #${mov.id}${mov.descripcion ? ` · ${mov.descripcion.slice(0, 60)}` : ''}`;
  const asientoId = await insertarAsiento(
    teamId,
    { fecha: mov.fecha, concepto, origenTipo: 'gasto_caja', origenId: mov.id },
    [
      { cuentaId: cuentaGasto, debeCents: mov.montoCentavos, haberCents: 0, descripcion: 'Gasto de caja chica' },
      { cuentaId: cuentaCaja,  debeCents: 0, haberCents: mov.montoCentavos, descripcion: 'Salida de caja' },
    ],
    userId,
  );

  return asientoId === null
    ? { creado: false, motivo: 'ya-tiene-asiento' }
    : { creado: true, asientoId };
}

/**
 * Asiento de un GASTO documental (e43/e47) que NO pasó por caja. Cuando la caja
 * está habilitada, el gasto genera un movimiento y su asiento sale por
 * `generarAsientoGastoCaja`; este cubre el caso SIN caja, para que un negocio
 * sin el módulo igual tenga el rastro contable. El barrido solo lo invoca para
 * documentos sin movimiento de caja vinculado (evita doble asiento).
 * Debe cuenta de gastos / Haber caja (contado) o cuentas por pagar (crédito).
 * El monto total se lleva a gasto (los gastos menores no separan crédito de
 * ITBIS); refinar el ITBIS adelantado queda para después.
 */
export async function generarAsientoGastoDoc(
  teamId: number,
  docId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };

  const filas = await db.execute(sql`
    SELECT d.id, d.monto_total AS "montoTotal", d.tipo_pago AS "tipoPago",
           to_char(coalesce(d.fecha_gasto, d.fecha_emision, d.created_at) AT TIME ZONE 'America/Santo_Domingo', 'YYYY-MM-DD') AS fecha,
           d.razon_social_comprador AS "proveedor",
           (SELECT pr.metodo FROM pagos_recibidos pr WHERE pr.ecf_document_id = d.id ORDER BY pr.id LIMIT 1) AS "metodoPago"
    FROM ecf_documents d
    WHERE d.team_id = ${teamId} AND d.id = ${docId}
  `);
  const g = (filas as unknown as {
    id: number; montoTotal: number; tipoPago: number | null; fecha: string; proveedor: string | null; metodoPago: string | null;
  }[])[0];

  if (!g) return { creado: false, motivo: 'no-es-gasto' };
  if (g.montoTotal <= 0) return { creado: false, motivo: 'sin-monto' };

  const cuentaGasto = cfg.cuentaGastosId ?? await cuentaPorCodigo(teamId, '6101');
  if (!cuentaGasto) return { creado: false, motivo: 'sin-cuenta-gastos' };

  const esContado = (g.tipoPago ?? 1) === 1;
  const cuentaHaber = esContado
    ? (await resolverCuentaCobro(teamId, (g.metodoPago ?? 'efectivo') as ClaveMetodo)) ??
      await cuentaPorCodigo(teamId, '1101')
    : cfg.cuentaPorPagarId ?? await cuentaPorCodigo(teamId, '2101');
  if (!cuentaHaber) return { creado: false, motivo: esContado ? 'sin-cuenta-cobro' : 'sin-cuenta-por-pagar' };

  const concepto = `Gasto ${g.id}${g.proveedor ? ` · ${g.proveedor.slice(0, 60)}` : ''}`;
  const asientoId = await insertarAsiento(
    teamId,
    { fecha: g.fecha, concepto, origenTipo: 'gasto_doc', origenId: g.id },
    [
      { cuentaId: cuentaGasto, debeCents: g.montoTotal, haberCents: 0, descripcion: 'Gasto' },
      { cuentaId: cuentaHaber, debeCents: 0, haberCents: g.montoTotal, descripcion: esContado ? 'Pago del gasto' : 'Deuda por gasto' },
    ],
    userId,
  );

  return asientoId === null
    ? { creado: false, motivo: 'ya-tiene-asiento' }
    : { creado: true, asientoId };
}

// ─── Asiento de nómina ───────────────────────────────────────────────────────

/**
 * Asiento de una corrida de nómina al aprobarla. Partida doble del devengo:
 *
 *   DEBE  Gasto de sueldos            (bruto)
 *   DEBE  Gasto aportes patronales    (patronal)
 *   HABER Retenciones por pagar       (AFP+SFS+ISR del empleado)
 *   HABER Aportes patronales por pagar(patronal)
 *   HABER Sueldos por pagar           (neto)
 *
 * Cuadra: bruto + patronal (debe) = deducciones + patronal + neto (haber),
 * porque bruto = neto + deducciones. Cada línea usa su cuenta de nómina
 * dedicada si el team la configuró; si no, cae a la de gastos (6101) y la de
 * por-pagar (2101) genéricas — igual de correcto y balanceado.
 */
export async function generarAsientoNomina(
  teamId: number,
  corridaId: number,
  userId: number | null = null,
): Promise<ResultadoGeneracion> {
  const cfg = await getConfig(teamId);
  if (!cfg.activa) return { creado: false, motivo: 'contabilidad-apagada' };

  const filas = await db.execute(sql`
    SELECT descripcion,
           total_bruto_cents       AS "bruto",
           total_deducciones_cents AS "deducciones",
           total_neto_cents        AS "neto",
           total_patronal_cents    AS "patronal",
           to_char(coalesce(fecha_pago, (periodo || '-28')::date), 'YYYY-MM-DD') AS fecha
    FROM nomina_corridas
    WHERE team_id = ${teamId} AND id = ${corridaId}
  `);
  const fila = (filas as unknown as {
    descripcion: string; bruto: string | number; deducciones: string | number;
    neto: string | number; patronal: string | number; fecha: string;
  }[])[0];

  if (!fila) return { creado: false, motivo: 'no-es-gasto' };
  // Los BIGINT llegan como string desde el SQL crudo: coercionar a número o el
  // reduce de insertarAsiento concatenaría en vez de sumar y descuadraría.
  const c = {
    descripcion: fila.descripcion,
    fecha: fila.fecha,
    bruto:       Number(fila.bruto),
    deducciones: Number(fila.deducciones),
    neto:        Number(fila.neto),
    patronal:    Number(fila.patronal),
  };
  if (c.bruto <= 0) return { creado: false, motivo: 'sin-monto' };

  const cuentaGasto = cfg.cuentaGastosId ?? await cuentaPorCodigo(teamId, '6101');
  if (!cuentaGasto) return { creado: false, motivo: 'sin-cuenta-gastos' };
  const cuentaPorPagar = cfg.cuentaPorPagarId ?? await cuentaPorCodigo(teamId, '2101');
  if (!cuentaPorPagar) return { creado: false, motivo: 'sin-cuenta-por-pagar' };

  // Cuentas dedicadas de nómina: cada línea usa la suya si el team la configuró;
  // si no, cae DIRECTO a su genérica (gasto 6101 / por-pagar 2101). Así
  // configurar una sola cuenta mueve solo esa línea, sin arrastrar a las demás.
  const cSueldo        = cfg.cuentaNominaSueldoId ?? cuentaGasto;
  const cAportesGasto  = cfg.cuentaNominaAportesGastoId ?? cuentaGasto;
  const cRetenciones   = cfg.cuentaNominaRetencionesId ?? cuentaPorPagar;
  const cAportesPagar  = cfg.cuentaNominaAportesPagarId ?? cuentaPorPagar;
  const cSueldosPagar  = cfg.cuentaNominaPorPagarId ?? cuentaPorPagar;

  const lineas = [
    { cuentaId: cSueldo,       debeCents: c.bruto,       haberCents: 0, descripcion: 'Sueldos del período' },
    { cuentaId: cAportesGasto, debeCents: c.patronal,    haberCents: 0, descripcion: 'Aportes patronales TSS' },
    { cuentaId: cRetenciones,  debeCents: 0, haberCents: c.deducciones, descripcion: 'Retenciones por pagar (AFP/SFS/ISR)' },
    { cuentaId: cAportesPagar, debeCents: 0, haberCents: c.patronal,    descripcion: 'Aportes patronales por pagar' },
    { cuentaId: cSueldosPagar, debeCents: 0, haberCents: c.neto,        descripcion: 'Sueldos por pagar' },
  ].filter((l) => l.debeCents > 0 || l.haberCents > 0);

  const asientoId = await insertarAsiento(
    teamId,
    { fecha: c.fecha, concepto: `Nómina · ${c.descripcion}`, origenTipo: 'nomina', origenId: corridaId },
    lineas,
    userId,
  );

  return asientoId === null
    ? { creado: false, motivo: 'ya-tiene-asiento' }
    : { creado: true, asientoId };
}

// ─── Asiento manual ──────────────────────────────────────────────────────────

/** Error de validación de un asiento manual. La API lo traduce a 400. */
export class AsientoManualError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AsientoManualError';
  }
}

export interface LineaManualInput {
  cuentaId:    number;
  debeCents:   number;
  haberCents:  number;
  descripcion?: string | null;
}

export interface AsientoManualInput {
  /** 'YYYY-MM-DD'. */
  fecha:    string;
  concepto: string;
  lineas:   LineaManualInput[];
}

/**
 * Registra un asiento a mano: lo que no nace de una factura ni de un pago.
 *
 * A diferencia de la generación automática, **no depende del interruptor de la
 * contabilidad** (`cfg.activa`): ese interruptor gobierna el barrido de
 * documentos, no la voluntad explícita de un humano de anotar un ajuste. El
 * guardián de cuadre de `insertarAsiento` sigue siendo el mismo, así que un
 * asiento manual descuadrado tampoco puede existir.
 *
 * El `origen_id` sale de una secuencia (migración 0087): cada asiento manual es
 * único, sin la idempotencia de los automáticos —dos asientos manuales iguales
 * son dos asientos, no uno—.
 */
export async function generarAsientoManual(
  teamId: number,
  entrada: AsientoManualInput,
  userId: number | null = null,
): Promise<{ asientoId: number }> {
  const concepto = (entrada.concepto ?? '').trim();
  if (!concepto) throw new AsientoManualError('El concepto es obligatorio.');
  if (concepto.length > 255) throw new AsientoManualError('El concepto es demasiado largo.');

  // Fecha en formato y calendario válidos: una cadena rara reventaría el ::date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha)) {
    throw new AsientoManualError('La fecha no es válida.');
  }
  const d = new Date(`${entrada.fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== entrada.fecha) {
    throw new AsientoManualError('La fecha no existe en el calendario.');
  }

  const lineas = entrada.lineas ?? [];
  if (lineas.length < 2) {
    throw new AsientoManualError('Un asiento necesita al menos dos líneas.');
  }

  let totalDebe = 0;
  let totalHaber = 0;
  const limpias: LineaAsiento[] = [];
  for (const l of lineas) {
    if (!Number.isInteger(l.cuentaId) || l.cuentaId <= 0) {
      throw new AsientoManualError('Cada línea debe apuntar a una cuenta.');
    }
    const debe = Math.trunc(Number(l.debeCents) || 0);
    const haber = Math.trunc(Number(l.haberCents) || 0);
    if (debe < 0 || haber < 0) {
      throw new AsientoManualError('Los importes no pueden ser negativos.');
    }
    // Exactamente uno de los dos con valor, como exige el CHECK de la tabla.
    if ((debe > 0) === (haber > 0)) {
      throw new AsientoManualError('Cada línea es débito O crédito, no ambos ni ninguno.');
    }
    totalDebe += debe;
    totalHaber += haber;
    limpias.push({
      cuentaId: l.cuentaId,
      debeCents: debe,
      haberCents: haber,
      descripcion: (l.descripcion ?? '').trim().slice(0, 255) || concepto,
    });
  }

  if (totalDebe !== totalHaber) {
    throw new AsientoManualError(
      `El asiento no cuadra: debe ${totalDebe / 100} ≠ haber ${totalHaber / 100}.`,
    );
  }
  if (totalDebe === 0) {
    throw new AsientoManualError('El asiento no puede ser por cero.');
  }

  // Las cuentas tienen que ser de este team, imputables y activas: un asiento no
  // puede caer sobre una cuenta de agrupación ni sobre una desactivada.
  const ids = [...new Set(limpias.map((l) => l.cuentaId))];
  const cuentas = await db.execute(sql`
    SELECT id, imputable, activa
    FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
  `) as unknown as { id: number; imputable: boolean; activa: boolean }[];

  const porId = new Map(cuentas.map((c) => [c.id, c]));
  for (const id of ids) {
    const c = porId.get(id);
    if (!c) throw new AsientoManualError('Alguna cuenta no existe en este equipo.');
    if (!c.activa) throw new AsientoManualError('No se puede usar una cuenta desactivada.');
    if (!c.imputable) {
      throw new AsientoManualError('No se puede usar una cuenta de agrupación; elige una cuenta de detalle.');
    }
  }

  // origen_id único de la secuencia: cada asiento manual es distinto.
  const [{ origen_id: origenId }] = await db.execute<{ origen_id: number }>(sql`
    SELECT nextval('contabilidad_asiento_manual_seq')::int AS origen_id
  `);

  const asientoId = await insertarAsiento(
    teamId,
    { fecha: entrada.fecha, concepto, origenTipo: 'manual', origenId },
    limpias,
    userId,
  );

  // Con un origen_id fresco de la secuencia no puede haber conflicto; si acaso
  // pasara, es un error real y no una idempotencia esperada.
  if (asientoId === null) {
    throw new AsientoManualError('No se pudo guardar el asiento. Inténtalo de nuevo.');
  }

  return { asientoId };
}
