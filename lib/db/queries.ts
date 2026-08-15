import { cache } from 'react';
import { desc, and, eq, isNull, count, gte, lte, sql, lt, inArray } from 'drizzle-orm';
import { db } from './drizzle';
import {
  activityLogs,
  teamMembers,
  teams,
  users,
  clients,
  sequences,
  ecfDocuments,
  pagosRecibidos,
} from './schema';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { verifyToken } from '@/lib/auth/session';
import { getPlanDocLimit } from '@/lib/config/plans';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago';
import { getNcAplicadoCts } from '@/lib/facturas/notas-credito';
import { pRango, pVentaValida, pNotaCredito, pVentaEstados } from '@/lib/reportes/shared';

// React.cache: memoiza por-request. Evita re-ejecutar la resolución de sesión
// (verifyToken + query users) cuando layout, /api/user y demás la piden varias veces.
export const getUser = cache(async () => {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  // Cookie inválida/expirada/firmada con otro secreto → tratar como no-sesión.
  // verifyToken lanza (JWSSignatureVerificationFailed); sin este catch, cualquier
  // ruta que use getUser respondía 500 sin body y el cliente veía
  // "Unexpected end of JSON input" en vez de un 401 limpio → redirigir a login.
  let sessionData: Awaited<ReturnType<typeof verifyToken>> | null = null;
  try {
    sessionData = await verifyToken(sessionCookie.value);
  } catch {
    return null;
  }
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
});

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

// React.cache: getTeamForUser se llama en el SWR fallback del root layout Y en
// varias páginas por request. Sin cache era 1 query pesada (carga todos los
// miembros del team) por cada llamada. Ahora se resuelve una sola vez por request.
export const getTeamForUser = cache(async () => {
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
});

/**
 * Rol del usuario en el team activo (clave de team_members.role).
 * React.cache: api-guard, page-guard, /api/user y los helpers de módulos
 * consultaban esto por separado en cada request — ahora es 1 sola query.
 * Devuelve null si no hay sesión/team o el usuario no es miembro.
 */
export const getTeamRoleForUser = cache(async (): Promise<string | null> => {
  const user = await getUser();
  if (!user) return null;
  const teamId = await getTeamIdForUser();
  if (!teamId) return null;
  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);
  return m?.role ?? null;
});

// ─── EmiteDO queries ──────────────────────────────────────────────────────────

/** Retorna el teamId activo desde la sesión, con fallback al primero del usuario */
export const getTeamIdForUser = cache(async (): Promise<number | null> => {
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
});

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
        cajaHabilitada: teams.cajaHabilitada,
        posHabilitado: teams.posHabilitado,
        habilitacionCompletadoAt: teams.habilitacionCompletadoAt,
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
      cajaHabilitada: teams.cajaHabilitada,
      posHabilitado: teams.posHabilitado,
      habilitacionCompletadoAt: teams.habilitacionCompletadoAt,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, user.id))
    .orderBy(teams.createdAt);
}

export async function getDashboardStats(teamId: number) {
  // Cache corta por team (30s): el dashboard se visita/refresca seguido y estos
  // agregados sobre ecf_documents son de los más caros. TTL bajo para que datos
  // volátiles (secuencias, certificado) no se vean viejos por mucho tiempo.
  return unstable_cache(
    () => computeDashboardStats(teamId),
    ['dashboard-stats', String(teamId)],
    { revalidate: 30 },
  )();
}

async function computeDashboardStats(teamId: number) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const seisMesesAtras = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const noAnulado = sql`${ecfDocuments.estado} <> 'ANULADO'`;

  const [
    facturasTotal, facturasMes, montoMesRows, montoMesAnteriorRows,
    secuenciasRows, teamRow, serieMesesRows, porTipoRows, topClientesRows,
  ] =
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
      // Ingresos este mes (centavos) — excluye ANULADO (no cuenta como ingreso)
      db
        .select({ total: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)` })
        .from(ecfDocuments)
        .where(and(eq(ecfDocuments.teamId, teamId), gte(ecfDocuments.createdAt, startOfMonth), noAnulado)),
      // Ingresos del mes anterior — referencia para el % de variación.
      db
        .select({ total: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)` })
        .from(ecfDocuments)
        .where(and(
          eq(ecfDocuments.teamId, teamId),
          gte(ecfDocuments.createdAt, startOfPrevMonth),
          lt(ecfDocuments.createdAt, startOfMonth),
          noAnulado,
        )),
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
      // Serie de ingresos de los últimos 6 meses (incluye el actual) — alimenta
      // el mini-gráfico de tendencia del panel.
      db
        .select({
          mes:   sql<string>`to_char(date_trunc('month', ${ecfDocuments.createdAt}), 'YYYY-MM')`,
          monto: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
        })
        .from(ecfDocuments)
        .where(and(eq(ecfDocuments.teamId, teamId), gte(ecfDocuments.createdAt, seisMesesAtras), noAnulado))
        .groupBy(sql`date_trunc('month', ${ecfDocuments.createdAt})`)
        .orderBy(sql`date_trunc('month', ${ecfDocuments.createdAt})`),
      // Desglose por tipo de comprobante, este mes.
      db
        .select({
          tipo:  ecfDocuments.tipoEcf,
          count: count(),
          monto: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
        })
        .from(ecfDocuments)
        .where(and(eq(ecfDocuments.teamId, teamId), gte(ecfDocuments.createdAt, startOfMonth), noAnulado))
        .groupBy(ecfDocuments.tipoEcf)
        .orderBy(desc(sql`coalesce(sum(${ecfDocuments.montoTotal}), 0)`)),
      // Top 5 clientes del mes por monto facturado.
      db
        .select({
          cliente: ecfDocuments.razonSocialComprador,
          rnc:     ecfDocuments.rncComprador,
          monto:   sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
          count:   count(),
        })
        .from(ecfDocuments)
        .where(and(
          eq(ecfDocuments.teamId, teamId),
          gte(ecfDocuments.createdAt, startOfMonth),
          noAnulado,
          sql`${ecfDocuments.razonSocialComprador} is not null and ${ecfDocuments.razonSocialComprador} <> ''`,
        ))
        .groupBy(ecfDocuments.razonSocialComprador, ecfDocuments.rncComprador)
        .orderBy(desc(sql`coalesce(sum(${ecfDocuments.montoTotal}), 0)`))
        .limit(5),
    ]);

  const secuenciasDisponibles = secuenciasRows.reduce((acc, s) => {
    const disponibles = Number(s.secuenciaHasta - s.secuenciaActual) + 1;
    return acc + Math.max(0, disponibles);
  }, 0);

  const montoMesCentavos = Number(montoMesRows[0]?.total ?? 0);
  const montoMesAnteriorCentavos = Number(montoMesAnteriorRows[0]?.total ?? 0);
  const variacionMes = montoMesAnteriorCentavos > 0
    ? ((montoMesCentavos - montoMesAnteriorCentavos) / montoMesAnteriorCentavos) * 100
    : null; // sin base del mes anterior no hay % que mostrar, no es 0% de verdad

  return {
    facturasTotal: facturasTotal[0]?.total ?? 0,
    facturasMes: facturasMes[0]?.total ?? 0,
    montoMesCentavos,
    montoMesAnteriorCentavos,
    variacionMes,
    secuenciasDisponibles,
    plan: teamRow[0]?.planName ?? 'Gratis',
    rnc: teamRow[0]?.rnc ?? null,
    tieneCertificado: !!teamRow[0]?.certP12Ciphered,
    serieMeses: serieMesesRows.map(r => ({ mes: r.mes, montoCentavos: Number(r.monto) })),
    porTipo: porTipoRows.map(r => ({ tipo: r.tipo, count: r.count, montoCentavos: Number(r.monto) })),
    topClientes: topClientesRows.map(r => ({
      cliente: r.cliente ?? 'Sin nombre', rnc: r.rnc, montoCentavos: Number(r.monto), count: r.count,
    })),
  };
}

export async function getEcfDocuments(teamId: number, limit = 50, tipos?: string[]) {
  // tipos: filtra por tipoEcf en SQL (ej. ['34'] para notas de crédito) en vez
  // de traer todo y filtrar en JS — así el límite no descarta notas por estar
  // más allá de la fila N mezcladas con facturas.
  const where = tipos && tipos.length > 0
    ? and(eq(ecfDocuments.teamId, teamId), inArray(ecfDocuments.tipoEcf, tipos))
    : eq(ecfDocuments.teamId, teamId);
  return db
    .select()
    .from(ecfDocuments)
    .where(where)
    .orderBy(desc(ecfDocuments.createdAt))
    .limit(limit);
}

/**
 * Reporte "Ventas generales".
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
  const [ventaRows, notaRows, docs] = await Promise.all([
    // Agregados ventas: e-CF emitido a DGII + tickets sin-ncf (venta real sin
    // comprobante). Excluye NC, borradores de e-CF y anulados/rechazados.
    db
      .select({
        brutas: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
        itbis:  sql<number>`coalesce(sum(${ecfDocuments.totalItbis}), 0)`,
        count:  count(),
      })
      .from(ecfDocuments)
      .where(and(pRango(teamId, desde, hasta), pVentaValida)),

    // Notas crédito (resta) — solo las emitidas a DGII.
    db
      .select({
        total: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)`,
        count: count(),
      })
      .from(ecfDocuments)
      .where(and(pRango(teamId, desde, hasta), pNotaCredito, pVentaEstados)),

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
        pRango(teamId, desde, hasta),
        // Muestra ventas reales (e-CF emitido + tickets sin-ncf) y notas; oculta
        // solo los borradores de e-CF sin emitir (BOR-…).
        sql`NOT (${ecfDocuments.estado} = 'BORRADOR' AND ${ecfDocuments.tipoEcf} <> 'sin-ncf')`,
      ))
      .orderBy(desc(ecfDocuments.fechaEmision))
      .limit(100),
  ]);

  const brutas    = Number(ventaRows[0]?.brutas ?? 0);
  const itbis     = Number(ventaRows[0]?.itbis ?? 0);
  const notas     = Number(notaRows[0]?.total ?? 0);
  // brutas = SUM(monto_total) que YA incluye ITBIS. Re-derivar para que el
  // display siga la cadena lineal: brutas − NC − itbis = antes_imp; antes_imp + itbis = despues_imp.
  const netoConItbis = brutas - notas;        // ventas netas (con ITBIS)
  const antes        = netoConItbis - itbis;  // base imponible (sin ITBIS)
  const despues      = netoConItbis;          // total final = antes + ITBIS
  const subtotal     = brutas - itbis;

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


// ─── EmiteDO — Cuentas por cobrar (AR) ────────────────────────────────────────

/** Orden de la cartera. Whitelist — nunca interpolar entrada del usuario. */
export type OrdenCartera = 'reciente' | 'antiguo' | 'monto' | 'vencimiento';

const ORDEN_CARTERA_SQL: Record<OrdenCartera, string> = {
  reciente:    'fecha_emision_ts DESC',
  antiguo:     'fecha_emision_ts ASC',
  monto:       'saldo DESC',
  // Vencidas primero y las más atrasadas arriba; las que no vencen, al final.
  vencimiento: 'vencida DESC, fecha_limite_date ASC NULLS LAST',
};

/**
 * Cubetas de antigüedad de la cartera.
 *
 * `porVencer` = todavía no vence (incluye las que no tienen fecha límite).
 * El resto son días de atraso cumplidos. Los cortes son los del plan:
 * 1-30, 31-60, 61-90 y más de 90.
 */
export type CubetaAntiguedad = 'porVencer' | 'd1a30' | 'd31a60' | 'd61a90' | 'd90mas';

export const CUBETAS_ANTIGUEDAD: CubetaAntiguedad[] =
  ['porVencer', 'd1a30', 'd31a60', 'd61a90', 'd90mas'];

/** Predicado SQL de cada cubeta, sobre las columnas del CTE `cartera`. */
const CUBETA_SQL: Record<CubetaAntiguedad, string> = {
  porVencer: 'NOT vencida',
  d1a30:     'vencida AND dias_vencido BETWEEN 1 AND 30',
  d31a60:    'vencida AND dias_vencido BETWEEN 31 AND 60',
  d61a90:    'vencida AND dias_vencido BETWEEN 61 AND 90',
  d90mas:    'vencida AND dias_vencido > 90',
};

export interface CuentasPorCobrarOpts {
  clientId?:     number;
  soloVencidas?: boolean;
  docId?:        number;
  limit?:        number;
  offset?:       number;
  /** Texto libre sobre razón social o RNC del comprador. */
  search?:       string;
  /** 'factura' → con saldo de factura; 'nota-debito' → con mora pendiente. */
  tipoDoc?:      'factura' | 'nota-debito';
  /** 'vencidas' | 'al-dia' — filtra por estado de vencimiento. */
  estado?:       'vencidas' | 'al-dia';
  /** Restringe a una cubeta de antigüedad. */
  cubeta?:       CubetaAntiguedad;
  orden?:        OrdenCartera;
}

/**
 * Lista cuentas por cobrar: facturas con saldo pendiente > 0.
 *
 * El saldo se calcula EN SQL (antes se calculaba en JS después del fetch, así
 * que el LIMIT recortaba antes de descartar las filas con saldo 0 y la cartera
 * se truncaba en silencio). Eso permite filtrar, ordenar y paginar en servidor,
 * y que los totales cubran TODA la cartera filtrada, no solo la página.
 *
 * Fórmula (ver docs/contabilidad-paso1-logica-saldo.md):
 *   saldoFactura = max(0, montoTotal − pagado − ncAplicado)
 *   saldo        = saldoFactura + moraSaldo
 *
 * `hoy` sale de Postgres en zona RD (`now() AT TIME ZONE 'America/Santo_Domingo'`):
 * el corte del día es medianoche en RD y no en UTC.
 */
export async function getCuentasPorCobrar(
  teamId: number,
  opts: CuentasPorCobrarOpts = {},
) {
  const limit  = Math.min(Math.max(opts.limit ?? 2000, 1), 2000);
  const offset = Math.max(opts.offset ?? 0, 0);
  const ordenSql = ORDEN_CARTERA_SQL[opts.orden ?? 'reciente'] ?? ORDEN_CARTERA_SQL.reciente;

  // Fecha calendario de HOY en RD, resuelta por Postgres.
  const hoyRdSql = sql`(now() AT TIME ZONE 'America/Santo_Domingo')::date`;

  // ── CTE compartido entre la página de resultados y los totales ──────────────
  // Se arma una sola vez y se reusa en las dos consultas para que no puedan
  // divergir (que los totales midan algo distinto de lo que lista la tabla).
  const cte = sql`
    WITH base AS (
      SELECT
        d.id, d.encf, d.codigo, d.tipo_ecf, d.fecha_limite_pago,
        -- db.execute crudo NO parsea timestamp a Date: devuelve el string de pg
        -- ('2026-06-28 00:00:00'), y fmtFechaCorta parte por 'T' → salía
        -- "28 00:00:00/06/2026". Se entrega ya como YYYY-MM-DD.
        -- fecha_emision es timestamp SIN zona que guarda la hora-pared RD, así
        -- que NO lleva AT TIME ZONE: convertirla correría el día.
        to_char(d.fecha_emision, 'YYYY-MM-DD') AS fecha_emision,
        -- El timestamp crudo se conserva solo para ordenar: sobre el texto
        -- YYYY-MM-DD el orden sería cronológico igual, pero empataría todas las
        -- facturas del mismo día al perder la hora.
        d.fecha_emision AS fecha_emision_ts,
        d.rnc_comprador, d.razon_social_comprador, d.email_comprador,
        d.client_id, d.estado, d.monto_total, d.total_itbis,
        -- fecha_limite_pago es varchar(10); ''::date lanza en Postgres, así que
        -- se normaliza a NULL una sola vez y el resto compara contra esto.
        NULLIF(d.fecha_limite_pago, '')::date AS fecha_limite_date,
        coalesce((
          SELECT SUM(p.monto_centavos) FROM pagos_recibidos p
          WHERE p.ecf_document_id = d.id
        ), 0) AS pagado,
        -- Saldo combinado de las ND de mora atadas a esta factura.
        coalesce((
          SELECT SUM(nd.monto_total - coalesce((
            SELECT SUM(p2.monto_centavos) FROM pagos_recibidos p2
            WHERE p2.ecf_document_id = nd.id
          ), 0))
          FROM ecf_documents AS nd
          WHERE nd.mora_origen_id = d.id
            AND nd.estado != 'ANULADO'
            AND (nd.monto_total - coalesce((
              SELECT SUM(p3.monto_centavos) FROM pagos_recibidos p3
              WHERE p3.ecf_document_id = nd.id
            ), 0)) > 0
        ), 0) AS mora_saldo,
        -- Crédito aplicado por NC (tipo 34) del modelo viejo. Las NC nuevas
        -- generan saldo a favor del cliente y no reducen la factura.
        coalesce((
          SELECT SUM(nc.monto_total) FROM ecf_documents nc
          WHERE nc.team_id = d.team_id
            AND nc.tipo_ecf = '34'
            AND nc.credito_generado_cents IS NULL
            AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
            -- Código 2 (corrige texto) no tiene efecto monetario.
            AND nc.codigo_modificacion IS DISTINCT FROM 2
            AND (
              nc.origen_documento_id = d.id
              OR (d.encf LIKE 'E%' AND nc.ncf_modificado = d.encf)
            )
        ), 0) AS nc_aplicado
      FROM ecf_documents d
      WHERE d.team_id = ${teamId}
        -- AR = toda factura con saldo pendiente, sin importar el estado de
        -- emisión (e-CF emitido, sin-ncf o borrador con cobro en curso).
        -- PAGADA/ANULADA/GRATUITA/USO quedan fuera vía estado_pago.
        -- Entra si su CAPITAL sigue pendiente/parcial, O si el capital ya está
        -- pagado pero le queda una ND de mora sin saldar. Sin este OR, una
        -- factura pagada con mora pendiente desaparecía de la cartera, y su ND
        -- de mora también (por mora_origen_id IS NULL): la mora se volvía
        -- invisible.
        AND (
          d.estado_pago IN ('PENDIENTE', 'PARCIAL')
          OR EXISTS (
            SELECT 1 FROM ecf_documents nd
            WHERE nd.mora_origen_id = d.id
              AND nd.estado != 'ANULADO'
              AND (nd.monto_total - coalesce((
                SELECT SUM(monto_centavos) FROM pagos_recibidos
                WHERE pagos_recibidos.ecf_document_id = nd.id
              ), 0)) > 0
          )
        )
        AND d.estado NOT IN ('ANULADO', 'RECHAZADO')
        -- NOTA: aquí vivía un filtro que excluía los BORRADOR con e-NCF real
        -- (NOT estado='BORRADOR' AND encf con formato e-NCF), asumiendo que
        -- solo podían ser la reserva de un intento de emisión fallido ya
        -- re-facturado con otro número. La premisa no se sostiene: escondía
        -- facturas reales sin reemplazo —algunas con cobros parciales ya
        -- registrados, que un fantasma nunca tendría—. El caso que lo motivó
        -- lo cubre la condición de arriba: el intento fallido queda ANULADO.
        -- Las ND de mora no son cuentas propias: se agrupan en su factura padre.
        AND d.mora_origen_id IS NULL
        -- Las NC no son cuentas por cobrar: acreditan contra su factura padre.
        AND d.tipo_ecf != '34'
        ${opts.clientId ? sql`AND d.client_id = ${opts.clientId}` : sql``}
        ${opts.docId ? sql`AND d.id = ${opts.docId}` : sql``}
        ${opts.search?.trim()
          ? sql`AND (
              coalesce(d.razon_social_comprador, '') ILIKE ${'%' + opts.search.trim() + '%'}
              OR coalesce(d.rnc_comprador, '') ILIKE ${'%' + opts.search.trim() + '%'}
            )`
          : sql``}
    ),
    calc AS (
      SELECT b.*,
        GREATEST(0, b.monto_total - b.pagado - b.nc_aplicado) AS saldo_factura,
        GREATEST(0, b.monto_total - b.pagado - b.nc_aplicado) + b.mora_saldo AS saldo,
        (
          b.fecha_limite_date IS NOT NULL
          AND b.fecha_limite_date < ${hoyRdSql}
          AND GREATEST(0, b.monto_total - b.pagado - b.nc_aplicado) > 0
        ) AS vencida
      FROM base b
    ),
    cartera AS (
      SELECT c.*,
        CASE WHEN c.vencida
          THEN (${hoyRdSql} - c.fecha_limite_date)
          ELSE 0
        END AS dias_vencido
      FROM calc c
      -- Filas con saldo combinado > 0 (factura o mora pendiente). Esto ANTES
      -- del LIMIT es lo que arregla el truncado silencioso.
      WHERE c.saldo > 0
        ${opts.soloVencidas || opts.estado === 'vencidas' ? sql`AND c.vencida` : sql``}
        ${opts.estado === 'al-dia' ? sql`AND NOT c.vencida` : sql``}
        ${opts.tipoDoc === 'factura' ? sql`AND c.saldo_factura > 0` : sql``}
        ${opts.tipoDoc === 'nota-debito' ? sql`AND c.mora_saldo > 0` : sql``}
    ),
    -- La cubeta se aplica APARTE de \`cartera\`: el desglose de antigüedad se
    -- calcula sobre \`cartera\` (sin cubeta) para que al elegir una las demás
    -- sigan mostrando su monto y se pueda volver. La lista y los totales de
    -- arriba sí usan \`filtrada\`.
    filtrada AS (
      SELECT * FROM cartera
      ${opts.cubeta ? sql`WHERE ${sql.raw(CUBETA_SQL[opts.cubeta])}` : sql``}
    )`;

  interface CarteraRow {
    id: number; encf: string; codigo: string | null; tipo_ecf: string;
    fecha_emision: string; fecha_limite_pago: string | null;
    rnc_comprador: string | null; razon_social_comprador: string | null;
    email_comprador: string | null; client_id: number | null;
    estado: string; monto_total: number; total_itbis: number;
    pagado: string; mora_saldo: string; nc_aplicado: string;
    saldo_factura: string; saldo: string; vencida: boolean; dias_vencido: number;
  }

  const [rowsRaw, totalesRaw] = await Promise.all([
    db.execute(sql`
      ${cte}
      SELECT * FROM filtrada
      ORDER BY ${sql.raw(ordenSql)}
      LIMIT ${limit} OFFSET ${offset}
    `),
    // Totales sobre TODA la cartera filtrada, no solo la página visible. El
    // desglose por antigüedad va sobre `cartera` (sin la cubeta activa).
    db.execute(sql`
      ${cte}
      SELECT
        (SELECT coalesce(SUM(saldo), 0)                    FROM filtrada) AS pendiente,
        (SELECT coalesce(SUM(saldo) FILTER (WHERE vencida), 0) FROM filtrada) AS vencido,
        (SELECT COUNT(*)                                   FROM filtrada) AS count,
        (SELECT COUNT(*) FILTER (WHERE vencida)            FROM filtrada) AS count_vencidas,
        (SELECT coalesce(SUM(saldo) FILTER (WHERE ${sql.raw(CUBETA_SQL.porVencer)}), 0) FROM cartera) AS ant_por_vencer,
        (SELECT coalesce(SUM(saldo) FILTER (WHERE ${sql.raw(CUBETA_SQL.d1a30)}),     0) FROM cartera) AS ant_d1a30,
        (SELECT coalesce(SUM(saldo) FILTER (WHERE ${sql.raw(CUBETA_SQL.d31a60)}),    0) FROM cartera) AS ant_d31a60,
        (SELECT coalesce(SUM(saldo) FILTER (WHERE ${sql.raw(CUBETA_SQL.d61a90)}),    0) FROM cartera) AS ant_d61a90,
        (SELECT coalesce(SUM(saldo) FILTER (WHERE ${sql.raw(CUBETA_SQL.d90mas)}),    0) FROM cartera) AS ant_d90mas,
        (SELECT COUNT(*) FILTER (WHERE ${sql.raw(CUBETA_SQL.porVencer)}) FROM cartera) AS cnt_por_vencer,
        (SELECT COUNT(*) FILTER (WHERE ${sql.raw(CUBETA_SQL.d1a30)})     FROM cartera) AS cnt_d1a30,
        (SELECT COUNT(*) FILTER (WHERE ${sql.raw(CUBETA_SQL.d31a60)})    FROM cartera) AS cnt_d31a60,
        (SELECT COUNT(*) FILTER (WHERE ${sql.raw(CUBETA_SQL.d61a90)})    FROM cartera) AS cnt_d61a90,
        (SELECT COUNT(*) FILTER (WHERE ${sql.raw(CUBETA_SQL.d90mas)})    FROM cartera) AS cnt_d90mas
    `),
  ]);

  const rows = rowsRaw as unknown as CarteraRow[];

  // Lista de ND de mora (id, código, saldo>0) por factura padre, para desglosar
  // el cobro en el frontend. Solo para las filas de esta página.
  const facturaIds = rows.map(r => r.id);
  const moraNotasPorFactura = new Map<number, {
    id: number; codigo: string | null; montoTotal: number; saldo: number;
    estado: 'PENDIENTE' | 'PARCIAL';
    fechaEmision: string | Date | null; periodo: string | Date | null;
  }[]>();
  if (facturaIds.length > 0) {
    const moraRows = await db
      .select({
        id:           ecfDocuments.id,
        codigo:       ecfDocuments.codigo,
        moraOrigenId: ecfDocuments.moraOrigenId,
        montoTotal:   ecfDocuments.montoTotal,
        fechaEmision: ecfDocuments.fechaEmision,
        periodo:      ecfDocuments.moraPeriodo,
        pagado: sql<number>`coalesce((
          SELECT SUM(monto_centavos) FROM pagos_recibidos
          WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
        ), 0)`,
      })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.teamId, teamId),
        inArray(ecfDocuments.moraOrigenId, facturaIds),
        sql`${ecfDocuments.estado} != 'ANULADO'`,
      ))
      .orderBy(ecfDocuments.id);

    for (const m of moraRows) {
      const pagadoNd = Number(m.pagado);
      const saldoNd = m.montoTotal - pagadoNd;
      if (saldoNd <= 0 || m.moraOrigenId == null) continue;
      const arr = moraNotasPorFactura.get(m.moraOrigenId) ?? [];
      arr.push({
        id: m.id, codigo: m.codigo, montoTotal: m.montoTotal, saldo: saldoNd,
        estado: pagadoNd > 0 ? 'PARCIAL' : 'PENDIENTE',
        fechaEmision: m.fechaEmision, periodo: m.periodo,
      });
      moraNotasPorFactura.set(m.moraOrigenId, arr);
    }
  }

  // pg devuelve numeric/bigint como string — normalizar a number en el borde.
  const cuentas = rows.map(r => ({
    id:                   r.id,
    encf:                 r.encf,
    codigo:               r.codigo,
    tipoEcf:              r.tipo_ecf,
    fechaEmision:         r.fecha_emision,
    fechaLimitePago:      r.fecha_limite_pago,
    rncComprador:         r.rnc_comprador,
    razonSocialComprador: r.razon_social_comprador,
    emailComprador:       r.email_comprador,
    clientId:             r.client_id,
    estado:               r.estado,
    montoTotal:           Number(r.monto_total),
    totalItbis:           Number(r.total_itbis),
    pagado:               Number(r.pagado),
    ncAplicado:           Number(r.nc_aplicado),
    saldoFactura:         Number(r.saldo_factura),
    moraSaldo:            Number(r.mora_saldo),
    saldo:                Number(r.saldo),
    vencida:              r.vencida,
    diasVencido:          Number(r.dias_vencido),
    moraNotas:            moraNotasPorFactura.get(r.id) ?? [],
  }));

  const t = (totalesRaw as unknown as Array<Record<string, string>>)[0];
  const n = (k: string) => Number(t?.[k] ?? 0);

  return {
    cuentas,
    totales: {
      pendiente:     n('pendiente'),
      vencido:       n('vencido'),
      count:         n('count'),
      countVencidas: n('count_vencidas'),
    },
    /** Distribución por antigüedad de TODA la cartera filtrada, ignorando la
     *  cubeta activa: así las tarjetas siguen mostrando su monto al elegir una. */
    antiguedad: {
      porVencer: { saldo: n('ant_por_vencer'), count: n('cnt_por_vencer') },
      d1a30:     { saldo: n('ant_d1a30'),      count: n('cnt_d1a30')      },
      d31a60:    { saldo: n('ant_d31a60'),     count: n('cnt_d31a60')     },
      d61a90:    { saldo: n('ant_d61a90'),     count: n('cnt_d61a90')     },
      d90mas:    { saldo: n('ant_d90mas'),     count: n('cnt_d90mas')     },
    } satisfies Record<CubetaAntiguedad, { saldo: number; count: number }>,
  };
}

/**
 * Listado AVANZADO de todos los pagos recibidos del team (módulo de Pagos).
 *
 * Aplana el ledger `pagos_recibidos` con datos del documento (código, NCF,
 * cliente) y del usuario que lo registró. Soporta filtros server-side por
 * rango de fecha y método; el resto del filtrado (búsqueda libre) se hace
 * client-side sobre el dataset cargado.
 *
 * Retorna: filas + totales (monto total, conteo) + desglose por método.
 */
export async function getPagosListado(
  teamId: number,
  opts: { desde?: string; hasta?: string; metodo?: string; limit?: number; offset?: number } = {},
) {
  const filtros = [eq(pagosRecibidos.teamId, teamId)];
  if (opts.desde)  filtros.push(gte(pagosRecibidos.fechaPago, opts.desde));
  if (opts.hasta)  filtros.push(lte(pagosRecibidos.fechaPago, opts.hasta));
  if (opts.metodo) filtros.push(eq(pagosRecibidos.metodo, opts.metodo));
  // Excluir cobros de comprobantes ANULADOS: la fila de pago sobrevive a la
  // anulación (traza + arqueo de caja), pero no debe listarse ni sumarse aquí.
  filtros.push(sql`(${ecfDocuments.estado} IS NULL OR ${ecfDocuments.estado} <> 'ANULADO')`);

  // Techo al dataset (antes cargaba el ledger completo del team sin límite).
  const limit  = Math.min(opts.limit ?? 2000, 2000);
  const offset = Math.max(opts.offset ?? 0, 0);

  const rows = await db
    .select({
      id:           pagosRecibidos.id,
      montoCentavos: pagosRecibidos.montoCentavos,
      metodo:       pagosRecibidos.metodo,
      referencia:   pagosRecibidos.referencia,
      cuenta:       pagosRecibidos.cuenta,
      fechaPago:    pagosRecibidos.fechaPago,
      notas:        pagosRecibidos.notas,
      createdAt:    pagosRecibidos.createdAt,
      turnoCajaId:  pagosRecibidos.turnoCajaId,
      notaCreditoId: pagosRecibidos.notaCreditoId,
      // Documento al que se aplicó el pago.
      docId:        ecfDocuments.id,
      docCodigo:    ecfDocuments.codigo,
      docEncf:      ecfDocuments.encf,
      docTipoEcf:   ecfDocuments.tipoEcf,
      docEstado:    ecfDocuments.estado,
      docTrackId:   ecfDocuments.trackId,
      docMontoTotal: ecfDocuments.montoTotal,
      clientId:     ecfDocuments.clientId,
      cliente:      ecfDocuments.razonSocialComprador,
      rncComprador: ecfDocuments.rncComprador,
      // Usuario que registró el pago.
      registradoPor: users.name,
      registradoPorEmail: users.email,
      // Comprobantes de la factura. Solo el conteo — el binario jamás sale en
      // un listado (el de una sola factura ya pesaría más que toda la página).
      comprobantes: sql<number>`(
        SELECT count(*)::int FROM pago_adjuntos
        WHERE pago_adjuntos.ecf_document_id = ecf_documents.id
      )`,
    })
    .from(pagosRecibidos)
    .leftJoin(ecfDocuments, eq(pagosRecibidos.ecfDocumentId, ecfDocuments.id))
    .leftJoin(users, eq(pagosRecibidos.createdBy, users.id))
    .where(and(...filtros))
    .orderBy(desc(pagosRecibidos.fechaPago), desc(pagosRecibidos.id))
    .limit(limit)
    .offset(offset);

  // Trazabilidad: cuántos pagos tiene cada factura (para "Pago 2 de 3").
  const pagosPorDoc = new Map<number, number>();
  for (const r of rows) {
    if (r.docId != null) pagosPorDoc.set(r.docId, (pagosPorDoc.get(r.docId) ?? 0) + 1);
  }

  const pagos = rows.map(r => {
    // Enviado a DGII: la DGII devuelve trackId al recibir el e-CF, o el doc
    // quedó en un estado de envío. Excluye sin-ncf/históricas/borradores.
    const enviadoDgii =
      r.docTrackId != null ||
      ['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO'].includes(r.docEstado ?? '');
    return {
      ...r,
      monto: Number(r.montoCentavos),
      enviadoDgii,
      pagosDelDoc: r.docId != null ? (pagosPorDoc.get(r.docId) ?? 1) : 1,
    };
  });

  // Totales + desglose por método (sobre el dataset filtrado server-side).
  const total = pagos.reduce((s, p) => s + p.monto, 0);
  const porMetodo: Record<string, { monto: number; count: number }> = {};
  for (const p of pagos) {
    const k = (p.metodo ?? 'otro').toLowerCase();
    porMetodo[k] = porMetodo[k] ?? { monto: 0, count: 0 };
    porMetodo[k].monto += p.monto;
    porMetodo[k].count += 1;
  }

  return {
    pagos,
    totales: {
      monto: total,
      count: pagos.length,
      porMetodo,
    },
  };
}

/** Lista pagos de un documento específico. */
export async function getPagosDocumento(teamId: number, ecfDocumentId: number) {
  return db
    .select()
    .from(pagosRecibidos)
    .where(and(
      eq(pagosRecibidos.teamId, teamId),
      eq(pagosRecibidos.ecfDocumentId, ecfDocumentId),
    ))
    .orderBy(desc(pagosRecibidos.fechaPago));
}

/**
 * Registra un pago contra una factura. Valida que:
 * - El doc pertenece al team
 * - El monto no supera el saldo pendiente
 * Retorna el pago insertado + nuevo saldo.
 */
/**
 * Sincroniza el espejo inline `ecfDocuments.pago*` desde el ledger
 * `pagos_recibidos` (source of truth). El inline queda denormalizado para
 * reportes DGII (606/607/609) y ticket PDF, que aún leen esos campos.
 * Debe llamarse tras cualquier insert/delete en pagos_recibidos de un doc.
 */
export async function syncPagoMirror(teamId: number, ecfDocumentId: number) {
  const [agg] = await db
    .select({ sum: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.teamId, teamId), eq(pagosRecibidos.ecfDocumentId, ecfDocumentId)));
  const sum = Number(agg?.sum ?? 0);

  const [latest] = await db
    .select({ metodo: pagosRecibidos.metodo, cuenta: pagosRecibidos.cuenta, fecha: pagosRecibidos.fechaPago })
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.teamId, teamId), eq(pagosRecibidos.ecfDocumentId, ecfDocumentId)))
    .orderBy(sql`${pagosRecibidos.fechaPago} DESC, ${pagosRecibidos.id} DESC`)
    .limit(1);

  // Cargar campos necesarios para recalcular estado_pago en el mismo update
  const [doc] = await db
    .select({
      estado:     ecfDocuments.estado,
      tipoPago:   ecfDocuments.tipoPago,
      montoTotal: ecfDocuments.montoTotal,
      encf:       ecfDocuments.encf,
      tipoEcf:    ecfDocuments.tipoEcf,
    })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, ecfDocumentId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  // NC vinculadas acreditan contra el total (no aplica a las propias NC)
  const ncAplicado = doc && doc.tipoEcf !== '34'
    ? await getNcAplicadoCts(teamId, ecfDocumentId, doc.encf)
    : 0;

  const estadoPago = doc
    ? calcularEstadoPago({
        estado: doc.estado, tipoPago: doc.tipoPago, montoTotal: doc.montoTotal,
        totalPagado: sum, totalNotasCredito: ncAplicado,
      })
    : 'PENDIENTE';

  await db.update(ecfDocuments).set({
    pagoRecibido: sum > 0 ? 'true' : 'false',
    pagoValorCts: sum,
    pagoMetodo:   latest?.metodo ?? null,
    pagoCuenta:   latest?.cuenta ?? null,
    pagoFecha:    latest?.fecha ?? null,
    estadoPago,
    updatedAt:    new Date(),
  }).where(and(eq(ecfDocuments.id, ecfDocumentId), eq(ecfDocuments.teamId, teamId)));

  return sum;
}

export async function registrarPago(input: {
  teamId:        number;
  ecfDocumentId: number;
  montoCentavos: number;
  metodo:        string;
  referencia?:   string | null;
  cuenta?:       string | null;
  fechaPago:     string; // YYYY-MM-DD
  notas?:        string | null;
  turnoCajaId?:  number | null;
  createdBy?:    number;
}) {
  // Delega en la versión batch con un solo elemento. Mantiene la firma pública
  // (otros callers la usan) y retorna `pago` singular además del array.
  const result = await registrarPagosSplit({
    teamId:        input.teamId,
    ecfDocumentId: input.ecfDocumentId,
    fechaPago:     input.fechaPago,
    createdBy:     input.createdBy,
    turnoCajaId:   input.turnoCajaId,
    pagos: [{
      montoCentavos: input.montoCentavos,
      metodo:        input.metodo,
      referencia:    input.referencia ?? null,
      cuenta:        input.cuenta ?? null,
      notas:         input.notas ?? null,
    }],
  });

  return {
    pago:          result.pagos[0],
    saldoAnterior: result.saldoAnterior,
    saldoNuevo:    result.saldoNuevo,
    montoTotal:    result.montoTotal,
  };
}

/**
 * Registra VARIOS pagos (split / pago dividido) contra una factura en una sola
 * operación. Cada método es una fila en `pagos_recibidos`. Valida que:
 * - El doc pertenece al team
 * - Hay al menos un pago y cada monto es positivo
 * - La SUMA de los montos no supera el saldo pendiente
 * Inserta todas las filas y sincroniza el espejo inline UNA sola vez.
 */
export async function registrarPagosSplit(input: {
  teamId:        number;
  ecfDocumentId: number;
  fechaPago:     string; // YYYY-MM-DD
  createdBy?:    number;
  /** Cuadre de caja: turno al que se atribuye el cobro (null si no aplica). */
  turnoCajaId?:  number | null;
  pagos: Array<{
    montoCentavos: number;
    metodo:        string;
    referencia?:   string | null;
    cuenta?:       string | null;
    notas?:        string | null;
  }>;
}) {
  if (input.pagos.length < 1) throw new Error('Debe incluir al menos un método de pago');

  // Validar doc pertenece al team
  const [doc] = await db
    .select({
      id:         ecfDocuments.id,
      montoTotal: ecfDocuments.montoTotal,
      encf:       ecfDocuments.encf,
      tipoEcf:    ecfDocuments.tipoEcf,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.id, input.ecfDocumentId),
      eq(ecfDocuments.teamId, input.teamId),
    ))
    .limit(1);

  if (!doc) throw new Error('Documento no encontrado');

  // Calcular saldo actual (pagos + NC aplicadas)
  const [agg] = await db
    .select({
      pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    })
    .from(pagosRecibidos)
    .where(eq(pagosRecibidos.ecfDocumentId, input.ecfDocumentId));

  const yaPagado   = Number(agg?.pagado ?? 0);
  const ncAplicado = doc.tipoEcf !== '34'
    ? await getNcAplicadoCts(input.teamId, input.ecfDocumentId, doc.encf)
    : 0;
  const saldo      = Math.max(0, doc.montoTotal - yaPagado - ncAplicado);

  let total = 0;
  for (const p of input.pagos) {
    if (p.montoCentavos <= 0) throw new Error('Cada monto debe ser positivo');
    if (!p.metodo) throw new Error('Cada pago requiere un método');
    total += p.montoCentavos;
  }

  if (total <= 0) throw new Error('Monto debe ser positivo');
  if (total > saldo) {
    throw new Error(`Monto excede saldo pendiente (RD$${(saldo / 100).toFixed(2)})`);
  }

  const pagos = await db.insert(pagosRecibidos).values(
    input.pagos.map(p => ({
      teamId:        input.teamId,
      ecfDocumentId: input.ecfDocumentId,
      montoCentavos: p.montoCentavos,
      metodo:        p.metodo,
      referencia:    p.referencia ?? null,
      cuenta:        p.cuenta ?? null,
      fechaPago:     input.fechaPago,
      notas:         p.notas ?? null,
      turnoCajaId:   input.turnoCajaId ?? null,
      createdBy:     input.createdBy ?? null,
    })),
  ).returning();

  await syncPagoMirror(input.teamId, input.ecfDocumentId);

  return {
    pagos,
    saldoAnterior: saldo,
    saldoNuevo:    saldo - total,
    montoTotal:    doc.montoTotal,
  };
}

/**
 * Registra un pago contra una factura DISTRIBUYÉNDOLO entre la factura y sus
 * Notas de Débito de mora atadas (mora_origen_id = factura.id). Soporta pago
 * dividido (varias líneas/métodos). Regla: se cubre PRIMERO el saldo de la
 * factura y el sobrante se aplica a las ND de mora en orden de id.
 *
 * Cada porción se inserta como su propia fila en `pagos_recibidos`, conservando
 * el método/referencia/cuenta/fecha de la línea origen. Tras insertar, se
 * sincroniza el espejo inline (estado_pago) de la factura y de cada ND tocada.
 *
 * Si la factura no tiene ND de mora con saldo, todo va a la factura (= flujo
 * normal).
 */
export async function registrarPagoFacturaConMora(input: {
  teamId:        number;
  ecfDocumentId: number;
  fechaPago:     string; // YYYY-MM-DD
  createdBy?:    number;
  /** Cuadre de caja: turno al que se atribuye el cobro (null si no aplica). */
  turnoCajaId?:  number | null;
  lineas: Array<{
    montoCentavos: number;
    metodo:        string;
    referencia?:   string | null;
    cuenta?:       string | null;
    notas?:        string | null;
    /** NC consumida (metodo='nota_credito'). Voucher de uso único. */
    notaCreditoId?: number | null;
  }>;
}) {
  if (input.lineas.length < 1) throw new Error('Debe incluir al menos un método de pago');

  for (const l of input.lineas) {
    if (l.montoCentavos <= 0) throw new Error('Cada monto debe ser positivo');
    if (!l.metodo) throw new Error('Cada pago requiere un método');
  }

  // Factura padre + su saldo
  const [doc] = await db
    .select({
      id:         ecfDocuments.id,
      montoTotal: ecfDocuments.montoTotal,
      encf:       ecfDocuments.encf,
      tipoEcf:    ecfDocuments.tipoEcf,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.id, input.ecfDocumentId),
      eq(ecfDocuments.teamId, input.teamId),
    ))
    .limit(1);
  if (!doc) throw new Error('Documento no encontrado');

  const [aggFactura] = await db
    .select({ pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
    .from(pagosRecibidos)
    .where(eq(pagosRecibidos.ecfDocumentId, input.ecfDocumentId));
  const ncAplicadoFactura = doc.tipoEcf !== '34'
    ? await getNcAplicadoCts(input.teamId, input.ecfDocumentId, doc.encf)
    : 0;
  const saldoFactura = Math.max(
    0,
    doc.montoTotal - Number(aggFactura?.pagado ?? 0) - ncAplicadoFactura,
  );

  // ND de mora atadas con saldo > 0, ordenadas por id
  const moraDocs = await db
    .select({
      id:         ecfDocuments.id,
      montoTotal: ecfDocuments.montoTotal,
      pagado: sql<number>`coalesce((
        SELECT SUM(monto_centavos) FROM pagos_recibidos
        WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
      ), 0)`,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, input.teamId),
      eq(ecfDocuments.moraOrigenId, input.ecfDocumentId),
      sql`${ecfDocuments.estado} != 'ANULADO'`,
    ))
    .orderBy(ecfDocuments.id);

  const colaMora = moraDocs
    .map(m => ({ id: m.id, rem: m.montoTotal - Number(m.pagado) }))
    .filter(m => m.rem > 0);

  const moraSaldoTotal = colaMora.reduce((s, m) => s + m.rem, 0);
  const totalLineas    = input.lineas.reduce((s, l) => s + l.montoCentavos, 0);
  const capacidad      = saldoFactura + moraSaldoTotal;

  if (totalLineas > capacidad) {
    throw new Error(`Monto excede el saldo (factura + mora) (RD$${(capacidad / 100).toFixed(2)})`);
  }

  // Distribución: factura primero, luego mora en orden. Cada porción mantiene
  // el método/referencia/cuenta de su línea origen.
  type Insert = {
    ecfDocumentId: number;
    montoCentavos: number;
    metodo:        string;
    referencia:    string | null;
    cuenta:        string | null;
    notas:         string | null;
    notaCreditoId: number | null;
  };
  const inserts: Insert[] = [];
  let remFactura = saldoFactura;
  let facturaCents = 0;
  let moraCents = 0;

  for (const linea of input.lineas) {
    let monto = linea.montoCentavos;
    // NC de uso parcial: todas las porciones de una línea 'nota_credito' llevan el
    // mismo nota_credito_id → el "usado" de la NC = suma de sus pagos.
    const ncId: number | null = linea.notaCreditoId ?? null;

    // 1) Llenar la factura primero
    const x = Math.min(monto, remFactura);
    if (x > 0) {
      inserts.push({
        ecfDocumentId: input.ecfDocumentId,
        montoCentavos: x,
        metodo:        linea.metodo,
        referencia:    linea.referencia ?? null,
        cuenta:        linea.cuenta ?? null,
        notas:         linea.notas ?? null,
        notaCreditoId: ncId,
      });
      remFactura  -= x;
      monto       -= x;
      facturaCents += x;
    }

    // 2) Sobrante → ND de mora en orden
    for (const nd of colaMora) {
      if (monto <= 0) break;
      if (nd.rem <= 0) continue;
      const y = Math.min(monto, nd.rem);
      inserts.push({
        ecfDocumentId: nd.id,
        montoCentavos: y,
        metodo:        linea.metodo,
        referencia:    linea.referencia ?? null,
        cuenta:        linea.cuenta ?? null,
        notas:         linea.notas ?? null,
        notaCreditoId: ncId,
      });
      nd.rem    -= y;
      monto     -= y;
      moraCents += y;
    }
  }

  let filasInsertadas: { id: number }[] = [];
  if (inserts.length > 0) {
    filasInsertadas = await db.insert(pagosRecibidos).values(
      inserts.map(i => ({
        teamId:        input.teamId,
        ecfDocumentId: i.ecfDocumentId,
        montoCentavos: i.montoCentavos,
        metodo:        i.metodo,
        notaCreditoId: i.notaCreditoId,
        referencia:    i.referencia,
        cuenta:        i.cuenta,
        fechaPago:     input.fechaPago,
        notas:         i.notas,
        turnoCajaId:   input.turnoCajaId ?? null,
        createdBy:     input.createdBy ?? null,
      })),
    ).returning({ id: pagosRecibidos.id });
  }

  // Sincronizar espejo/estado_pago de la factura y de cada ND tocada
  const docsTocados = new Set<number>(inserts.map(i => i.ecfDocumentId));
  for (const id of docsTocados) {
    await syncPagoMirror(input.teamId, id);
  }

  return {
    saldoNuevo: capacidad - totalLineas,
    saldado:    capacidad - totalLineas === 0,
    repartido:  { facturaCents, moraCents },
    /** Filas creadas, en el orden en que se insertaron (factura primero). */
    pagos:      filasInsertadas,
  };
}

/** Elimina un pago (rollback). Solo permitido al team owner. */
export async function eliminarPago(teamId: number, pagoId: number) {
  const [pago] = await db
    .select()
    .from(pagosRecibidos)
    .where(and(eq(pagosRecibidos.id, pagoId), eq(pagosRecibidos.teamId, teamId)))
    .limit(1);
  if (!pago) throw new Error('Pago no encontrado');
  await db.delete(pagosRecibidos).where(eq(pagosRecibidos.id, pagoId));
  await syncPagoMirror(teamId, pago.ecfDocumentId);
  return pago;
}
