/**
 * ¿Ya corrió la migración 0236 (espacios, estado y «solo control» en las fichas de
 * activo fijo)? Se pregunta a la base y solo se recuerda el «sí»: sin ella todo
 * sigue como antes. Va aparte de `depreciacion.ts` para que quien solo necesita
 * saber esto no arrastre el motor de depreciación.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

const vistas = { soloControl: false, inventario: false };

/** ¿Existe la columna `solo_control`? Es lo único que necesita la depreciación para saltarse esas fichas. */
export async function soloControlDisponible(): Promise<boolean> {
  if (vistas.soloControl) return true;
  const filas = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contabilidad_activos_fijos' AND column_name = 'solo_control'
    LIMIT 1`) as unknown as unknown[];
  if (filas.length > 0) vistas.soloControl = true;
  return filas.length > 0;
}

/**
 * ¿Están TODAS las piezas del inventario por aula? Las columnas nuevas de la ficha,
 * las tablas de espacios, secciones y traslados, y la 0225 (cantidad y bajas), de la
 * que depende el cálculo por unidades. Si falta algo, el inventario no se enseña.
 */
export async function inventarioAulaDisponible(): Promise<boolean> {
  if (vistas.inventario) return true;
  const cols = await db.execute(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contabilidad_activos_fijos'
      AND column_name IN ('cantidad', 'espacio_id', 'estado', 'solo_control')`) as unknown as { n: unknown }[];
  if (Number(cols[0]?.n ?? 0) < 4) return false;
  const t = await db.execute(sql`
    SELECT (to_regclass('public.escolar_espacios') IS NOT NULL
       AND to_regclass('public.escolar_espacio_secciones') IS NOT NULL
       AND to_regclass('public.escolar_activo_traslados') IS NOT NULL
       AND to_regclass('public.contabilidad_activos_bajas') IS NOT NULL) AS ok`) as unknown as { ok: boolean }[];
  const ok = t[0]?.ok === true;
  if (ok) vistas.inventario = true;
  return ok;
}
