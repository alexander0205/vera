/**
 * ¿Este colegio está montado o está en blanco?
 *
 * El módulo escolar no sirve de nada hasta que existan tres cosas, y en este
 * orden porque cada una cuelga de la anterior:
 *
 *   1. un PERÍODO — el año escolar; de él cuelgan servicios, grados y cursos
 *   2. GRADOS     — dónde se matricula
 *   3. CONCEPTOS  — qué se cobra
 *
 * Sin lo primero no se puede crear lo segundo, así que se cuentan por
 * separado: la pantalla de bienvenida enseña por dónde va y qué falta, en vez
 * de un «no configurado» que no dice nada.
 */

import { eq, and, count } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarPeriodos, adminEscolarGrados,
  adminEscolarConceptosPago, adminEscolarEstudiantes,
} from '@/lib/db/schema';

export type EstadoColegio = {
  periodos: number;
  grados: number;
  conceptos: number;
  estudiantes: number;
  /** Nada de nada: es la primera vez que entran. */
  enBlanco: boolean;
  /** Falta algo para poder matricular. */
  listo: boolean;
};

export async function estadoConfiguracion(teamId: number): Promise<EstadoColegio> {
  // En paralelo: son cuatro conteos independientes y encadenarlos multiplica
  // por cuatro la espera de una pantalla que se abre en cada visita.
  const [periodos, grados, conceptos, estudiantes] = await Promise.all([
    db.select({ n: count() }).from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true))),
    db.select({ n: count() }).from(adminEscolarGrados)
      .where(and(eq(adminEscolarGrados.teamId, teamId), eq(adminEscolarGrados.activo, true))),
    db.select({ n: count() }).from(adminEscolarConceptosPago)
      .where(eq(adminEscolarConceptosPago.teamId, teamId)),
    db.select({ n: count() }).from(adminEscolarEstudiantes)
      .where(eq(adminEscolarEstudiantes.teamId, teamId)),
  ]);

  const p = periodos[0]?.n ?? 0;
  const g = grados[0]?.n ?? 0;
  const c = conceptos[0]?.n ?? 0;
  const e = estudiantes[0]?.n ?? 0;

  return {
    periodos: p, grados: g, conceptos: c, estudiantes: e,
    // Con estudiantes ya cargados NO se considera en blanco aunque falte algo:
    // un colegio a medio migrar necesita llegar a sus datos, no toparse con
    // una pantalla de bienvenida que le tape lo que ya tiene.
    enBlanco: p === 0 && g === 0 && c === 0 && e === 0,
    listo: p > 0 && g > 0 && c > 0,
  };
}
