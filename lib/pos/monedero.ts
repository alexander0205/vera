/**
 * POS — Monedero escolar del estudiante (Fase 2).
 *
 * Saldo prepago por dependiente (estudiante). El acudiente recarga; el
 * estudiante consume en el POS. Límite diario opcional. Todo movimiento en
 * bitácora. Recarga/consumo son transaccionales con FOR UPDATE para evitar
 * carreras sobre el saldo.
 */

import { and, eq, sql, asc, desc, gte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  monederoEstudiante, monederoMovimientos, dependientes, teams,
  type MonederoEstudiante,
} from '@/lib/db/schema';

/** ¿El equipo tiene activada la capa escolar (monedero)? */
export async function escolarHabilitado(teamId: number): Promise<boolean> {
  const [t] = await db.select({ f: teams.posEscolarHabilitado }).from(teams).where(eq(teams.id, teamId)).limit(1);
  return !!t?.f;
}

export interface MonederoView {
  id:                   number;
  dependienteId:        number;
  nombre:               string;
  clientId:             number;
  saldoCentavos:        number;
  limiteDiarioCentavos: number | null;
  gastadoHoyCentavos:   number;
  disponibleHoyCentavos: number | null;  // null = sin límite
}

/** Inicio del día local (RD) como Date, para acotar el gasto de hoy. */
function inicioDeHoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function dependientePerteneceAlEquipo(teamId: number, dependienteId: number): Promise<{ id: number; nombre: string; apellido: string; clientId: number } | null> {
  const [d] = await db
    .select({ id: dependientes.id, nombre: dependientes.nombre, apellido: dependientes.apellido, clientId: dependientes.clientId })
    .from(dependientes)
    .where(and(eq(dependientes.id, dependienteId), eq(dependientes.teamId, teamId)))
    .limit(1);
  return d ?? null;
}

/** Obtiene el monedero del dependiente, creándolo si no existe. */
export async function getOrCreateMonedero(teamId: number, dependienteId: number): Promise<MonederoEstudiante> {
  const dep = await dependientePerteneceAlEquipo(teamId, dependienteId);
  if (!dep) throw new Error('Estudiante no encontrado');

  const [existente] = await db.select().from(monederoEstudiante)
    .where(and(eq(monederoEstudiante.teamId, teamId), eq(monederoEstudiante.dependienteId, dependienteId)))
    .limit(1);
  if (existente) return existente;

  const [creado] = await db.insert(monederoEstudiante)
    .values({ teamId, dependienteId })
    .onConflictDoNothing()
    .returning();
  if (creado) return creado;
  // Carrera: otro request lo creó entre el select y el insert.
  const [m] = await db.select().from(monederoEstudiante)
    .where(and(eq(monederoEstudiante.teamId, teamId), eq(monederoEstudiante.dependienteId, dependienteId)))
    .limit(1);
  return m;
}

/** Suma consumida hoy (CONSUMO − REVERSA) en centavos. */
export async function gastadoHoy(teamId: number, monederoId: number, executor: typeof db = db): Promise<number> {
  const [r] = await executor
    .select({
      total: sql<number>`coalesce(sum(CASE WHEN ${monederoMovimientos.tipo} = 'CONSUMO' THEN ${monederoMovimientos.montoCentavos}
                                           WHEN ${monederoMovimientos.tipo} = 'REVERSA' THEN -${monederoMovimientos.montoCentavos}
                                           ELSE 0 END), 0)`,
    })
    .from(monederoMovimientos)
    .where(and(
      eq(monederoMovimientos.teamId, teamId),
      eq(monederoMovimientos.monederoId, monederoId),
      gte(monederoMovimientos.createdAt, inicioDeHoy()),
    ));
  return Number(r?.total ?? 0);
}

/** Vista para UI: saldo, límite y gasto del día. Crea el monedero si no existe. */
export async function getMonederoView(teamId: number, dependienteId: number): Promise<MonederoView> {
  const dep = await dependientePerteneceAlEquipo(teamId, dependienteId);
  if (!dep) throw new Error('Estudiante no encontrado');
  const m = await getOrCreateMonedero(teamId, dependienteId);
  const gastado = await gastadoHoy(teamId, m.id);
  const disponibleHoy = m.limiteDiarioCentavos == null
    ? null
    : Math.max(0, m.limiteDiarioCentavos - gastado);
  return {
    id: m.id,
    dependienteId,
    nombre: `${dep.nombre} ${dep.apellido}`.trim(),
    clientId: dep.clientId,
    saldoCentavos: m.saldoCentavos,
    limiteDiarioCentavos: m.limiteDiarioCentavos,
    gastadoHoyCentavos: gastado,
    disponibleHoyCentavos: disponibleHoy,
  };
}

/** Recarga saldo (acudiente deposita). Devuelve el nuevo saldo. */
export async function recargar(input: {
  teamId: number; dependienteId: number; montoCentavos: number; createdBy: number; motivo?: string | null;
}): Promise<{ saldoCentavos: number }> {
  if (input.montoCentavos <= 0) throw new Error('El monto a recargar debe ser positivo');
  const m = await getOrCreateMonedero(input.teamId, input.dependienteId);

  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(monederoEstudiante)
      .where(eq(monederoEstudiante.id, m.id)).for('update').limit(1);
    const saldoAntes = locked.saldoCentavos;
    const saldoDespues = saldoAntes + input.montoCentavos;

    await tx.update(monederoEstudiante)
      .set({ saldoCentavos: saldoDespues, updatedAt: new Date() })
      .where(eq(monederoEstudiante.id, m.id));

    await tx.insert(monederoMovimientos).values({
      teamId: input.teamId, monederoId: m.id, tipo: 'RECARGA',
      montoCentavos: input.montoCentavos, esEntrada: true,
      saldoAntes, saldoDespues, motivo: input.motivo ?? null, createdBy: input.createdBy,
    });
    return { saldoCentavos: saldoDespues };
  });
}

/** Consume del saldo (cobro POS). Valida saldo y límite diario. */
export async function consumir(input: {
  teamId: number; monederoId: number; montoCentavos: number; ecfDocumentId?: number | null; createdBy: number;
}): Promise<{ saldoCentavos: number; movimientoId: number }> {
  if (input.montoCentavos <= 0) throw new Error('El monto a consumir debe ser positivo');

  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(monederoEstudiante)
      .where(and(eq(monederoEstudiante.id, input.monederoId), eq(monederoEstudiante.teamId, input.teamId)))
      .for('update').limit(1);
    if (!m) throw new Error('Monedero no encontrado');

    if (m.saldoCentavos < input.montoCentavos) {
      throw new Error('Saldo insuficiente en el monedero del estudiante');
    }
    if (m.limiteDiarioCentavos != null) {
      const gastado = await gastadoHoy(input.teamId, m.id, tx as unknown as typeof db);
      if (gastado + input.montoCentavos > m.limiteDiarioCentavos) {
        throw new Error('La venta excede el límite de gasto diario del estudiante');
      }
    }

    const saldoAntes = m.saldoCentavos;
    const saldoDespues = saldoAntes - input.montoCentavos;

    await tx.update(monederoEstudiante)
      .set({ saldoCentavos: saldoDespues, updatedAt: new Date() })
      .where(eq(monederoEstudiante.id, m.id));

    const [mov] = await tx.insert(monederoMovimientos).values({
      teamId: input.teamId, monederoId: m.id, tipo: 'CONSUMO',
      montoCentavos: input.montoCentavos, esEntrada: false,
      saldoAntes, saldoDespues, referenciaEcfId: input.ecfDocumentId ?? null, createdBy: input.createdBy,
    }).returning({ id: monederoMovimientos.id });
    return { saldoCentavos: saldoDespues, movimientoId: mov.id };
  });
}

/** Reversa un consumo (refund) — usado como compensación si la venta falla. */
export async function reversar(input: {
  teamId: number; monederoId: number; montoCentavos: number; createdBy: number; motivo?: string | null;
}): Promise<{ saldoCentavos: number }> {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(monederoEstudiante)
      .where(and(eq(monederoEstudiante.id, input.monederoId), eq(monederoEstudiante.teamId, input.teamId)))
      .for('update').limit(1);
    if (!m) throw new Error('Monedero no encontrado');

    const saldoAntes = m.saldoCentavos;
    const saldoDespues = saldoAntes + input.montoCentavos;

    await tx.update(monederoEstudiante)
      .set({ saldoCentavos: saldoDespues, updatedAt: new Date() })
      .where(eq(monederoEstudiante.id, m.id));

    await tx.insert(monederoMovimientos).values({
      teamId: input.teamId, monederoId: m.id, tipo: 'REVERSA',
      montoCentavos: input.montoCentavos, esEntrada: true,
      saldoAntes, saldoDespues, motivo: input.motivo ?? 'Reversa por venta fallida', createdBy: input.createdBy,
    });
    return { saldoCentavos: saldoDespues };
  });
}

/** Enlaza un movimiento de consumo con la venta una vez creada. */
export async function actualizarReferenciaConsumo(teamId: number, movimientoId: number, ecfDocumentId: number): Promise<void> {
  await db.update(monederoMovimientos)
    .set({ referenciaEcfId: ecfDocumentId })
    .where(and(eq(monederoMovimientos.id, movimientoId), eq(monederoMovimientos.teamId, teamId)));
}

/** Fija (o quita con null) el límite diario. */
export async function setLimiteDiario(teamId: number, dependienteId: number, limiteCentavos: number | null): Promise<void> {
  if (limiteCentavos != null && limiteCentavos < 0) throw new Error('El límite no puede ser negativo');
  const m = await getOrCreateMonedero(teamId, dependienteId);
  await db.update(monederoEstudiante)
    .set({ limiteDiarioCentavos: limiteCentavos, updatedAt: new Date() })
    .where(eq(monederoEstudiante.id, m.id));
}

export interface EstudianteBusqueda {
  dependienteId: number;
  nombre:        string;
  clientId:      number;
  saldoCentavos: number;
}

/** Busca estudiantes (dependientes) por nombre/apellido, con su saldo. */
export async function buscarEstudiantes(teamId: number, q: string, limit = 20): Promise<EstudianteBusqueda[]> {
  const term = `%${q.trim().toLowerCase()}%`;
  const rows = await db
    .select({
      dependienteId: dependientes.id,
      nombre: sql<string>`${dependientes.nombre} || ' ' || ${dependientes.apellido}`,
      clientId: dependientes.clientId,
      saldo: monederoEstudiante.saldoCentavos,
    })
    .from(dependientes)
    .leftJoin(monederoEstudiante, eq(monederoEstudiante.dependienteId, dependientes.id))
    .where(and(
      eq(dependientes.teamId, teamId),
      sql`lower(${dependientes.nombre} || ' ' || ${dependientes.apellido}) LIKE ${term}`,
    ))
    .orderBy(asc(dependientes.nombre))
    .limit(limit);
  return rows.map(r => ({
    dependienteId: r.dependienteId, nombre: r.nombre, clientId: r.clientId,
    saldoCentavos: Number(r.saldo ?? 0),
  }));
}

/** Movimientos recientes de un monedero (para historial). */
export function movimientosMonedero(teamId: number, monederoId: number, limit = 50) {
  return db.select().from(monederoMovimientos)
    .where(and(eq(monederoMovimientos.teamId, teamId), eq(monederoMovimientos.monederoId, monederoId)))
    .orderBy(desc(monederoMovimientos.createdAt))
    .limit(limit);
}
