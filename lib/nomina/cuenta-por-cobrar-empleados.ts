/**
 * La cuenta «1108 Cuentas por cobrar a empleados»: a donde van los préstamos y avances (su desembolso la carga y
 * las cuotas de nómina la abonan). Las empresas nuevas la traen en su catálogo; las que ya existían, no.
 *
 * Reglas:
 *   · Idempotente: se llama cada vez que hace falta y solo la primera crea algo.
 *   · NUNCA se adopta una cuenta ajena: se reconoce por su NOMBRE («por cobrar» + «empleado»), no por el código.
 *     Si el código 1108 ya lo usa otra cosa (catálogo propio), se crea con el primer código libre del mismo grupo
 *     y se avisa.
 *   · Una empresa sin catálogo (contabilidad sin estrenar) no recibe nada: no hay dónde asentar.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

type Ejecutor = Pick<typeof db, 'execute'>;

export interface CuentaMinima {
  id: number; codigo: string; nombre: string; tipo: string; activa: boolean; imputable: boolean;
}

export const CODIGO_CXC_EMPLEADOS = '1108';
export const NOMBRE_CXC_EMPLEADOS = 'Cuentas por cobrar a empleados';

/** ¿Por su nombre y naturaleza, es una cuenta por cobrar a empleados que se pueda usar? */
export const esCuentaDeEmpleados = (c: CuentaMinima) =>
  c.activa && c.imputable && c.tipo === 'activo' && /por\s+cobrar/i.test(c.nombre) && /empleado/i.test(c.nombre);

export type DecisionCuenta =
  | { accion: 'usar'; cuentaId: number; codigo: string }
  | { accion: 'crear'; codigo: string; aviso: string | null };

/** Qué hacer con las cuentas que tiene la empresa (puro, sin BD). */
export function decidirCuentaPorCobrarEmpleados(cuentas: readonly CuentaMinima[]): DecisionCuenta {
  const propias = cuentas.filter(esCuentaDeEmpleados);
  const elegida = propias.find((c) => c.codigo === CODIGO_CXC_EMPLEADOS) ?? [...propias].sort((a, b) => a.codigo.localeCompare(b.codigo))[0];
  if (elegida) return { accion: 'usar', cuentaId: elegida.id, codigo: elegida.codigo };

  const ocupada = cuentas.find((c) => c.codigo === CODIGO_CXC_EMPLEADOS);
  if (!ocupada) return { accion: 'crear', codigo: CODIGO_CXC_EMPLEADOS, aviso: null };

  const usados = new Set(cuentas.map((c) => c.codigo));
  for (let n = Number(CODIGO_CXC_EMPLEADOS) + 1; n <= 1199; n++) {
    if (!usados.has(String(n))) {
      return {
        accion: 'crear', codigo: String(n),
        aviso: `El código ${CODIGO_CXC_EMPLEADOS} ya lo usa «${ocupada.nombre}» en tu catálogo: los préstamos a empleados van a la cuenta nueva ${n} ${NOMBRE_CXC_EMPLEADOS}.`,
      };
    }
  }
  return { accion: 'crear', codigo: '1199', aviso: null };
}

async function cuentasDelGrupo(teamId: number, ex: Ejecutor): Promise<CuentaMinima[]> {
  const filas = await ex.execute(sql`
    SELECT id, codigo, nombre, tipo, activa, imputable
    FROM contabilidad_cuentas
    WHERE team_id = ${teamId} AND (codigo LIKE '11%' OR nombre ILIKE '%por cobrar%empleado%')
  `);
  return filas as unknown as CuentaMinima[];
}

/** Solo busca (no crea): para sembrar el catálogo de conceptos sin tocar el plan de cuentas. */
export async function buscarCuentaPorCobrarEmpleados(teamId: number, ex: Ejecutor = db): Promise<number | null> {
  const d = decidirCuentaPorCobrarEmpleados(await cuentasDelGrupo(teamId, ex));
  return d.accion === 'usar' ? d.cuentaId : null;
}

export interface CuentaAsegurada { cuentaId: number; codigo: string; creada: boolean; aviso: string | null }

/**
 * Deja la empresa con su cuenta por cobrar a empleados y la devuelve. Null si la empresa no tiene catálogo.
 * `userId` null = la creó el sistema al descontar una cuota.
 */
export async function asegurarCuentaPorCobrarEmpleados(teamId: number, userId: number | null, ex: Ejecutor = db): Promise<CuentaAsegurada | null> {
  const cuentas = await cuentasDelGrupo(teamId, ex);
  const [{ n }] = (await ex.execute(sql`SELECT count(*)::int AS n FROM contabilidad_cuentas WHERE team_id = ${teamId}`)) as unknown as { n: number }[];
  if (Number(n) === 0) return null;

  const d = decidirCuentaPorCobrarEmpleados(cuentas);
  if (d.accion === 'usar') return { cuentaId: d.cuentaId, codigo: d.codigo, creada: false, aviso: null };

  // Cuelga del mismo grupo que las demás cuentas por cobrar (el padre de 1107) o, si no, del grupo «11».
  const filas = await ex.execute(sql`
    INSERT INTO contabilidad_cuentas
      (team_id, codigo, nombre, tipo, naturaleza, cuenta_padre_id, imputable, activa, es_base, created_by, updated_by)
    VALUES (
      ${teamId}, ${d.codigo}, ${NOMBRE_CXC_EMPLEADOS}, 'activo', 'deudora',
      COALESCE(
        (SELECT cuenta_padre_id FROM contabilidad_cuentas WHERE team_id = ${teamId} AND codigo = '1107'),
        (SELECT id FROM contabilidad_cuentas WHERE team_id = ${teamId} AND codigo = '11')
      ),
      true, true, ${d.codigo === CODIGO_CXC_EMPLEADOS}, ${userId}, ${userId}
    )
    ON CONFLICT (team_id, codigo) DO NOTHING
    RETURNING id
  `);
  const id = (filas as unknown as { id: number }[])[0]?.id;
  if (id) return { cuentaId: id, codigo: d.codigo, creada: true, aviso: d.aviso };

  // Otra petición la creó justo antes: se vuelve a decidir y se usa la que quedó.
  const otra = decidirCuentaPorCobrarEmpleados(await cuentasDelGrupo(teamId, ex));
  return otra.accion === 'usar' ? { cuentaId: otra.cuentaId, codigo: otra.codigo, creada: false, aviso: d.aviso } : null;
}

/** Enlaza los conceptos «Avance» y «Préstamo» que no tengan cuenta a la cuenta por cobrar a empleados. */
export async function vincularConceptosDePrestamo(teamId: number, cuentaId: number, ex: Ejecutor = db): Promise<void> {
  try {
    await ex.execute(sql`
      UPDATE nomina_conceptos SET cuenta_id = ${cuentaId}
      WHERE team_id = ${teamId} AND codigo IN ('avance', 'prestamo') AND cuenta_id IS NULL
    `);
  } catch (err) {
    // Sin la migración 0230 no hay conceptos que vincular.
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code !== '42P01') throw err;
  }
}
