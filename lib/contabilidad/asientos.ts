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

/** Estados de un documento que representan una venta emitida y viva. */
const ESTADOS_VENTA = ['ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO'];
/** Tipos e-CF que suman ingreso. La nota de crédito (34) es del Paso 5. */
const TIPOS_VENTA = ['31', '32', '33', '44', '45'];

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
  | 'con-retenciones'
  | 'sin-cuenta-por-cobrar'
  | 'sin-cuenta-itbis'
  | 'sin-cuenta-ingresos'
  | 'sin-cuenta-cobro'
  | 'metodo-sin-cobro';

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
}

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
    SELECT id, encf, tipo_ecf AS "tipoEcf", estado,
           monto_total AS "montoTotal", total_itbis AS "totalItbis",
           COALESCE(total_retenciones, 0) AS "totalRetenciones",
           lineas_json AS "lineasJson",
           to_char(fecha_emision AT TIME ZONE 'America/Santo_Domingo', 'YYYY-MM-DD') AS fecha
    FROM ecf_documents
    WHERE team_id = ${teamId} AND id = ${documentoId}
  `);
  const doc = (filas as unknown as DocumentoParaAsiento[])[0];
  if (!doc) return { creado: false, motivo: 'no-es-venta' };

  if (!ESTADOS_VENTA.includes(doc.estado) || !TIPOS_VENTA.includes(doc.tipoEcf)) {
    return { creado: false, motivo: 'no-es-venta' };
  }
  if (doc.montoTotal <= 0) return { creado: false, motivo: 'sin-monto' };

  // Las retenciones cambian el asiento (parte del cobro va a la DGII y no a
  // caja) y son explícitamente del Paso 5. Generar uno "casi bien" para un
  // libro contable real es peor que no generarlo: el usuario no vería que está
  // mal hasta la declaración.
  if (doc.totalRetenciones > 0) return { creado: false, motivo: 'con-retenciones' };

  if (!cfg.cuentaPorCobrarId) return { creado: false, motivo: 'sin-cuenta-por-cobrar' };
  if (!cfg.cuentaIngresosId) return { creado: false, motivo: 'sin-cuenta-ingresos' };
  if (doc.totalItbis > 0 && !cfg.cuentaItbisId) {
    return { creado: false, motivo: 'sin-cuenta-itbis' };
  }

  const reparto = await repartirIngreso(teamId, doc, cfg.cuentaIngresosId);

  const lineas: LineaAsiento[] = [
    {
      cuentaId: cfg.cuentaPorCobrarId,
      debeCents: doc.montoTotal,
      haberCents: 0,
      descripcion: `Factura ${doc.encf ?? doc.id}`,
    },
    ...[...reparto.entries()].map(([cuentaId, monto]) => ({
      cuentaId,
      debeCents: 0,
      haberCents: monto,
      descripcion: 'Ingreso por ventas',
    })),
  ];

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
    {
      fecha: doc.fecha,
      concepto: `Factura ${doc.encf ?? doc.id}`,
      origenTipo: 'factura',
      origenId: doc.id,
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

  // saldo_favor y nota_credito no mueven dinero: son la aplicación de un
  // crédito previo y su asiento va contra descuentos, en el Paso 5.
  if (pago.metodo === 'saldo_favor' || pago.metodo === 'nota_credito') {
    return { creado: false, motivo: 'metodo-sin-cobro' };
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
