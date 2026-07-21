/**
 * lib/contabilidad/config.ts — Configuración contable: qué cuenta usar para
 * cada cosa, sin preguntarle al usuario en cada factura. Paso 3 del plan.
 *
 * Aquí NO se genera ningún asiento — eso es el Paso 4. Este archivo solo
 * responde "¿dónde va esto?".
 *
 * Las tres preguntas que sabe contestar:
 *   getConfig()             → las cuentas generales y si el módulo está activo
 *   resolverCuentaIngreso() → a qué cuenta va la venta de una línea de factura
 *   resolverCuentaCobro()   → a qué cuenta entra un pago recibido
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import {
  CLAVES_METODO, CLAVES_SIN_COBRO, CLAVE_METODO_LABEL, esPasarela,
  type ClaveMetodo,
} from './metodos';

// Las claves y etiquetas viven en `./metodos` porque la pantalla de
// configuración es un componente de cliente y no puede importar este archivo:
// `db` arrastra `postgres`, que necesita `fs`. Se reexportan para que el
// servidor siga teniendo un solo punto de entrada.
export {
  CLAVES_METODO, CLAVES_SIN_COBRO, CLAVE_METODO_LABEL, esPasarela,
} from './metodos';
export type { ClaveMetodo } from './metodos';

export interface ConfigContable {
  activa:              boolean;
  cuentaPorCobrarId:   number | null;
  cuentaItbisId:       number | null;
  cuentaIngresosId:    number | null;
  cuentaDescuentosId:  number | null;
  cuentaMoraId:        number | null;
}

const CONFIG_VACIA: ConfigContable = {
  activa: false,
  cuentaPorCobrarId: null, cuentaItbisId: null, cuentaIngresosId: null,
  cuentaDescuentosId: null, cuentaMoraId: null,
};

// ─── Lectura ─────────────────────────────────────────────────────────────────

/** La configuración general. Devuelve una vacía si el team nunca la tocó. */
export async function getConfig(teamId: number): Promise<ConfigContable> {
  const rows = await db.execute(sql`
    SELECT activa,
           cuenta_por_cobrar_id  AS "cuentaPorCobrarId",
           cuenta_itbis_id       AS "cuentaItbisId",
           cuenta_ingresos_id    AS "cuentaIngresosId",
           cuenta_descuentos_id  AS "cuentaDescuentosId",
           cuenta_mora_id        AS "cuentaMoraId"
    FROM contabilidad_config
    WHERE team_id = ${teamId}
  `);
  return (rows as unknown as ConfigContable[])[0] ?? CONFIG_VACIA;
}

export interface MetodoConfigurado {
  clave:             ClaveMetodo;
  cuentaId:          number;
  cuentaCodigo:      string;
  cuentaNombre:      string;
  cuentaComisionId:  number | null;
  cuentaComisionCodigo: string | null;
}

export async function getMetodosConfigurados(teamId: number): Promise<MetodoConfigurado[]> {
  const rows = await db.execute(sql`
    SELECT m.clave, m.cuenta_id AS "cuentaId",
           c.codigo AS "cuentaCodigo", c.nombre AS "cuentaNombre",
           m.cuenta_comision_id AS "cuentaComisionId",
           cc.codigo AS "cuentaComisionCodigo"
    FROM contabilidad_config_metodos_pago m
    JOIN contabilidad_cuentas c  ON c.id = m.cuenta_id
    LEFT JOIN contabilidad_cuentas cc ON cc.id = m.cuenta_comision_id
    WHERE m.team_id = ${teamId}
    ORDER BY m.clave
  `);
  return rows as unknown as MetodoConfigurado[];
}

export interface OverrideIngreso {
  id:           number;
  categoriaId:  number | null;
  productoId:   number | null;
  /** Nombre de la categoría o del producto, para mostrarlo sin otra consulta. */
  destinoNombre: string;
  cuentaId:     number;
  cuentaCodigo: string;
  cuentaNombre: string;
}

export async function getOverridesIngreso(teamId: number): Promise<OverrideIngreso[]> {
  const rows = await db.execute(sql`
    SELECT i.id, i.categoria_id AS "categoriaId", i.producto_id AS "productoId",
           COALESCE(cat.nombre, p.nombre) AS "destinoNombre",
           i.cuenta_id AS "cuentaId",
           c.codigo AS "cuentaCodigo", c.nombre AS "cuentaNombre"
    FROM contabilidad_config_ingresos i
    JOIN contabilidad_cuentas c ON c.id = i.cuenta_id
    LEFT JOIN categorias cat ON cat.id = i.categoria_id
    LEFT JOIN products   p   ON p.id   = i.producto_id
    WHERE i.team_id = ${teamId}
    ORDER BY "destinoNombre"
  `);
  return rows as unknown as OverrideIngreso[];
}

// ─── Escritura ───────────────────────────────────────────────────────────────

/** Error de regla de negocio: la API lo traduce a 400/409. */
export class ConfigError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Valida que la cuenta exista, sea del team, esté activa y **acepte
 * movimientos**.
 *
 * Lo último es lo que importa: apuntar la configuración a una cuenta de
 * agrupación produciría asientos sobre una cuenta que por definición no los
 * recibe, y el saldo de sus hijas dejaría de sumar el total. Se ataja aquí, al
 * configurar, y no cuando ya hay 500 asientos mal puestos.
 */
async function validarCuenta(teamId: number, cuentaId: number): Promise<void> {
  const rows = await db.execute(sql`
    SELECT codigo, nombre, activa, imputable
    FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND id = ${cuentaId}
  `);
  const c = (rows as unknown as { codigo: string; nombre: string; activa: boolean; imputable: boolean }[])[0];

  if (!c) throw new ConfigError('La cuenta no existe en el catálogo de esta empresa.', 404);
  if (!c.imputable) {
    throw new ConfigError(
      `"${c.codigo} ${c.nombre}" es una cuenta de agrupación y no acepta movimientos. ` +
      'Elige una de las que cuelgan de ella.',
      409,
    );
  }
  if (!c.activa) {
    throw new ConfigError(`"${c.codigo} ${c.nombre}" está desactivada. Actívala o elige otra.`, 409);
  }
}

export interface GuardarConfigInput {
  cuentaPorCobrarId?:  number | null;
  cuentaItbisId?:      number | null;
  cuentaIngresosId?:   number | null;
  cuentaDescuentosId?: number | null;
  cuentaMoraId?:       number | null;
}

export async function guardarConfig(
  teamId: number,
  input: GuardarConfigInput,
  userId: number,
): Promise<ConfigContable> {
  for (const id of Object.values(input)) {
    if (typeof id === 'number') await validarCuenta(teamId, id);
  }

  const campos: Record<string, string> = {
    cuentaPorCobrarId:  'cuenta_por_cobrar_id',
    cuentaItbisId:      'cuenta_itbis_id',
    cuentaIngresosId:   'cuenta_ingresos_id',
    cuentaDescuentosId: 'cuenta_descuentos_id',
    cuentaMoraId:       'cuenta_mora_id',
  };

  const entradas = Object.entries(input)
    .filter(([k, v]) => k in campos && v !== undefined) as [keyof GuardarConfigInput, number | null][];

  if (entradas.length === 0) return getConfig(teamId);

  // UPSERT: la fila puede no existir todavía si el team nunca configuró nada.
  const cols = entradas.map(([k]) => sql.raw(campos[k]));
  const vals = entradas.map(([, v]) => sql`${v}`);
  const sets = entradas.map(([k, v]) => sql`${sql.raw(campos[k])} = ${v}`);

  await db.execute(sql`
    INSERT INTO contabilidad_config (team_id, ${sql.join(cols, sql`, `)}, updated_by, updated_at)
    VALUES (${teamId}, ${sql.join(vals, sql`, `)}, ${userId}, now())
    ON CONFLICT (team_id) DO UPDATE
      SET ${sql.join(sets, sql`, `)}, updated_by = ${userId}, updated_at = now()
  `);

  return getConfig(teamId);
}

/** Asigna (o reasigna) la cuenta de un método de cobro. */
export async function guardarMetodo(
  teamId: number,
  clave: ClaveMetodo,
  cuentaId: number,
  cuentaComisionId: number | null,
  userId: number,
): Promise<void> {
  if (!(CLAVES_METODO as readonly string[]).includes(clave)) {
    throw new ConfigError(`Método de cobro desconocido: ${clave}.`);
  }
  if (CLAVES_SIN_COBRO.includes(clave)) {
    throw new ConfigError(
      `"${CLAVE_METODO_LABEL[clave]}" no mueve dinero: es la aplicación de un crédito que el cliente ya tenía, ` +
      'y su asiento va contra la cuenta de descuentos. No lleva cuenta de cobro.',
      409,
    );
  }

  await validarCuenta(teamId, cuentaId);
  if (cuentaComisionId !== null) await validarCuenta(teamId, cuentaComisionId);

  // La comisión solo tiene sentido en las pasarelas: son las únicas que retienen
  // al liquidar. En un cobro en efectivo no hay comisión que registrar.
  if (cuentaComisionId !== null && !esPasarela(clave)) {
    throw new ConfigError(
      `"${CLAVE_METODO_LABEL[clave]}" no tiene comisión que registrar. ` +
      'La cuenta de comisión es solo para los links de pago.',
      409,
    );
  }

  await db.execute(sql`
    INSERT INTO contabilidad_config_metodos_pago
      (team_id, clave, cuenta_id, cuenta_comision_id, updated_by, updated_at)
    VALUES (${teamId}, ${clave}, ${cuentaId}, ${cuentaComisionId}, ${userId}, now())
    ON CONFLICT (team_id, clave) DO UPDATE
      SET cuenta_id = ${cuentaId}, cuenta_comision_id = ${cuentaComisionId},
          updated_by = ${userId}, updated_at = now()
  `);
}

export async function borrarMetodo(teamId: number, clave: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM contabilidad_config_metodos_pago
    WHERE team_id = ${teamId} AND clave = ${clave}
  `);
}

/** Crea o actualiza un override de ingreso. Exactamente uno de los dos destinos. */
export async function guardarOverrideIngreso(
  teamId: number,
  destino: { categoriaId?: number | null; productoId?: number | null },
  cuentaId: number,
  userId: number,
): Promise<void> {
  const { categoriaId = null, productoId = null } = destino;

  if ((categoriaId === null) === (productoId === null)) {
    throw new ConfigError('Elige una categoría o un producto, pero no ambos.');
  }
  await validarCuenta(teamId, cuentaId);

  // Que el destino sea de este team: sin esto, un id ajeno pasaría la FK (que
  // no sabe de teams) y se configuraría contra el producto de otra empresa.
  const tabla = categoriaId !== null ? 'categorias' : 'products';
  const destinoId = categoriaId ?? productoId;
  const [{ existe }] = await db.execute<{ existe: boolean }>(sql`
    SELECT EXISTS(
      SELECT 1 FROM ${sql.raw(tabla)}
      WHERE id = ${destinoId} AND team_id = ${teamId}
    ) AS existe
  `);
  if (!existe) {
    throw new ConfigError(
      categoriaId !== null ? 'Esa categoría no existe.' : 'Ese producto no existe.',
      404,
    );
  }

  const conflicto = categoriaId !== null
    ? sql`(team_id, categoria_id) WHERE categoria_id IS NOT NULL`
    : sql`(team_id, producto_id) WHERE producto_id IS NOT NULL`;

  await db.execute(sql`
    INSERT INTO contabilidad_config_ingresos
      (team_id, categoria_id, producto_id, cuenta_id, updated_by, updated_at)
    VALUES (${teamId}, ${categoriaId}, ${productoId}, ${cuentaId}, ${userId}, now())
    ON CONFLICT ${conflicto} DO UPDATE
      SET cuenta_id = ${cuentaId}, updated_by = ${userId}, updated_at = now()
  `);
}

export async function borrarOverrideIngreso(teamId: number, id: number): Promise<void> {
  await db.execute(sql`
    DELETE FROM contabilidad_config_ingresos
    WHERE team_id = ${teamId} AND id = ${id}
  `);
}

// ─── Resolución ──────────────────────────────────────────────────────────────

/**
 * Traduce un pago recibido a su clave contable.
 *
 * **Esta función existe por una trampa concreta.** Un cobro por link de pago
 * (CardNet/Azul) se guarda en `pagos_recibidos` con `metodo = 'tarjeta'`,
 * exactamente igual que una tarjeta pasada en el mostrador — ver
 * `lib/pagos/links.ts`, donde se llama a `registrarPago({ metodo: 'tarjeta' })`.
 * Lo único que los diferencia de forma fiable es que existe una fila en
 * `payment_links` apuntando a ese pago.
 *
 * Contablemente **no son lo mismo**: el cobro en línea no entra al banco en el
 * momento. La pasarela liquida días después y retiene comisión. Si los tratamos
 * igual, el banco queda inflado con dinero que todavía no llegó.
 *
 * El campo `pagos_recibidos.cuenta` guarda 'Azul' / 'CardNet', pero es texto
 * libre editable por el usuario: no se puede usar como discriminador.
 */
export async function claveContableDePago(
  teamId: number,
  pagoId: number,
  metodo: string,
): Promise<ClaveMetodo> {
  if (metodo !== 'tarjeta') {
    return (CLAVES_METODO as readonly string[]).includes(metodo)
      ? metodo as ClaveMetodo
      : 'otro';
  }

  const rows = await db.execute(sql`
    SELECT provider
    FROM payment_links
    WHERE team_id = ${teamId} AND pago_recibido_id = ${pagoId}
    LIMIT 1
  `);
  const provider = (rows as unknown as { provider: string }[])[0]?.provider;

  if (provider === 'cardnet') return 'pasarela_cardnet';
  if (provider === 'azul')    return 'pasarela_azul';
  // Sin link asociado (o el simulador): tarjeta de mostrador.
  return 'tarjeta';
}

/**
 * A qué cuenta entra un cobro. `null` si esa clave no está configurada — quien
 * llame decide si eso es un error o un caso a saltar.
 */
export async function resolverCuentaCobro(
  teamId: number,
  clave: ClaveMetodo,
): Promise<number | null> {
  const rows = await db.execute(sql`
    SELECT cuenta_id AS "cuentaId"
    FROM contabilidad_config_metodos_pago
    WHERE team_id = ${teamId} AND clave = ${clave}
  `);
  return (rows as unknown as { cuentaId: number }[])[0]?.cuentaId ?? null;
}

/**
 * A qué cuenta de ingreso va la venta de un producto.
 *
 * Va de lo más específico a lo más general y se queda con el primero que
 * encuentre:
 *
 *   1. override del producto        — "este artículo en concreto va aparte"
 *   2. override de su categoría     — "todo lo de esta categoría va aparte"
 *   3. tipo del producto            — bien → 4101, servicio → 4104
 *   4. cuenta de ingresos general   — la red de seguridad
 *
 * El paso 3 no se configura: sale de `products.tipo`, que ya existe. Se resuelve
 * contra los códigos del catálogo base porque son estables por contrato; si el
 * usuario los borró, cae al paso 4.
 *
 * Todo en una consulta: esto se va a llamar una vez por línea de factura cuando
 * llegue el Paso 4, y no quiero 4 idas a la base por línea.
 */
export async function resolverCuentaIngreso(
  teamId: number,
  productoId: number | null,
): Promise<number | null> {
  const rows = await db.execute(sql`
    WITH cfg AS (
      SELECT cuenta_ingresos_id FROM contabilidad_config WHERE team_id = ${teamId}
    ),
    prod AS (
      SELECT id, tipo, categoria_id
      FROM products
      WHERE team_id = ${teamId} AND id = ${productoId}
    )
    SELECT COALESCE(
      -- 1. override del producto
      (SELECT cuenta_id FROM contabilidad_config_ingresos
        WHERE team_id = ${teamId} AND producto_id = (SELECT id FROM prod)),
      -- 2. override de su categoría
      (SELECT cuenta_id FROM contabilidad_config_ingresos
        WHERE team_id = ${teamId}
          AND categoria_id = (SELECT categoria_id FROM prod)
          AND categoria_id IS NOT NULL),
      -- 3. por tipo: bien → 4101, servicio → 4104
      (SELECT id FROM contabilidad_cuentas
        WHERE team_id = ${teamId} AND activa
          AND codigo = CASE (SELECT tipo FROM prod)
                         WHEN 'bien'     THEN '4101'
                         WHEN 'servicio' THEN '4104'
                       END),
      -- 4. la general
      (SELECT cuenta_ingresos_id FROM cfg)
    ) AS "cuentaId"
  `);
  return (rows as unknown as { cuentaId: number | null }[])[0]?.cuentaId ?? null;
}
