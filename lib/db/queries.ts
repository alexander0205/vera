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
      // Ingresos este mes (centavos) — excluye ANULADO (no cuenta como ingreso)
      db
        .select({ total: sql<number>`coalesce(sum(${ecfDocuments.montoTotal}), 0)` })
        .from(ecfDocuments)
        .where(
          and(
            eq(ecfDocuments.teamId, teamId),
            gte(ecfDocuments.createdAt, startOfMonth),
            sql`${ecfDocuments.estado} <> 'ANULADO'`
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

/**
 * Lista cuentas por cobrar: facturas crédito con saldo pendiente > 0.
 *
 * Reglas:
 * - Solo tipo de pago = 2 (crédito) con estado emitido (no BORRADOR/RECHAZADO).
 * - saldo = montoTotal - SUM(pagosRecibidos.montoCentavos)
 * - Filtros opcionales: clientId, soloVencidas (fechaLimitePago < hoy y saldo > 0).
 */
export async function getCuentasPorCobrar(
  teamId: number,
  opts: {
    clientId?: number;
    soloVencidas?: boolean;
    limit?: number;
    offset?: number;
    /** Una sola factura (el módulo escolar la usa para resolver el saldo de un cargo). */
    docId?: number;
  } = {},
) {
  const hoy = new Date().toISOString().slice(0, 10);
  // Techo al dataset (antes cargaba toda la cartera abierta sin límite).
  const limit  = Math.min(opts.limit ?? 2000, 2000);
  const offset = Math.max(opts.offset ?? 0, 0);

  const rows = await db
    .select({
      id:                   ecfDocuments.id,
      encf:                 ecfDocuments.encf,
      codigo:               ecfDocuments.codigo,
      tipoEcf:              ecfDocuments.tipoEcf,
      fechaEmision:         ecfDocuments.fechaEmision,
      fechaLimitePago:      ecfDocuments.fechaLimitePago,
      rncComprador:         ecfDocuments.rncComprador,
      razonSocialComprador: ecfDocuments.razonSocialComprador,
      emailComprador:       ecfDocuments.emailComprador,
      clientId:             ecfDocuments.clientId,
      estado:               ecfDocuments.estado,
      montoTotal:           ecfDocuments.montoTotal,
      totalItbis:           ecfDocuments.totalItbis,
      // Subquery correlacionada: usar nombre literal de tabla en lugar de
      // ${ecfDocuments.id} para evitar que Drizzle lo trate como parámetro
      // (caso real: todos los rows devolvían el mismo SUM del primer id).
      pagado: sql<number>`coalesce((
        SELECT SUM(monto_centavos) FROM pagos_recibidos
        WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
      ), 0)`,
      // Saldo combinado de las ND de mora atadas a esta factura
      // (mora_origen_id = factura.id, no anuladas, saldo > 0). Subquery
      // correlacionada con nombres literales de tabla para evitar el bug de
      // parámetro de Drizzle (mismo patrón que `pagado` arriba).
      moraSaldo: sql<number>`coalesce((
        SELECT SUM(nd.monto_total - coalesce((
          SELECT SUM(monto_centavos) FROM pagos_recibidos
          WHERE pagos_recibidos.ecf_document_id = nd.id
        ), 0))
        FROM ecf_documents AS nd
        WHERE nd.mora_origen_id = ecf_documents.id
          AND nd.estado != 'ANULADO'
          AND (nd.monto_total - coalesce((
            SELECT SUM(monto_centavos) FROM pagos_recibidos
            WHERE pagos_recibidos.ecf_document_id = nd.id
          ), 0)) > 0
      ), 0)`,
      // Crédito aplicado por Notas de Crédito (tipo 34) vinculadas a esta
      // factura (por origen_documento_id o por ncf_modificado = encf real).
      // Reduce el saldo cobrable. Mismo patrón de subquery correlacionada.
      ncAplicado: sql<number>`coalesce((
        SELECT SUM(nc.monto_total) FROM ecf_documents nc
        WHERE nc.team_id = ecf_documents.team_id
          AND nc.tipo_ecf = '34'
          -- Solo NCs del modelo viejo reducen la factura; las nuevas generan
          -- saldo a favor del cliente (credito_generado_cents IS NOT NULL).
          AND nc.credito_generado_cents IS NULL
          AND nc.estado NOT IN ('ANULADO', 'RECHAZADO')
          -- Código 2 (Corrige texto) no afecta el saldo (sin efecto monetario).
          AND nc.codigo_modificacion IS DISTINCT FROM 2
          AND (
            nc.origen_documento_id = ecf_documents.id
            OR (ecf_documents.encf LIKE 'E%' AND nc.ncf_modificado = ecf_documents.encf)
          )
      ), 0)`,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      // AR = toda factura con saldo pendiente, sin importar el estado de emisión
      // (e-CF emitido, sin-ncf o borrador con cobro en curso). estado_pago captura
      // crédito sin pagar, contado sin cobrar y parciales. PAGADA/ANULADA/GRATUITA/
      // USO quedan fuera vía estado_pago. Solo se excluyen ANULADO/RECHAZADO (no
      // cobrables).
      sql`${ecfDocuments.estadoPago} IN ('PENDIENTE', 'PARCIAL')`,
      sql`${ecfDocuments.estado} NOT IN ('ANULADO', 'RECHAZADO')`,
      // Las ND de mora ya NO son cuentas propias: se agrupan dentro de su
      // factura padre. Solo listamos facturas raíz (mora_origen_id IS NULL).
      sql`${ecfDocuments.moraOrigenId} IS NULL`,
      // Las Notas de Crédito (tipo 34) no son cuentas por cobrar: acreditan
      // contra su factura padre (restadas vía ncAplicado).
      sql`${ecfDocuments.tipoEcf} != '34'`,
      opts.clientId ? eq(ecfDocuments.clientId, opts.clientId) : sql`true`,
      opts.docId ? eq(ecfDocuments.id, opts.docId) : sql`true`,
    ))
    .orderBy(desc(ecfDocuments.fechaEmision))
    .limit(limit)
    .offset(offset);

  // Lista de ND de mora (id, codigo, saldo>0) por factura padre, para distribuir
  // el pago en el frontend/desglose. Un solo query agrupado en memoria.
  const facturaIds = rows.map(r => r.id);
  const moraNotasPorFactura = new Map<number, { id: number; codigo: string | null; saldo: number }[]>();
  if (facturaIds.length > 0) {
    const moraRows = await db
      .select({
        id:           ecfDocuments.id,
        codigo:       ecfDocuments.codigo,
        moraOrigenId: ecfDocuments.moraOrigenId,
        montoTotal:   ecfDocuments.montoTotal,
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
      const saldoNd = m.montoTotal - Number(m.pagado);
      if (saldoNd <= 0 || m.moraOrigenId == null) continue;
      const arr = moraNotasPorFactura.get(m.moraOrigenId) ?? [];
      arr.push({ id: m.id, codigo: m.codigo, saldo: saldoNd });
      moraNotasPorFactura.set(m.moraOrigenId, arr);
    }
  }

  const enriquecidas = rows
    .map(r => {
      const pagado = Number(r.pagado);
      const ncAplicado = Number(r.ncAplicado);
      // saldoFactura = montoTotal − pagado − NC aplicadas (saldo SOLO de la
      // factura, nunca negativo: NC sobre factura ya pagada = crédito a favor
      // del cliente, no deuda negativa en AR).
      const saldoFactura = Math.max(0, r.montoTotal - pagado - ncAplicado);
      const moraSaldo = Number(r.moraSaldo);
      // saldo = saldoFactura + moraSaldo → TOTAL combinado que se cobra.
      const saldo = saldoFactura + moraSaldo;
      const vencida = !!r.fechaLimitePago && r.fechaLimitePago < hoy && saldoFactura > 0;
      const diasVencido = vencida && r.fechaLimitePago
        ? Math.floor((new Date(hoy).getTime() - new Date(r.fechaLimitePago).getTime()) / 86400000)
        : 0;
      const moraNotas = moraNotasPorFactura.get(r.id) ?? [];
      return {
        ...r,
        pagado,
        ncAplicado,
        saldoFactura,
        moraSaldo,
        saldo,
        moraNotas,
        vencida,
        diasVencido,
      };
    })
    // Mantener filas con saldo combinado > 0 (factura o mora pendiente).
    .filter(r => r.saldo > 0)
    .filter(r => !opts.soloVencidas || r.vencida);

  // Totales agregados sobre el saldo combinado (factura + mora).
  const totalPendiente = enriquecidas.reduce((s, r) => s + r.saldo, 0);
  const totalVencido   = enriquecidas.filter(r => r.vencida).reduce((s, r) => s + r.saldo, 0);

  return {
    cuentas: enriquecidas,
    totales: {
      pendiente: totalPendiente,
      vencido:   totalVencido,
      count:     enriquecidas.length,
      countVencidas: enriquecidas.filter(r => r.vencida).length,
    },
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

  if (inserts.length > 0) {
    await db.insert(pagosRecibidos).values(
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
    );
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
