/**
 * lib/contabilidad/cuentas.ts — Catálogo de cuentas: leer, crear, editar,
 * desactivar y borrar, con las protecciones que exige el Paso 2 del plan.
 *
 * Las reglas duras viven aquí y no en la UI, porque la API también las necesita
 * y una guarda que solo existe en el formulario no es una guarda.
 *
 * Sobre "tiene movimientos": desde el Paso 4 la tabla de asientos existe, así
 * que `tieneMovimientos` protege de verdad — una cuenta con apuntes ya no se
 * puede borrar, ni cambiarle el código o el tipo. La comprobación con
 * `to_regclass` se conserva por si el módulo corre contra una base donde la
 * migración 0085 todavía no se aplicó.
 */

import { db } from '@/lib/db/drizzle';
import { vetoDeClase } from './clase-cuenta';
import { sql } from 'drizzle-orm';
import {
  naturalezaPorTipo,
  type TipoCuenta,
  type NaturalezaCuenta,
} from './catalogo-base';

/**
 * Con qué se habla con la base: `db` normalmente, o una transacción.
 *
 * Existe para la importación desde Excel. Un catálogo se importa entero o no se
 * importa —medio catálogo con los padres creados y las hijas no es peor que
 * nada—, así que todo corre en una transacción. Y tiene que pasar por
 * EXACTAMENTE las mismas reglas que el formulario: por eso estas funciones
 * aceptan el ejecutor en vez de duplicarse en una versión «para importar».
 */
export type Ejecutor = Pick<typeof db, 'execute'>;

const TIPOS: TipoCuenta[] = ['activo', 'pasivo', 'patrimonio', 'ingreso', 'costo', 'gasto'];
const NATURALEZAS: NaturalezaCuenta[] = ['deudora', 'acreedora'];

export interface Cuenta {
  id:            number;
  codigo:        string;
  nombre:        string;
  tipo:          TipoCuenta;
  naturaleza:    NaturalezaCuenta;
  cuentaPadreId: number | null;
  imputable:     boolean;
  activa:        boolean;
  /** Apuntes contables que ya tiene. 0 = se puede cambiar todo. */
  movimientos:   number;
  esBase:        boolean;
}

export interface CuentaNodo extends Cuenta {
  hijas: CuentaNodo[];
  /** Profundidad en el árbol, 0 para las raíces. Para indentar en la tabla. */
  nivel: number;
}

/** Error de regla de negocio: la API lo traduce a 400/409 en vez de 500. */
export class CuentaError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'CuentaError';
  }
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listarCuentas(
  teamId: number,
  opts: { incluirInactivas?: boolean } = {},
  ex: Ejecutor = db,
): Promise<Cuenta[]> {
  const rows = await ex.execute(sql`
    SELECT id, codigo, nombre, tipo, naturaleza,
           cuenta_padre_id AS "cuentaPadreId",
           imputable, activa, es_base AS "esBase"
    FROM contabilidad_cuentas
    WHERE team_id = ${teamId}
      ${opts.incluirInactivas ? sql`` : sql`AND activa`}
    ORDER BY codigo
  `);
  const cuentas = rows as unknown as Cuenta[];
  const apuntes = await conteoMovimientos(teamId, ex);
  return cuentas.map((c) => ({ ...c, movimientos: apuntes.get(c.id) ?? 0 }));
}

/**
 * Cuántos apuntes tiene cada cuenta. La pantalla lo necesita para decir qué se
 * puede cambiar y qué no (ver `clase-cuenta`). Va aparte y con el mismo
 * `to_regclass` que `tieneMovimientos` para no reventar contra una base sin la
 * tabla de asientos; sale del índice (team_id, cuenta_id), así que no cuesta.
 */
async function conteoMovimientos(teamId: number, ex: Ejecutor = db): Promise<Map<number, number>> {
  const [{ existe }] = await ex.execute<{ existe: boolean }>(sql`
    SELECT to_regclass('public.contabilidad_asiento_lineas') IS NOT NULL AS existe
  `);
  if (!existe) return new Map();

  const filas = await ex.execute<{ cuentaId: number; total: number }>(sql`
    SELECT cuenta_id AS "cuentaId", count(*)::int AS total
    FROM contabilidad_asiento_lineas
    WHERE team_id = ${teamId}
    GROUP BY cuenta_id
  `);
  return new Map((filas as unknown as { cuentaId: number; total: number }[]).map((f) => [f.cuentaId, f.total]));
}

/**
 * El catálogo como árbol. Se arma en memoria y no con un CTE recursivo: un plan
 * de cuentas son decenas o cientos de filas, no miles, y el árbol en JS es más
 * fácil de leer que la consulta recursiva equivalente.
 *
 * Una cuenta cuyo padre no esté en el resultado (por ejemplo, un padre inactivo
 * cuando se piden solo las activas) se trata como raíz en vez de desaparecer:
 * ocultar cuentas activas porque su padre está apagado sería peor que
 * mostrarlas descolgadas.
 */
export async function listarCuentasArbol(
  teamId: number,
  opts: { incluirInactivas?: boolean } = {},
): Promise<CuentaNodo[]> {
  const planas = await listarCuentas(teamId, opts);
  const porId = new Map<number, CuentaNodo>(
    planas.map((c) => [c.id, { ...c, hijas: [], nivel: 0 }]),
  );

  const raices: CuentaNodo[] = [];
  for (const nodo of porId.values()) {
    const padre = nodo.cuentaPadreId !== null ? porId.get(nodo.cuentaPadreId) : undefined;
    if (padre) padre.hijas.push(nodo);
    else raices.push(nodo);
  }

  const fijarNivel = (nodos: CuentaNodo[], nivel: number) => {
    for (const n of nodos) {
      n.nivel = nivel;
      n.hijas.sort((a, b) => a.codigo.localeCompare(b.codigo));
      fijarNivel(n.hijas, nivel + 1);
    }
  };
  raices.sort((a, b) => a.codigo.localeCompare(b.codigo));
  fijarNivel(raices, 0);

  return raices;
}

async function getCuenta(teamId: number, id: number, ex: Ejecutor = db): Promise<Cuenta | null> {
  const rows = await ex.execute(sql`
    SELECT id, codigo, nombre, tipo, naturaleza,
           cuenta_padre_id AS "cuentaPadreId",
           imputable, activa, es_base AS "esBase"
    FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND id = ${id}
  `);
  const cuenta = (rows as unknown as Cuenta[])[0];
  return cuenta ? { ...cuenta, movimientos: await contarMovimientos(teamId, id, ex) } : null;
}

// ─── Guardas ─────────────────────────────────────────────────────────────────

/**
 * ¿La cuenta tiene asientos contables?
 *
 * La tabla `contabilidad_asiento_lineas` llega en el Paso 4. Hasta entonces
 * esta función devuelve `false` — pero la consulta ya está escrita, así que en
 * cuanto la tabla exista empieza a proteger sin tocar este archivo.
 *
 * El `to_regclass` es la forma barata de preguntarle a Postgres si una tabla
 * existe sin que la consulta reviente con `42P01`.
 */
export async function tieneMovimientos(teamId: number, cuentaId: number, ex: Ejecutor = db): Promise<boolean> {
  return (await contarMovimientos(teamId, cuentaId, ex)) > 0;
}

/** Cuántos apuntes tiene una cuenta. 0 también cuando la tabla todavía no existe. */
async function contarMovimientos(teamId: number, cuentaId: number, ex: Ejecutor = db): Promise<number> {
  const [{ existe }] = await ex.execute<{ existe: boolean }>(sql`
    SELECT to_regclass('public.contabilidad_asiento_lineas') IS NOT NULL AS existe
  `);
  if (!existe) return 0;

  const [{ total }] = await ex.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total
    FROM contabilidad_asiento_lineas
    WHERE team_id = ${teamId} AND cuenta_id = ${cuentaId}
  `);
  return total;
}

/**
 * El ejercicio cerrado más reciente que cubre apuntes de esta cuenta, o null.
 * Un cierre declaró un resultado con la cuenta en la sección donde estaba, así
 * que reclasificarla después dejaría ese cierre sin cuadrar.
 */
async function ejercicioCerradoDeLaCuenta(teamId: number, cuentaId: number, ex: Ejecutor = db): Promise<number | null> {
  const [{ existe }] = await ex.execute<{ existe: boolean }>(sql`
    SELECT to_regclass('public.contabilidad_cierres') IS NOT NULL AS existe
  `);
  if (!existe) return null;

  const filas = await ex.execute<{ ejercicio: number | null }>(sql`
    SELECT max(c.ejercicio)::int AS ejercicio
    FROM contabilidad_cierres c
    WHERE c.team_id = ${teamId}
      AND EXISTS (
        SELECT 1 FROM contabilidad_asiento_lineas l
        JOIN contabilidad_asientos a ON a.id = l.asiento_id
        WHERE l.team_id = ${teamId} AND l.cuenta_id = ${cuentaId}
          AND extract(year FROM a.fecha) <= c.ejercicio
      )
  `);
  return (filas as unknown as { ejercicio: number | null }[])[0]?.ejercicio ?? null;
}

async function tieneHijas(teamId: number, cuentaId: number, ex: Ejecutor = db): Promise<boolean> {
  const [{ total }] = await ex.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total
    FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND cuenta_padre_id = ${cuentaId}
  `);
  return total > 0;
}

/**
 * Valida que colgar `cuentaId` de `padreId` no forme un ciclo.
 *
 * El CHECK de la tabla solo ataja el autopadre (A → A). Un ciclo largo
 * (A → B → A) hay que buscarlo subiendo por la cadena de padres. Sin esto, el
 * armado del árbol entraría en recursión infinita.
 */
async function creariaCiclo(teamId: number, cuentaId: number, padreId: number, ex: Ejecutor = db): Promise<boolean> {
  const [{ ciclo }] = await ex.execute<{ ciclo: boolean }>(sql`
    WITH RECURSIVE cadena AS (
      SELECT id, cuenta_padre_id
      FROM contabilidad_cuentas
      WHERE team_id = ${teamId} AND id = ${padreId}
      UNION ALL
      SELECT c.id, c.cuenta_padre_id
      FROM contabilidad_cuentas c
      JOIN cadena ON c.id = cadena.cuenta_padre_id
      WHERE c.team_id = ${teamId}
    )
    SELECT bool_or(id = ${cuentaId}) AS ciclo FROM cadena
  `);
  return ciclo === true;
}

function validarCampos(input: { codigo?: string; nombre?: string; tipo?: string; naturaleza?: string }) {
  if (input.codigo !== undefined && !input.codigo.trim()) {
    throw new CuentaError('El código no puede estar vacío.');
  }
  if (input.codigo !== undefined && input.codigo.trim().length > 20) {
    throw new CuentaError('El código no puede pasar de 20 caracteres.');
  }
  if (input.nombre !== undefined && !input.nombre.trim()) {
    throw new CuentaError('El nombre no puede estar vacío.');
  }
  if (input.tipo !== undefined && !TIPOS.includes(input.tipo as TipoCuenta)) {
    throw new CuentaError(`Tipo inválido. Debe ser uno de: ${TIPOS.join(', ')}.`);
  }
  if (input.naturaleza !== undefined && !NATURALEZAS.includes(input.naturaleza as NaturalezaCuenta)) {
    throw new CuentaError('La naturaleza debe ser "deudora" o "acreedora".');
  }
}

/** Valida que el padre exista, sea del team y no sea imputable. */
async function validarPadre(teamId: number, padreId: number, ex: Ejecutor = db): Promise<void> {
  const padre = await getCuenta(teamId, padreId, ex);
  if (!padre) throw new CuentaError('La cuenta padre no existe.', 404);
  if (padre.imputable) {
    throw new CuentaError(
      `"${padre.codigo} ${padre.nombre}" acepta movimientos, así que no puede tener cuentas hijas. ` +
      'Quítale "acepta movimientos" primero, o elige otra cuenta padre.',
      409,
    );
  }
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export interface CrearCuentaInput {
  codigo:        string;
  nombre:        string;
  tipo:          TipoCuenta;
  /** Si se omite, se toma la que corresponde a la clase. */
  naturaleza?:   NaturalezaCuenta;
  cuentaPadreId?: number | null;
  imputable?:    boolean;
}

export async function crearCuenta(
  teamId: number,
  input: CrearCuentaInput,
  userId: number,
  ex: Ejecutor = db,
): Promise<Cuenta> {
  validarCampos(input);

  const codigo = input.codigo.trim();
  const nombre = input.nombre.trim();
  const naturaleza = input.naturaleza ?? naturalezaPorTipo(input.tipo);
  const imputable = input.imputable ?? true;

  if (input.cuentaPadreId != null) {
    await validarPadre(teamId, input.cuentaPadreId, ex);
  }

  const rows = await ex.execute(sql`
    INSERT INTO contabilidad_cuentas
      (team_id, codigo, nombre, tipo, naturaleza, cuenta_padre_id,
       imputable, activa, es_base, created_by, updated_by)
    VALUES (${teamId}, ${codigo}, ${nombre}, ${input.tipo}, ${naturaleza},
            ${input.cuentaPadreId ?? null}, ${imputable}, true, false,
            ${userId}, ${userId})
    ON CONFLICT (team_id, codigo) DO NOTHING
    RETURNING id, codigo, nombre, tipo, naturaleza,
              cuenta_padre_id AS "cuentaPadreId",
              imputable, activa, es_base AS "esBase"
  `);

  const creada = (rows as unknown as Cuenta[])[0];
  if (!creada) {
    throw new CuentaError(`Ya existe una cuenta con el código ${codigo}.`, 409);
  }
  return { ...creada, movimientos: 0 };
}

export interface EditarCuentaInput {
  codigo?:       string;
  nombre?:       string;
  tipo?:         TipoCuenta;
  naturaleza?:   NaturalezaCuenta;
  cuentaPadreId?: number | null;
  imputable?:    boolean;
  activa?:       boolean;
}

export async function editarCuenta(
  teamId: number,
  id: number,
  input: EditarCuentaInput,
  userId: number,
  ex: Ejecutor = db,
): Promise<Cuenta> {
  validarCampos(input);

  const actual = await getCuenta(teamId, id, ex);
  if (!actual) throw new CuentaError('La cuenta no existe.', 404);

  const conMovimientos = await tieneMovimientos(teamId, id, ex);

  // El código es el identificador con el que trabaja el contador y por el que se
  // referencian los reportes históricos. Con movimientos encima, cambiarlo
  // rompería la trazabilidad hacia atrás.
  if (input.codigo !== undefined && input.codigo.trim() !== actual.codigo && conMovimientos) {
    throw new CuentaError(
      `La cuenta ${actual.codigo} ya tiene movimientos contables, así que su código no se puede cambiar. ` +
      'El nombre sí.',
      409,
    );
  }

  // Corregir la clase de una cuenta con apuntes encima SÍ se puede: no mueve
  // ningún asiento, solo cambia en qué reporte sale. Lo que se veta es
  // invertirle la naturaleza o tocar un ejercicio cerrado — ver `clase-cuenta`.
  const veto = vetoDeClase({
    tipoActual:       actual.tipo,
    tipoNuevo:        input.tipo ?? actual.tipo,
    naturalezaActual: actual.naturaleza,
    naturalezaNueva:  input.naturaleza ?? actual.naturaleza,
    conMovimientos,
    ejercicioCerrado: conMovimientos ? await ejercicioCerradoDeLaCuenta(teamId, id, ex) : null,
  });
  if (veto === 'naturaleza-invertida') {
    throw new CuentaError(
      `La cuenta ${actual.codigo} ya tiene movimientos, así que no se le puede invertir la naturaleza: ` +
      'todos sus saldos cambiarían de signo, también los de atrás. ' +
      'Crea la cuenta que necesitas y pasa el saldo con un asiento de reclasificación.',
      409,
    );
  }
  if (veto === 'ejercicio-cerrado') {
    throw new CuentaError(
      `La cuenta ${actual.codigo} tiene movimientos dentro de un ejercicio ya cerrado, así que su tipo no se puede cambiar: ` +
      'el cierre se declaró con esta cuenta donde estaba.',
      409,
    );
  }

  // Quitarle "acepta movimientos" a una cuenta que ya los tiene dejaría esos
  // asientos colgando de una cuenta que, por definición, no debería tenerlos.
  if (input.imputable === false && actual.imputable && conMovimientos) {
    throw new CuentaError(
      `La cuenta ${actual.codigo} ya tiene movimientos, así que tiene que seguir aceptándolos.`,
      409,
    );
  }

  // Volverla imputable teniendo hijas rompe la otra mitad de la regla: una
  // cuenta no puede a la vez agrupar y recibir asientos, porque su saldo sería
  // la suma de sus hijas MÁS lo suyo propio y no cuadraría con ninguna.
  if (input.imputable === true && !actual.imputable && await tieneHijas(teamId, id, ex)) {
    throw new CuentaError(
      `"${actual.codigo} ${actual.nombre}" tiene cuentas hijas, así que no puede aceptar movimientos directos. ` +
      'Los asientos van en las hijas.',
      409,
    );
  }

  if (input.cuentaPadreId !== undefined && input.cuentaPadreId !== null) {
    if (input.cuentaPadreId === id) {
      throw new CuentaError('Una cuenta no puede ser su propia cuenta padre.');
    }
    await validarPadre(teamId, input.cuentaPadreId, ex);
    if (await creariaCiclo(teamId, id, input.cuentaPadreId, ex)) {
      throw new CuentaError(
        'Esa cuenta padre es descendiente de esta, así que el catálogo quedaría en círculo.',
        409,
      );
    }
  }

  // Desactivar una cuenta con hijas activas las dejaría descolgadas del árbol.
  if (input.activa === false && actual.activa) {
    const [{ total }] = await ex.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total
      FROM contabilidad_cuentas
      WHERE team_id = ${teamId} AND cuenta_padre_id = ${id} AND activa
    `);
    if (total > 0) {
      throw new CuentaError(
        `"${actual.codigo} ${actual.nombre}" tiene ${total} cuenta(s) hija(s) activa(s). ` +
        'Desactiva primero las hijas.',
        409,
      );
    }
  }

  const sets = [
    input.codigo     !== undefined ? sql`codigo = ${input.codigo.trim()}` : null,
    input.nombre     !== undefined ? sql`nombre = ${input.nombre.trim()}` : null,
    input.tipo       !== undefined ? sql`tipo = ${input.tipo}` : null,
    input.naturaleza !== undefined ? sql`naturaleza = ${input.naturaleza}` : null,
    input.cuentaPadreId !== undefined ? sql`cuenta_padre_id = ${input.cuentaPadreId}` : null,
    input.imputable  !== undefined ? sql`imputable = ${input.imputable}` : null,
    input.activa     !== undefined ? sql`activa = ${input.activa}` : null,
  ].filter(Boolean) as ReturnType<typeof sql>[];

  if (sets.length === 0) return actual;

  sets.push(sql`updated_by = ${userId}`, sql`updated_at = now()`);

  const rows = await ex.execute(sql`
    UPDATE contabilidad_cuentas
    SET ${sql.join(sets, sql`, `)}
    WHERE team_id = ${teamId} AND id = ${id}
    RETURNING id, codigo, nombre, tipo, naturaleza,
              cuenta_padre_id AS "cuentaPadreId",
              imputable, activa, es_base AS "esBase"
  `).catch((e: unknown) => {
    // Choque contra el índice único (team_id, codigo).
    if (e instanceof Error && e.message.includes('contabilidad_cuentas_team_codigo_idx')) {
      throw new CuentaError(`Ya existe una cuenta con el código ${input.codigo?.trim()}.`, 409);
    }
    throw e;
  });

  return { ...(rows as unknown as Cuenta[])[0], movimientos: await contarMovimientos(teamId, id, ex) };
}

/**
 * Borra una cuenta de verdad. Solo se permite cuando no dejó rastro: sin hijas
 * y sin movimientos. Todo lo demás se desactiva con `editarCuenta({activa:false})`.
 */
export async function borrarCuenta(teamId: number, id: number): Promise<void> {
  const actual = await getCuenta(teamId, id);
  if (!actual) throw new CuentaError('La cuenta no existe.', 404);

  if (await tieneHijas(teamId, id)) {
    throw new CuentaError(
      `"${actual.codigo} ${actual.nombre}" tiene cuentas hijas. Bórralas primero, o desactívala.`,
      409,
    );
  }

  if (await tieneMovimientos(teamId, id)) {
    throw new CuentaError(
      `"${actual.codigo} ${actual.nombre}" tiene movimientos contables y no se puede eliminar: ` +
      'los reportes de periodos anteriores dejarían de cuadrar. Desactívala en su lugar.',
      409,
    );
  }

  await db.execute(sql`
    DELETE FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND id = ${id}
  `);
}
