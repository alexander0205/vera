/**
 * La descarga de SIGERD más reciente de un colegio.
 *
 * `sigerd_importaciones` guarda UNA fila por (colegio, año académico). Un
 * colegio que ya bajó dos años tiene dos filas, y las lecturas que hacían
 * `.limit(1)` sin ORDER BY se quedaban con la que la base devolviera primero:
 * el asistente enseñaba un año y el botón de cruzar leía el otro, sin que nada
 * lo delatara. Aquí está la regla en un solo sitio: la que se completó más
 * recientemente y, a igualdad, la de año más alto.
 *
 * Cuenta toda fila que tenga volcado, no solo las `completado`. «Volver a bajar»
 * pone la fila en `corriendo` y, si el portal está caído, en `error`; pero el
 * volcado se reemplaza entero y de golpe al terminar (`guardarMirror`), así que
 * mientras tanto la fila conserva el de la descarga anterior, que sigue siendo
 * válido. Exigir `completado` hacía que un intento fallido de actualizar
 * dejara al colegio sin su descarga buena hasta que SIGERD volviera.
 */
import 'server-only';
import { desc, isNotNull, eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sigerdImportaciones } from '@/lib/db/schema';

export interface UltimoDump {
  dump: Record<string, unknown>;
  /** Año académico de SIGERD (id del portal) de esta descarga. */
  anoAcademico: number;
  /**
   * Cuándo se completó la descarga que se está leyendo. Lo de SIGERD posterior
   * a esta fecha no está aquí. No cambia por un intento fallido de actualizar.
   */
  bajadoEn: Date | null;
}

export async function ultimoDumpSigerd(teamId: number): Promise<UltimoDump | null> {
  const [imp] = await db.select({
    dump: sigerdImportaciones.dump,
    anoAcademico: sigerdImportaciones.anoAcademico,
    completadoEn: sigerdImportaciones.completadoEn,
    updatedAt: sigerdImportaciones.updatedAt,
  })
    .from(sigerdImportaciones)
    .where(and(eq(sigerdImportaciones.teamId, teamId), isNotNull(sigerdImportaciones.dump)))
    .orderBy(
      sql`${sigerdImportaciones.completadoEn} DESC NULLS LAST`,
      desc(sigerdImportaciones.updatedAt),
      desc(sigerdImportaciones.anoAcademico),
    )
    .limit(1);
  if (!imp?.dump) return null;
  return {
    dump: imp.dump as Record<string, unknown>,
    anoAcademico: imp.anoAcademico,
    bajadoEn: imp.completadoEn ?? imp.updatedAt ?? null,
  };
}
