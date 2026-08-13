import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, users } from '@/lib/db/schema';
import { and, eq, gte, lte, desc, like, count, or, sql, inArray, ne, isNull } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search') ?? '';
  const estado = sp.get('estado') ?? '';
  const desde = sp.get('desde') ?? '';
  const hasta = sp.get('hasta') ?? '';
  // NCA-22: filtro "conNcs" — facturas con NCs/débitos asociados
  const conNcs = sp.get('conNcs') === '1' || sp.get('conNcs') === 'true';
  // Filtro por cliente — usado por módulos que necesitan las facturas de UN
  // cliente puntual (ej. administración escolar: facturas del tutor).
  const clientId = sp.get('clientId') ? parseInt(sp.get('clientId')!, 10) : null;
  // Filtro por dependiente — afina clientId a las facturas de UN hijo puntual
  // (ej. administración escolar: perfil de un estudiante específico, no todos
  // los hijos del mismo tutor). Aditivo: solo aplica si se manda.
  const dependienteId = sp.get('dependienteId') ? parseInt(sp.get('dependienteId')!, 10) : null;
  const limit = Math.min(parseInt(sp.get('limit') ?? '50', 10), 200);
  const offset = parseInt(sp.get('offset') ?? '0', 10);

  // Facturas históricas (estado=HISTORICA, tipoEcf='00') importadas por CSV
  // SÍ se listan aquí como ventas — además de en /dashboard/cuentas-por-cobrar.
  const conditions = [
    eq(ecfDocuments.teamId, teamId),
    // Las Notas de Crédito (34) y Débito (33) tienen su propia pantalla — no se listan aquí.
    sql`${ecfDocuments.tipoEcf} NOT IN ('33', '34')`,
  ];

  if (clientId) {
    conditions.push(eq(ecfDocuments.clientId, clientId));
  }

  if (dependienteId) {
    conditions.push(eq(ecfDocuments.dependienteId, dependienteId));
  }

  if (search) {
    conditions.push(
      or(
        like(ecfDocuments.encf, `%${search}%`),
        like(ecfDocuments.razonSocialComprador, `%${search}%`),
      )!,
    );
  }

  if (estado && estado !== 'todos') {
    conditions.push(eq(ecfDocuments.estado, estado));
  }

  if (desde) {
    conditions.push(gte(ecfDocuments.createdAt, new Date(desde)));
  }

  if (hasta) {
    conditions.push(lte(ecfDocuments.createdAt, new Date(hasta + 'T23:59:59')));
  }

  // Filtro por clasificación de maestro (Plan A): facturas etiquetadas con
  // estos valores. Varios valores = AND (cada uno debe estar presente).
  const maestroValorIds = sp.getAll('maestroValorId').map(v => parseInt(v, 10)).filter(Number.isFinite);
  for (const vid of maestroValorIds) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM factura_maestro_valores fmv
      WHERE fmv.ecf_document_id = ecf_documents.id
        AND fmv.valor_id = ${vid}
    )`);
  }

  // NCA-22: solo facturas con NCs/débitos referenciándolas
  if (conNcs) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ecf_documents AS nc
      WHERE nc.team_id = ${teamId}
        AND nc.ncf_modificado = ecf_documents.encf
    )`);
  }

  const where = and(...conditions);

  const [docsRaw, totalRows] = await Promise.all([
    db
      .select({
        id:                   ecfDocuments.id,
        encf:                 ecfDocuments.encf,
        codigo:               ecfDocuments.codigo,
        tipoEcf:              ecfDocuments.tipoEcf,
        estado:               ecfDocuments.estado,
        estadoPago:           ecfDocuments.estadoPago,
        rncComprador:         ecfDocuments.rncComprador,
        razonSocialComprador: ecfDocuments.razonSocialComprador,
        emailComprador:       ecfDocuments.emailComprador,
        montoTotal:           ecfDocuments.montoTotal,
        totalItbis:           ecfDocuments.totalItbis,
        tipoPago:             ecfDocuments.tipoPago,
        fechaEmision:         ecfDocuments.fechaEmision,
        fechaLimitePago:      ecfDocuments.fechaLimitePago,
        createdAt:            ecfDocuments.createdAt,
        // Subquery correlacionada — usar nombre literal de tabla. Drizzle
        // interpola ${ecfDocuments.id} como parámetro, no como column ref,
        // causando que todas las filas devolvieran el mismo SUM.
        // Cobranza: ledger pagos_recibidos = source of truth. Fallback al pago
        // inline (pago_valor_cts) para docs legacy aún sin fila en el ledger.
        pagado: sql<number>`GREATEST(
          coalesce((
            SELECT SUM(monto_centavos) FROM pagos_recibidos
            WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
          ), 0),
          CASE WHEN ecf_documents.pago_recibido = 'true'
               THEN coalesce(ecf_documents.pago_valor_cts, 0) ELSE 0 END
        )`,
        // Saldo de mora aún sin pagar: suma de (monto − pagos) de las ND de mora
        // atadas a esta factura, no anuladas y con saldo > 0. Permite mostrar
        // "Mora pendiente" cuando el capital ya está pagado.
        moraPendiente: sql<number>`coalesce((
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
        createdByName:     users.name,
        dependienteNombre: ecfDocuments.dependienteNombre,
        // Un turno concilia el cobro, pero no identifica el origen: Facturación
        // también puede cobrar mientras hay turno abierto. `tipoOrden` es POS.
        turnoCajaId:       ecfDocuments.turnoCajaId,
        tipoOrden:         ecfDocuments.tipoOrden,
      })
      .from(ecfDocuments)
      .leftJoin(users, eq(users.id, ecfDocuments.createdBy))
      .where(where)
      .orderBy(desc(ecfDocuments.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(ecfDocuments)
      .where(where),
  ]);

  // ── Notas de débito por mora de las facturas de ESTA página ─────────────────
  // Un solo query agrupado por los ids visibles → cada factura expande su
  // historial de mora (código, estado, saldo) y su total aplicado. Barato:
  // acotado a la página (limit ≤ 200).
  const docIds = docsRaw.map(d => d.id);
  const moraNotasPorFactura = new Map<number, {
    id: number; codigo: string | null; montoTotal: number; saldo: number;
    estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA';
    fechaEmision: string | Date | null; periodo: string | Date | null;
  }[]>();
  const moraAplicadaPorFactura = new Map<number, number>();
  // Notas de débito MANUALES (flete, ajuste, cargo extra) ligadas a la factura
  // por origen_documento_id. No son mora, pero son deuda de la misma factura:
  // sin contarlas, una factura con su capital saldado se muestra "Pagada"
  // aunque el cliente siga debiendo el cargo.
  const ndManualPorFactura = new Map<number, number>();
  if (docIds.length > 0) {
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
        inArray(ecfDocuments.moraOrigenId, docIds),
        ne(ecfDocuments.estado, 'ANULADO'),
      ))
      .orderBy(ecfDocuments.id);

    for (const m of moraRows) {
      if (m.moraOrigenId == null) continue;
      const pagadoNd = Number(m.pagado);
      const saldoNd  = m.montoTotal - pagadoNd;
      const estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA' =
        saldoNd <= 0 ? 'PAGADA' : pagadoNd > 0 ? 'PARCIAL' : 'PENDIENTE';
      const arr = moraNotasPorFactura.get(m.moraOrigenId) ?? [];
      arr.push({
        id: m.id, codigo: m.codigo, montoTotal: m.montoTotal, saldo: Math.max(0, saldoNd), estado,
        fechaEmision: m.fechaEmision, periodo: m.periodo,
      });
      moraNotasPorFactura.set(m.moraOrigenId, arr);
      moraAplicadaPorFactura.set(m.moraOrigenId, (moraAplicadaPorFactura.get(m.moraOrigenId) ?? 0) + m.montoTotal);
    }
  }

  if (docIds.length > 0) {
    const ndRows = await db
      .select({
        origen:     ecfDocuments.origenDocumentoId,
        montoTotal: ecfDocuments.montoTotal,
        pagado: sql<number>`coalesce((
          SELECT SUM(monto_centavos) FROM pagos_recibidos
          WHERE pagos_recibidos.ecf_document_id = ecf_documents.id
        ), 0)`,
      })
      .from(ecfDocuments)
      .where(and(
        eq(ecfDocuments.teamId, teamId),
        inArray(ecfDocuments.origenDocumentoId, docIds),
        eq(ecfDocuments.tipoEcf, '33'),
        isNull(ecfDocuments.moraOrigenId),   // las de mora ya se contaron arriba
        ne(ecfDocuments.estado, 'ANULADO'),
      ));
    for (const nd of ndRows) {
      if (nd.origen == null) continue;
      const saldoNd = nd.montoTotal - Number(nd.pagado);
      if (saldoNd <= 0) continue;
      ndManualPorFactura.set(nd.origen, (ndManualPorFactura.get(nd.origen) ?? 0) + saldoNd);
    }
  }

  const docs = docsRaw.map(d => ({
    ...d,
    // pagado/moraPendiente vienen como string desde los subqueries SQL de
    // postgres: coercer a número para que el cliente sume, no concatene.
    pagado:        Number(d.pagado),
    moraPendiente: Number(d.moraPendiente),
    moraNotas:     moraNotasPorFactura.get(d.id) ?? [],
    moraAplicada:  moraAplicadaPorFactura.get(d.id) ?? 0,
    ndPendiente:   ndManualPorFactura.get(d.id) ?? 0,
  }));

  return NextResponse.json({ docs, total: totalRows[0]?.total ?? 0 });
}
