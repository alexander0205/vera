/**
 * Vigila si un colegio se le salió del tramo que paga.
 *
 * Es la única dimensión del modelo que se cobra por TAMAÑO y no por consumo:
 * el tramo se elige por cuántos estudiantes tiene, y un colegio crece en
 * agosto. Sin esto, Andrés Bello pasa de 300 a 442 alumnos y sigue pagando el
 * tramo de 300 hasta que alguien lo note a mano — que es como se pierde
 * dinero calladamente.
 *
 * Avisa, NO bloquea (ver LIMITES.estudiantes). Cortar la matrícula 301 en
 * plena inscripción dejaría al colegio sin poder inscribir a un niño que ya
 * pagó, por una diferencia de precio que se resuelve con una llamada.
 */

import 'server-only';
import { cache } from 'react';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, teams } from '@/lib/db/schema';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { getPlan, tramoPorEstudiantes } from '@/lib/config/plans';
import { pasaDelMargenDelTramo } from '@/lib/config/suscripcion';

export interface EstadoTramo {
  estudiantes: number;
  /** Tope del tramo que paga hoy. */
  tope: number;
  /** ¿Se pasó del tope? */
  excedido: boolean;
  /** ¿Se pasó por más del margen (TRAMO_ESCOLAR.margenSinAviso)? */
  avisar: boolean;
  /** Nombre del tramo que le tocaría. null si se pasa del más alto. */
  tramoSugerido: string | null;
  mensaje: string | null;
}

/**
 * Cómo va este colegio contra su tramo. null cuando la pregunta no aplica:
 * billing apagado, o un plan de la línea e-CF que no cobra por estudiantes.
 *
 * Ese null es lo que evita que una ferretería pague un COUNT sobre una tabla
 * escolar vacía en cada carga de página.
 */
export const estadoDelTramo = cache(async (teamId: number): Promise<EstadoTramo | null> => {
  if (!BILLING_ENABLED) return null;

  const [fila] = await db
    .select({ planName: teams.planName })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const plan = getPlan(fila?.planName);
  if (plan.limits.estudiantes < 0) return null;

  const [c] = await db
    .select({ n: count() })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, teamId),
      eq(adminEscolarEstudiantes.estado, 'activo'),
    ));
  const estudiantes = c?.n ?? 0;
  const tope = plan.limits.estudiantes;

  const excedido = estudiantes > tope;
  const avisar = pasaDelMargenDelTramo(estudiantes, tope);

  // El tramo que de verdad le toca por tamaño. null = se pasó del más alto
  // (800) y ahí no hay plan de catálogo: toca cotizar a mano.
  const sugerido = excedido ? tramoPorEstudiantes(estudiantes) : null;

  return {
    estudiantes,
    tope,
    excedido,
    avisar,
    tramoSugerido: sugerido?.name ?? null,
    mensaje:
      !avisar
        ? null
      : sugerido
        ? `Tienes ${estudiantes} estudiantes y tu tramo ${plan.name} llega hasta ${tope}. Te corresponde el tramo ${sugerido.name}.`
        : `Tienes ${estudiantes} estudiantes, por encima de todos los tramos del catálogo. Escríbenos para ajustar tu plan.`,
  };
});
