import { desc, and, eq, isNull, count, gte, sql, lt } from 'drizzle-orm';
import { db } from './drizzle';
import {
  activityLogs,
  teamMembers,
  teams,
  users,
  clients,
  sequences,
  ecfDocuments,
} from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import { getPlanDocLimit } from '@/lib/config/plans';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export async function getTeamByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.stripeCustomerId, customerId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(teams)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(teams.id, teamId));
}

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: teamMembers.teamId
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  // Respetar el team activo de la sesión (igual que getTeamIdForUser)
  const teamId = await getTeamIdForUser();
  if (!teamId) return null;

  const result = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)),
    with: {
      team: {
        with: {
          teamMembers: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  return result?.team || null;
}

// ─── EmiteDO queries ──────────────────────────────────────────────────────────

/** Retorna el teamId activo desde la sesión, con fallback al primero del usuario */
export async function getTeamIdForUser(): Promise<number | null> {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie?.value) return null;
  const sessionData = await verifyToken(sessionCookie.value);
  if (!sessionData?.user?.id) return null;

  // Platform admin → puede activar cualquier team sin membership check
  const [u] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, sessionData.user.id))
    .limit(1);
  const isPlatformAdmin = u?.platformRole === 'admin';

  if (sessionData.activeTeamId) {
    if (isPlatformAdmin) {
      // Verificar que el team existe
      const [t] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.id, sessionData.activeTeamId))
        .limit(1);
      if (t) return t.id;
    } else {
      const belongs = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, sessionData.user.id),
            eq(teamMembers.teamId, sessionData.activeTeamId)
          )
        )
        .limit(1);
      if (belongs[0]) return belongs[0].teamId;
    }
  }

  // Fallback: para admin → primer team en DB; para member → primer team suyo
  if (isPlatformAdmin) {
    const result = await db
      .select({ id: teams.id })
      .from(teams)
      .orderBy(teams.createdAt)
      .limit(1);
    return result[0]?.id ?? null;
  }
  const result = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, sessionData.user.id))
    .limit(1);
  return result[0]?.teamId ?? null;
}

/** Retorna todos los teams del usuario (admin → todos los teams) */
export async function getUserTeams() {
  const user = await getUser();
  if (!user) return [];

  // Platform admin → ver todas las empresas
  if (user.platformRole === 'admin') {
    return db
      .select({
        id: teams.id,
        name: teams.name,
        rnc: teams.rnc,
        razonSocial: teams.razonSocial,
        nombreComercial: teams.nombreComercial,
        planName: teams.planName,
        subscriptionStatus: teams.subscriptionStatus,
        createdAt: teams.createdAt,
        role: sql<string>`'admin'`.as('role'),
        logo: teams.logo,
      })
      .from(teams)
      .orderBy(teams.createdAt);
  }

  return db
    .select({
      id: teams.id,
      name: teams.name,
      rnc: teams.rnc,
      razonSocial: teams.razonSocial,
      nombreComercial: teams.nombreComercial,
      planName: teams.planName,
      subscriptionStatus: teams.subscriptionStatus,
      createdAt: teams.createdAt,
      role: teamMembers.role,
      logo: teams.logo,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, user.id))
    .orderBy(teams.createdAt);
}

export async function getDashboardStats(teamId: number) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [facturasTotal, facturasMes, montoMesRows, secuenciasRows, teamRow] =
    await Promise.all([
      // Total de documentos
      db
        .select({ total: count() })
        .from(ecfDocuments)
        .where(eq(ecfDocuments.teamId, teamId)),
      // Documentos este mes
      db
        .select({ total: count() })
        .from(ecfDocuments)
        .where(
          and(
            eq(ecfDocuments.teamId, teamId),
            gte(ecfDocuments.createdAt, startOfMonth)
          )
        ),
      // Ingresos este mes (centavos)
      db
        .select({ total: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)` })
        .from(ecfDocuments)
        .where(
          and(
            eq(ecfDocuments.teamId, teamId),
            gte(ecfDocuments.createdAt, startOfMonth)
          )
        ),
      // Secuencias disponibles
      db
        .select()
        .from(sequences)
        .where(eq(sequences.teamId, teamId)),
      // Info del equipo (plan)
      db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1),
    ]);

  const secuenciasDisponibles = secuenciasRows.reduce((acc, s) => {
    const disponibles = Number(s.secuenciaHasta - s.secuenciaActual) + 1;
    return acc + Math.max(0, disponibles);
  }, 0);

  return {
    facturasTotal: facturasTotal[0]?.total ?? 0,
    facturasMes: facturasMes[0]?.total ?? 0,
    montoMesCentavos: Number(montoMesRows[0]?.total ?? 0),
    secuenciasDisponibles,
    plan: teamRow[0]?.planName ?? 'Gratis',
    rnc: teamRow[0]?.rnc ?? null,
    tieneCertificado: !!teamRow[0]?.certP12Ciphered,
  };
}

export async function getEcfDocuments(teamId: number, limit = 50) {
  return db
    .select()
    .from(ecfDocuments)
    .where(eq(ecfDocuments.teamId, teamId))
    .orderBy(desc(ecfDocuments.createdAt))
    .limit(limit);
}

/**
 * Reporte "Ventas generales" estilo Alegra.
 * Devuelve agregados + lista de documentos del rango.
 *
 * - Ventas brutas: SUM(montoTotal) de documentos venta (tipo 31/32) ACEPTADOS
 * - Notas crédito: SUM(montoTotal) de tipo 34 (resta)
 * - Total ITBIS:   SUM(totalItbis)
 * - Subtotal:      Ventas brutas - ITBIS
 * - Antes impuestos: Ventas brutas - Notas crédito
 * - Después impuestos: Antes impuestos + Impuestos
 *
 * Montos en CENTAVOS. La UI los divide por 100 para mostrar en DOP.
 */
export async function getVentasGenerales(
  teamId: number,
  desde: Date,
  hasta: Date,
) {
  const TIPOS_VENTA = ['31', '32', '33', '44', '45'] as const; // facturas/notas débito/regímenes esp/gubernamental
  const TIPO_NOTA_CREDITO = '34';

  const [ventaRows, notaRows, docs] = await Promise.all([
    // Agregados ventas (excluyendo notas crédito y borradores/rechazos)
    db
      .select({
        brutas: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
        itbis:  sql<number>`coalesce(sum(${ecfDocuments.totalItbis}), 0)`,
        count:  count(),
      })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.teamId, teamId),
        gte(ecfDocuments.fechaEmision, desde),
        sql`${ecfDocuments.fechaEmision} <= ${hasta}`,
        sql`${ecfDocuments.tipoEcf} IN (${sql.join(TIPOS_VENTA.map(t => sql`${t}`), sql`, `)})`,
        sql`${ecfDocuments.estado} IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO')`,
      )),

    // Notas crédito (resta)
    db
      .select({
        total: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
        count: count(),
      })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.teamId, teamId),
        gte(ecfDocuments.fechaEmision, desde),
        sql`${ecfDocuments.fechaEmision} <= ${hasta}`,
        eq(ecfDocuments.tipoEcf, TIPO_NOTA_CREDITO),
        sql`${ecfDocuments.estado} IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO')`,
      )),

    // Lista de documentos en el rango (limitada a 100 para la tabla)
    db
      .select({
        id:                  ecfDocuments.id,
        encf:                ecfDocuments.encf,
        tipoEcf:             ecfDocuments.tipoEcf,
        estado:              ecfDocuments.estado,
        fechaEmision:        ecfDocuments.fechaEmision,
        rncComprador:        ecfDocuments.rncComprador,
        razonSocialComprador: ecfDocuments.razonSocialComprador,
        montoTotal:          ecfDocuments.montoTotal,
        totalItbis:          ecfDocuments.totalItbis,
      })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.teamId, teamId),
        gte(ecfDocuments.fechaEmision, desde),
        sql`${ecfDocuments.fechaEmision} <= ${hasta}`,
        sql`${ecfDocuments.estado} != 'BORRADOR'`,
      ))
      .orderBy(desc(ecfDocuments.fechaEmision))
      .limit(100),
  ]);

  const brutas    = Number(ventaRows[0]?.brutas ?? 0);
  const itbis     = Number(ventaRows[0]?.itbis ?? 0);
  const notas     = Number(notaRows[0]?.total ?? 0);
  const antes     = brutas - notas;
  const despues   = antes; // Brutas ya incluyen ITBIS; "después de impuestos" = total final
  const subtotal  = brutas - itbis;

  return {
    desde:        desde.toISOString(),
    hasta:        hasta.toISOString(),
    montos: {
      ventasBrutas:     brutas,
      notasCredito:     notas,
      antesImpuestos:   antes,
      impuestos:        itbis,
      despuesImpuestos: despues,
      subtotal,
    },
    counts: {
      ventas:        Number(ventaRows[0]?.count ?? 0),
      notasCredito:  Number(notaRows[0]?.count ?? 0),
    },
    documentos: docs,
  };
}

export async function getClients(teamId: number) {
  return db
    .select()
    .from(clients)
    .where(eq(clients.teamId, teamId))
    .orderBy(clients.razonSocial);
}

export async function getSequences(teamId: number) {
  return db
    .select()
    .from(sequences)
    .where(eq(sequences.teamId, teamId))
    .orderBy(sequences.tipoEcf);
}

export async function getTeamProfile(teamId: number) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Returns how many e-CF documents this team has emitted in the current calendar month.
 * Only counts non-BORRADOR documents.
 */
export async function getMonthlyEcfCount(teamId: number): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await db
    .select({ total: count() })
    .from(ecfDocuments)
    .where(
      and(
        eq(ecfDocuments.teamId, teamId),
        gte(ecfDocuments.createdAt, startOfMonth),
        // Exclude drafts from the limit count
        sql`${ecfDocuments.estado} != 'BORRADOR'`
      )
    );

  return result[0]?.total ?? 0;
}

/**
 * Returns the monthly e-CF limit for a team based on its current plan.
 */
export function getPlanLimit(planName: string | null, status?: string | null): number {
  // 'admin' = acceso manual sin Stripe → sin límite
  if (status === 'admin') return -1;
  return getPlanDocLimit(planName, status === 'trialing');
}
