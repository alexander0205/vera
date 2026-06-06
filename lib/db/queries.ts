import { desc, and, eq, isNull, count, gte, lte, sql, lt } from 'drizzle-orm';
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
  recargosMora,
} from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';
import { getPlanDocLimit } from '@/lib/config/plans';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago';

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
        lte(ecfDocuments.fechaEmision, hasta),
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
        lte(ecfDocuments.fechaEmision, hasta),
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
        lte(ecfDocuments.fechaEmision, hasta),
        sql`${ecfDocuments.estado} != 'BORRADOR'`,
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
  opts: { clientId?: number; soloVencidas?: boolean } = {},
) {
  const hoy = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id:                   ecfDocuments.id,
      encf:                 ecfDocuments.encf,
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
      // Recargo por mora (ARQUITECTURA OPCIÓN A): se suma al saldo visible en
      // cobranza pero NO modifica el e-CF original (XML fiscal inmutable).
      recargoMora: sql<number>`coalesce((
        SELECT monto_centavos FROM recargos_mora
        WHERE recargos_mora.ecf_document_id = ecf_documents.id
        LIMIT 1
      ), 0)`,
      recargoMoraPct: sql<number>`coalesce((
        SELECT porcentaje_aplicado FROM recargos_mora
        WHERE recargos_mora.ecf_document_id = ecf_documents.id
        LIMIT 1
      ), 0)`,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      eq(ecfDocuments.tipoPago, 2),
      sql`(${ecfDocuments.estado} IN ('ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO', 'HISTORICA') OR (${ecfDocuments.estado} = 'BORRADOR' AND ${ecfDocuments.origenRecurrenteId} IS NOT NULL))`,
      opts.clientId ? eq(ecfDocuments.clientId, opts.clientId) : sql`true`,
    ))
    .orderBy(desc(ecfDocuments.fechaEmision));

  const enriquecidas = rows
    .map(r => {
      const pagado      = Number(r.pagado);
      const recargoMora = Number(r.recargoMora);
      // saldo incluye recargo por mora (dato de cobranza, no modifica XML fiscal)
      const saldo = r.montoTotal + recargoMora - pagado;
      const vencida = !!r.fechaLimitePago && r.fechaLimitePago < hoy && saldo > 0;
      const diasVencido = vencida && r.fechaLimitePago
        ? Math.floor((new Date(hoy).getTime() - new Date(r.fechaLimitePago).getTime()) / 86400000)
        : 0;
      return {
        ...r,
        pagado,
        recargoMora,
        recargoMoraPct: Number(r.recargoMoraPct),
        saldo,
        vencida,
        diasVencido,
      };
    })
    .filter(r => r.saldo > 0)
    .filter(r => !opts.soloVencidas || r.vencida);

  // Totales agregados
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
    })
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, ecfDocumentId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  const estadoPago = doc
    ? calcularEstadoPago({ estado: doc.estado, tipoPago: doc.tipoPago, montoTotal: doc.montoTotal, totalPagado: sum })
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
  createdBy?:    number;
}) {
  // Validar doc pertenece al team
  const [doc] = await db
    .select({ id: ecfDocuments.id, montoTotal: ecfDocuments.montoTotal })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.id, input.ecfDocumentId),
      eq(ecfDocuments.teamId, input.teamId),
    ))
    .limit(1);

  if (!doc) throw new Error('Documento no encontrado');

  // Calcular saldo actual
  const [agg] = await db
    .select({
      pagado: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)`,
    })
    .from(pagosRecibidos)
    .where(eq(pagosRecibidos.ecfDocumentId, input.ecfDocumentId));

  const yaPagado = Number(agg?.pagado ?? 0);
  const saldo    = doc.montoTotal - yaPagado;

  if (input.montoCentavos <= 0) throw new Error('Monto debe ser positivo');
  if (input.montoCentavos > saldo) {
    throw new Error(`Monto excede saldo pendiente (RD$${(saldo / 100).toFixed(2)})`);
  }

  const [pago] = await db.insert(pagosRecibidos).values({
    teamId:        input.teamId,
    ecfDocumentId: input.ecfDocumentId,
    montoCentavos: input.montoCentavos,
    metodo:        input.metodo,
    referencia:    input.referencia ?? null,
    cuenta:        input.cuenta ?? null,
    fechaPago:     input.fechaPago,
    notas:         input.notas ?? null,
    createdBy:     input.createdBy ?? null,
  }).returning();

  await syncPagoMirror(input.teamId, input.ecfDocumentId);

  return {
    pago,
    saldoAnterior: saldo,
    saldoNuevo:    saldo - input.montoCentavos,
    montoTotal:    doc.montoTotal,
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
