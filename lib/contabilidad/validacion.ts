/**
 * lib/contabilidad/validacion.ts — Subpaso 4 del Paso 3: avisar de la
 * configuración incompleta ANTES de que alguien intente generar asientos.
 *
 * La idea es que el usuario no descubra que le falta la cuenta de ITBIS cuando
 * ya emitió 200 facturas sin asiento. Devuelve los huecos concretos, no un
 * booleano: "falta la cuenta de ITBIS" es accionable, "configuración incompleta"
 * no.
 *
 * El interruptor `activa` de `contabilidad_config` es el modo "sin contabilidad"
 * que pide el plan: mientras esté apagado, el módulo funciona como catálogo y
 * nada más. `activarContabilidad()` se niega a encenderlo si falta algo.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { getConfig, CLAVES_SIN_COBRO, CLAVE_METODO_LABEL, type ClaveMetodo } from './config';

export interface Hueco {
  /** Identificador estable, para que la UI sepa a qué campo saltar. */
  clave:   string;
  /** Qué falta, en lenguaje de usuario. */
  que:     string;
  /** Por qué hace falta — lo que se rompe si no está. */
  porque:  string;
  seccion: 'general' | 'metodos';
}

export interface EstadoConfiguracion {
  activa:    boolean;
  completa:  boolean;
  huecos:    Hueco[];
  /** Métodos de cobro realmente usados por este team que no tienen cuenta. */
  metodosSinCuenta: ClaveMetodo[];
}

/** Las 5 cuentas generales y qué se rompe sin cada una. */
const GENERALES: { campo: keyof Awaited<ReturnType<typeof getConfig>>; que: string; porque: string }[] = [
  {
    campo: 'cuentaPorCobrarId',
    que: 'Cuenta por cobrar',
    porque: 'Sin ella no se puede registrar lo que un cliente queda debiendo al emitir una factura a crédito.',
  },
  {
    campo: 'cuentaItbisId',
    que: 'Cuenta de ITBIS por pagar',
    porque: 'El ITBIS que cobras no es tuyo: es de la DGII. Sin esta cuenta el impuesto quedaría mezclado con tus ingresos.',
  },
  {
    campo: 'cuentaIngresosId',
    que: 'Cuenta de ingresos por defecto',
    porque: 'Es la red de seguridad para los productos que no caen en ninguna regla más específica.',
  },
  {
    campo: 'cuentaDescuentosId',
    que: 'Cuenta de descuentos y devoluciones',
    porque: 'Sin ella, una nota de crédito no tendría dónde restar y las ventas netas saldrían infladas.',
  },
  {
    campo: 'cuentaMoraId',
    que: 'Cuenta de ingresos por mora',
    porque: 'Los recargos por mora son un ingreso distinto de las ventas; mezclarlos distorsiona el margen del negocio.',
  },
];

/**
 * Qué falta para poder generar asientos.
 *
 * Sobre los métodos de cobro: **solo se exigen los que el team usa de verdad**,
 * mirando su historial de `pagos_recibidos`. Pedirle a una panadería que
 * configure la cuenta de "Link de pago Azul" cuando nunca ha cobrado en línea es
 * ruido, y el ruido hace que la gente apague la validación entera.
 */
export async function getEstadoConfiguracion(teamId: number): Promise<EstadoConfiguracion> {
  const cfg = await getConfig(teamId);
  const huecos: Hueco[] = [];

  for (const g of GENERALES) {
    if (cfg[g.campo] === null || cfg[g.campo] === undefined) {
      huecos.push({ clave: g.campo, que: g.que, porque: g.porque, seccion: 'general' });
    }
  }

  const metodosSinCuenta = await getMetodosUsadosSinCuenta(teamId);
  for (const clave of metodosSinCuenta) {
    huecos.push({
      clave,
      que: `Cuenta para cobros por ${CLAVE_METODO_LABEL[clave].toLowerCase()}`,
      porque: 'Este equipo ya ha recibido pagos por esta vía, así que sus asientos no se podrían cuadrar.',
      seccion: 'metodos',
    });
  }

  return {
    activa: cfg.activa,
    completa: huecos.length === 0,
    huecos,
    metodosSinCuenta,
  };
}

/**
 * Métodos que este team ha usado alguna vez y todavía no tienen cuenta.
 *
 * La clave contable de un cobro por link es 'pasarela_cardnet'/'pasarela_azul',
 * no 'tarjeta' — ver `claveContableDePago()`. Aquí se hace la misma traducción
 * en SQL para no traerse todos los pagos a memoria: un `LEFT JOIN` contra
 * `payment_links` basta, porque solo interesa QUÉ claves existen, no cuántas.
 */
async function getMetodosUsadosSinCuenta(teamId: number): Promise<ClaveMetodo[]> {
  const rows = await db.execute(sql`
    WITH usados AS (
      SELECT DISTINCT
        CASE
          WHEN p.metodo = 'tarjeta' AND pl.provider = 'cardnet' THEN 'pasarela_cardnet'
          WHEN p.metodo = 'tarjeta' AND pl.provider = 'azul'    THEN 'pasarela_azul'
          ELSE p.metodo
        END AS clave
      FROM pagos_recibidos p
      LEFT JOIN payment_links pl
        ON pl.pago_recibido_id = p.id AND pl.team_id = p.team_id
      WHERE p.team_id = ${teamId}
    )
    SELECT u.clave
    FROM usados u
    LEFT JOIN contabilidad_config_metodos_pago m
      ON m.team_id = ${teamId} AND m.clave = u.clave
    WHERE m.id IS NULL
      -- Lista expandida a parámetros sueltos: pasar el array de JS directo
      -- falla con "op ANY/ALL (array) requires array on right side", porque
      -- llega como un parámetro escalar y no como array de Postgres.
      AND u.clave NOT IN (${sql.join(CLAVES_SIN_COBRO.map((c) => sql`${c}`), sql`, `)})
    ORDER BY u.clave
  `);

  // Un método histórico que ya no se ofrece (tarjeta_credito, cash) no está en
  // la lista de claves válidas; se ignora en vez de pedir configurarlo.
  return (rows as unknown as { clave: string }[])
    .map((r) => r.clave)
    .filter((c): c is ClaveMetodo => c in CLAVE_METODO_LABEL);
}

/** Error de configuración: la API lo traduce a 409. */
export class ConfigIncompletaError extends Error {
  constructor(readonly huecos: Hueco[]) {
    super(`Faltan ${huecos.length} cosa(s) por configurar antes de activar la contabilidad.`);
    this.name = 'ConfigIncompletaError';
  }
}

/**
 * Enciende el módulo contable. **Se niega si falta configuración**: activar con
 * huecos generaría asientos descuadrados, que es peor que no generarlos.
 *
 * Apagar sí es libre — siempre se puede volver al modo "sin contabilidad".
 */
export async function setContabilidadActiva(
  teamId: number,
  activa: boolean,
  userId: number,
): Promise<void> {
  if (activa) {
    const estado = await getEstadoConfiguracion(teamId);
    if (!estado.completa) throw new ConfigIncompletaError(estado.huecos);
  }

  await db.execute(sql`
    INSERT INTO contabilidad_config (team_id, activa, updated_by, updated_at)
    VALUES (${teamId}, ${activa}, ${userId}, now())
    ON CONFLICT (team_id) DO UPDATE
      SET activa = ${activa}, updated_by = ${userId}, updated_at = now()
  `);
}
