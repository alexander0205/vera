/**
 * generar-corrida.ts — crea una corrida de nómina en la base.
 *
 * Extraído del POST /api/nomina/corridas para que lo compartan la creación
 * manual (botón "Nueva corrida") y el cron de programación automática. Aquí sí
 * hay BD; la aritmética sigue en `construirCorrida` (pura). Siempre nace en
 * BORRADOR: no aprueba ni paga.
 *
 * Idempotente: el índice único (team, periodo, tipo) impide dos corridas
 * iguales; si choca, devuelve `motivo: 'ya-existe'` en vez de reventar.
 */
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaCorridas, nominaLineas } from '@/lib/db/schema';
import { tasasDelAnio } from '@/lib/config/nomina-tasas';
import { construirCorrida } from '@/lib/nomina/corrida';

export interface GenerarCorridaInput {
  teamId: number;
  /** 'YYYY-MM'. */
  periodo: string;
  /** 'mensual' | 'quincenal-1' | 'quincenal-2' | … */
  tipo: string;
  descripcion: string;
  fechaPago?: string | null;
  userId?: number | null;
  /**
   * Filtra los empleados por su `frecuencia_pago`. Omitido = todos los activos
   * (comportamiento del botón manual). El cron lo pasa para que la corrida
   * mensual solo incluya 'mensual' y la quincenal solo 'quincenal'.
   */
  frecuencias?: string[];
}

export type GenerarCorridaResultado =
  | { creada: true; corridaId: number; lineas: number; totalNetoCents: number }
  | { creada: false; motivo: 'sin-empleados' | 'ya-existe' };

export async function generarCorrida(input: GenerarCorridaInput): Promise<GenerarCorridaResultado> {
  const { teamId, periodo, tipo, descripcion, fechaPago = null, userId = null, frecuencias } = input;
  const anioTasas = Number(periodo.slice(0, 4));

  const where = frecuencias && frecuencias.length > 0
    ? and(eq(empleados.teamId, teamId), inArray(empleados.frecuenciaPago, frecuencias))
    : eq(empleados.teamId, teamId);

  const filas = await db.select().from(empleados).where(where);

  const { lineas, totales } = construirCorrida(
    filas.map((e) => ({
      id: e.id, nombres: e.nombres, apellidos: e.apellidos, cedula: e.cedula,
      cargo: e.cargo, salarioBaseCents: e.salarioBaseCents, estado: e.estado,
    })),
    tasasDelAnio(anioTasas),
  );

  if (lineas.length === 0) return { creada: false, motivo: 'sin-empleados' };

  try {
    const corrida = await db.transaction(async (tx) => {
      const [c] = await tx
        .insert(nominaCorridas)
        .values({
          teamId, periodo, descripcion, tipo,
          fechaPago, estado: 'borrador', anioTasas,
          totalBrutoCents: totales.totalBrutoCents,
          totalDeduccionesCents: totales.totalDeduccionesCents,
          totalNetoCents: totales.totalNetoCents,
          totalPatronalCents: totales.totalPatronalCents,
          createdBy: userId,
        })
        .returning();

      await tx.insert(nominaLineas).values(
        lineas.map((l) => ({ ...l, corridaId: c.id, teamId })),
      );
      return c;
    });

    return { creada: true, corridaId: corrida.id, lineas: lineas.length, totalNetoCents: totales.totalNetoCents };
  } catch (err) {
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
      return { creada: false, motivo: 'ya-existe' };
    }
    throw err;
  }
}
