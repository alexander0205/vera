/**
 * Lo que la nómina lee de la empresa y del registro de dependientes (capa con
 * BD; la aritmética vive en `./calculo` y `./dependientes`). Lo comparten la
 * corrida, la pantalla de configuración y el resumen de pago del empleado, para
 * que las tres usen exactamente los mismos números.
 */

import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleadoDependientes, teams } from '@/lib/db/schema';
import {
  capitaDependienteVigente,
  capitaTotalCents,
  esTamanoEmpresa,
  salarioMinimoSector,
  SRL_TASA_MIN,
  SRL_TASA_MAX,
  type TamanoEmpresa,
} from '@/lib/config/nomina-tasas';

export interface AjustesNomina {
  tamanoEmpresa: TamanoEmpresa | null;
  /** Tasa SRL guardada, o null si la empresa no la configuró (se usa la del año). */
  srlTasa: number | null;
  /** Salario mínimo del sector en la fecha: piso de la base cotizable. Null = sin piso. */
  pisoCotizableCents: number | null;
  /** Cápita total por dependiente adicional en la fecha (per cápita + FONAMAT). */
  capitaDependienteCents: number;
}

/** La tasa SRL guardada (NUMERIC llega como texto) si es válida; si no, null. */
export function srlDeTexto(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= SRL_TASA_MIN - 1e-9 && n <= SRL_TASA_MAX + 1e-9 ? n : null;
}

/** Ajustes de seguridad social de una empresa, vigentes en una fecha 'YYYY-MM-DD'. */
export async function ajustesNomina(teamId: number, fechaYMD: string): Promise<AjustesNomina> {
  const [fila] = await db
    .select({ tamano: teams.nominaTamanoEmpresa, srl: teams.nominaSrlTasa })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const tamanoEmpresa = esTamanoEmpresa(fila?.tamano) ? fila.tamano : null;
  return {
    tamanoEmpresa,
    srlTasa: srlDeTexto(fila?.srl),
    pisoCotizableCents: tamanoEmpresa ? salarioMinimoSector(tamanoEmpresa, fechaYMD) : null,
    capitaDependienteCents: capitaTotalCents(capitaDependienteVigente(fechaYMD)),
  };
}

/**
 * Cuántos dependientes ADICIONALES tiene registrados cada empleado en algún día
 * del rango. Solo aparecen los que tienen al menos uno.
 */
export async function adicionalesPorEmpleado(
  teamId: number,
  inicio: string,
  fin: string,
  empleadoId?: number,
): Promise<Map<number, number>> {
  const filas = await db
    .select({ empleadoId: empleadoDependientes.empleadoId })
    .from(empleadoDependientes)
    .where(and(
      eq(empleadoDependientes.teamId, teamId),
      eq(empleadoDependientes.tipo, 'adicional'),
      lte(empleadoDependientes.desde, fin),
      or(isNull(empleadoDependientes.hasta), gte(empleadoDependientes.hasta, inicio)),
      empleadoId !== undefined ? eq(empleadoDependientes.empleadoId, empleadoId) : undefined,
    ));

  const conteo = new Map<number, number>();
  for (const f of filas) conteo.set(f.empleadoId, (conteo.get(f.empleadoId) ?? 0) + 1);
  return conteo;
}
