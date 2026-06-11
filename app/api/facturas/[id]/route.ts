/**
 * GET /api/facturas/[id]  — Detalle completo de un documento e-CF
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, clients, pagosRecibidos, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, or, ne, inArray, sql } from 'drizzle-orm';
import { TIPOS_ECF, TIPO_ECF_REGLAS } from '@/lib/ecf/types';
import { getNcAplicadoCts } from '@/lib/facturas/notas-credito';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const docId = parseInt(id);
  if (isNaN(docId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db
    .select({ doc: ecfDocuments, team: teams })
    .from(ecfDocuments)
    .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

  const { doc, team } = row;

  // Cobranza — source of truth: pagos_recibidos (multi-pago, AR/import) +
  // el pago inline registrado al emitir (pago al momento). Suma de ambos.
  const [pagAgg] = await db
    .select({ sum: sql<number>`coalesce(sum(${pagosRecibidos.montoCentavos}), 0)` })
    .from(pagosRecibidos)
    .where(eq(pagosRecibidos.ecfDocumentId, docId));
  const sumLedger = Number(pagAgg?.sum ?? 0);
  // Líneas individuales del ledger — para mostrar el historial real en el detalle.
  const pagoLineasRows = await db
    .select({
      id:            pagosRecibidos.id,
      metodo:        pagosRecibidos.metodo,
      montoCentavos: pagosRecibidos.montoCentavos,
      cuenta:        pagosRecibidos.cuenta,
      referencia:    pagosRecibidos.referencia,
      fechaPago:     pagosRecibidos.fechaPago,
      notas:         pagosRecibidos.notas,
      usuarioName:   users.name,
      usuarioEmail:  users.email,
    })
    .from(pagosRecibidos)
    .leftJoin(users, eq(pagosRecibidos.createdBy, users.id))
    .where(eq(pagosRecibidos.ecfDocumentId, docId))
    .orderBy(pagosRecibidos.fechaPago, pagosRecibidos.id);
  const inlineCts = doc.pagoRecibido === 'true' ? (doc.pagoValorCts ?? 0) : 0;
  // Ledger (pagos_recibidos) = source of truth. Inline solo como fallback para
  // docs legacy aún sin migrar al ledger (evita doble conteo: OR, no suma).
  const pagadoCts = sumLedger > 0 ? sumLedger : inlineCts;

  // Cargar cliente si existe
  let cliente = null;
  if (doc.clientId) {
    const [cl] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, doc.clientId))
      .limit(1);
    cliente = cl ?? null;
  }

  // Cargar nombres del usuario que creó / editó el documento
  let createdByName: string | null = null;
  let updatedByName: string | null = null;
  const userIds = [doc.createdBy, doc.updatedBy].filter((v): v is number => v != null);
  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, userIds));
    const byId = new Map(userRows.map(u => [u.id, u.name]));
    createdByName = doc.createdBy ? (byId.get(doc.createdBy) ?? null) : null;
    updatedByName = doc.updatedBy ? (byId.get(doc.updatedBy) ?? null) : null;
  }

  const TIPO_NOMBRE_EXTRA: Record<string, string> = { 'sin-ncf': 'Factura' };
  const tipoNombre = TIPOS_ECF[doc.tipoEcf as keyof typeof TIPOS_ECF] ?? TIPO_NOMBRE_EXTRA[doc.tipoEcf] ?? `Tipo ${doc.tipoEcf}`;
  const regla = TIPO_ECF_REGLAS[doc.tipoEcf];

  // Lineas / items.
  // Soporta dos formatos en lineas_json:
  //  - canónico: { nombreItem, cantidadItem, precioUnitarioItem, descripcionItem, tasaItbis }
  //  - Alegra/legacy: { nombre, cantidad, precio, descripcion, tasa }
  // Normaliza a las keys canónicas que lee el frontend (el `??` deja intactas las canónicas).
  function normalizeLinea(l: Record<string, unknown>) {
    return {
      ...l,
      nombreItem:         l.nombreItem         ?? l.nombre,
      descripcionItem:    l.descripcionItem    ?? l.descripcion ?? '',
      cantidadItem:       l.cantidadItem       ?? l.cantidad,
      precioUnitarioItem: l.precioUnitarioItem ?? l.precio,
      tasaItbis:          l.tasaItbis          ?? l.tasa,
    };
  }
  let lineas: unknown[] = [];
  if (doc.lineasJson) {
    try {
      const parsed = JSON.parse(doc.lineasJson);
      if (Array.isArray(parsed)) {
        lineas = parsed.map(p =>
          p && typeof p === 'object' ? normalizeLinea(p as Record<string, unknown>) : p,
        );
      }
    } catch {
      // ignore — borrador antiguo sin items
    }
  }

  // Retenciones
  let retencionesArr: unknown[] = [];
  if (doc.retenciones) {
    try {
      const parsed = JSON.parse(doc.retenciones);
      if (Array.isArray(parsed)) retencionesArr = parsed;
    } catch {
      // ignore
    }
  }

  // Notas (NC tipo 34 / ND tipo 33) que modifican este documento. Vinculadas
  // por origen_documento_id (id, robusto) o por ncf_modificado = encf real.
  // Excluye las ND de mora (mora_origen_id) — esas tienen su propia sección.
  const refCond = doc.encf && /^E\d/.test(doc.encf)
    ? or(eq(ecfDocuments.origenDocumentoId, docId), eq(ecfDocuments.ncfModificado, doc.encf))
    : eq(ecfDocuments.origenDocumentoId, docId);
  const ncsAsociadas = await db
    .select({
      id:                 ecfDocuments.id,
      encf:               ecfDocuments.encf,
      codigo:             ecfDocuments.codigo,
      tipoEcf:            ecfDocuments.tipoEcf,
      estado:             ecfDocuments.estado,
      estadoPago:         ecfDocuments.estadoPago,
      fechaEmision:       ecfDocuments.fechaEmision,
      montoTotal:         ecfDocuments.montoTotal,
      codigoModificacion: ecfDocuments.codigoModificacion,
      razonModificacion:  ecfDocuments.razonModificacion,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      refCond,
      ne(ecfDocuments.id, docId),
      sql`${ecfDocuments.moraOrigenId} IS DISTINCT FROM ${docId}`,
    ))
    .orderBy(ecfDocuments.id);

  // NC aplicadas: reducen el saldo cobrable de esta factura.
  const ncAplicadoCts = doc.tipoEcf !== '34'
    ? await getNcAplicadoCts(teamId, docId, doc.encf)
    : 0;

  // Si ESTE documento es una ND de mora, traer la factura padre (para mostrar/linkear).
  let moraOrigen: { id: number; codigo: string | null; encf: string } | null = null;
  if (doc.moraOrigenId) {
    const [padre] = await db
      .select({ id: ecfDocuments.id, codigo: ecfDocuments.codigo, encf: ecfDocuments.encf })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.id, doc.moraOrigenId), eq(ecfDocuments.teamId, teamId)))
      .limit(1);
    moraOrigen = padre ?? null;
  }

  // Si ESTE documento es una nota (33/34, no mora), traer su factura padre.
  let notaOrigen: { id: number; codigo: string | null; encf: string; estado: string } | null = null;
  if ((doc.tipoEcf === '33' || doc.tipoEcf === '34') && !doc.moraOrigenId) {
    if (doc.origenDocumentoId) {
      const [padre] = await db
        .select({ id: ecfDocuments.id, codigo: ecfDocuments.codigo, encf: ecfDocuments.encf, estado: ecfDocuments.estado })
        .from(ecfDocuments)
        .where(and(eq(ecfDocuments.id, doc.origenDocumentoId), eq(ecfDocuments.teamId, teamId)))
        .limit(1);
      notaOrigen = padre ?? null;
    } else if (doc.ncfModificado) {
      const [padre] = await db
        .select({ id: ecfDocuments.id, codigo: ecfDocuments.codigo, encf: ecfDocuments.encf, estado: ecfDocuments.estado })
        .from(ecfDocuments)
        .where(and(eq(ecfDocuments.teamId, teamId), eq(ecfDocuments.encf, doc.ncfModificado)))
        .limit(1);
      notaOrigen = padre ?? null;
    }
  }

  // Notas de débito de MORA atadas a esta factura (vía mora_origen_id).
  const notasMoraRows = await db
    .select({
      id:         ecfDocuments.id,
      codigo:     ecfDocuments.codigo,
      montoTotal: ecfDocuments.montoTotal,
      estado:     ecfDocuments.estado,
      estadoPago: ecfDocuments.estadoPago,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      eq(ecfDocuments.moraOrigenId, docId),
    ))
    .orderBy(ecfDocuments.id);

  return NextResponse.json({
    id: doc.id,
    encf: doc.encf,
    codigo: doc.codigo ?? null,
    estadoPago: doc.estadoPago,
    tipoEcf: doc.tipoEcf,
    tipoNombre,
    categoria: regla?.categoria ?? 'venta',
    estado: doc.estado,
    trackId: doc.trackId,
    codigoSeguridad: doc.codigoSeguridad,
    urlVerificacion: doc.urlVerificacion,
    fechaFirma: doc.fechaFirma,
    mensajesDgii: doc.mensajesDgii ? JSON.parse(doc.mensajesDgii) : null,
    ncfModificado: doc.ncfModificado,
    origenDocumentoId: doc.origenDocumentoId ?? null,
    codigoModificacion: doc.codigoModificacion ?? null,
    razonModificacion: doc.razonModificacion ?? null,
    moraOrigenId: doc.moraOrigenId ?? null,
    fechaEmision: doc.fechaEmision.toISOString(),
    fechaLimitePago: doc.fechaLimitePago,
    tipoPago: doc.tipoPago,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    createdByName,
    updatedByName,
    dependienteNombre: doc.dependienteNombre ?? null,

    // Form payload (terminos / notas / pie / comentario)
    terminosCondiciones: doc.terminosCondiciones,
    notas:               doc.notas,
    pieFactura:          doc.pieFactura,
    comentario:          doc.comentario,
    lineas,
    retencionesList:     retencionesArr,

    pago: {
      recibido: pagadoCts > 0,
      metodo:   doc.pagoMetodo,
      cuenta:   doc.pagoCuenta,
      valorCts: pagadoCts,
      valorDOP: (pagadoCts / 100).toFixed(2),
      fecha:    doc.pagoFecha,
      // Historial real del ledger (read-only en el detalle). Vacío → sin pagos.
      lineas: pagoLineasRows.map(p => ({
        id:         p.id,
        metodo:     p.metodo,
        valor:      (p.montoCentavos / 100).toFixed(2),
        cuenta:     p.cuenta ?? undefined,
        referencia: p.referencia ?? undefined,
        fechaPago:  p.fechaPago,
        notas:      p.notas ?? undefined,
        usuario:    p.usuarioName ?? p.usuarioEmail ?? undefined,
      })),
    },

    emisor: {
      razonSocial:     team.razonSocial ?? team.name,
      nombreComercial: team.nombreComercial,
      rnc:             team.rnc,
      direccion:       team.direccion,
      telefono:        (team as any).telefono,
      email:           (team as any).emailFacturacion,
    },

    comprador: {
      clienteId:   doc.clientId,
      rnc:         doc.rncComprador,
      razonSocial: doc.razonSocialComprador,
      email:       doc.emailComprador,
      // Datos adicionales del cliente si está guardado
      telefono:    cliente?.telefono,
      direccion:   cliente?.direccion,
    },

    montos: {
      montoTotal:  doc.montoTotal,   // en centavos
      totalItbis:  doc.totalItbis,   // en centavos
      subtotal:    doc.montoTotal - doc.totalItbis,
      // NC aplicadas a este documento — reducen el saldo cobrable
      ncAplicado:    ncAplicadoCts,
      // formateados en DOP
      montoTotalDOP: (doc.montoTotal / 100).toFixed(2),
      totalItbisDOP: (doc.totalItbis / 100).toFixed(2),
      subtotalDOP:   ((doc.montoTotal - doc.totalItbis) / 100).toFixed(2),
      ncAplicadoDOP: (ncAplicadoCts / 100).toFixed(2),
    },

    archivos: {
      xmlUrl: doc.xmlUrl,
      pdfUrl: doc.pdfUrl,
      tieneXmlOriginal: !!doc.xmlOriginal,
      tieneXmlFirmado:  !!doc.xmlFirmado,
    },

    // Notas de crédito (34) / débito (33) que modifican este documento
    ncsAsociadas: ncsAsociadas.map(n => ({
      id:                 n.id,
      encf:               n.encf,
      codigo:             n.codigo ?? null,
      tipoEcf:            n.tipoEcf,
      estado:             n.estado,
      estadoPago:         n.estadoPago,
      fechaEmision:       n.fechaEmision?.toISOString?.() ?? n.fechaEmision,
      montoTotal:         n.montoTotal,
      montoTotalDOP:      ((n.montoTotal ?? 0) / 100).toFixed(2),
      codigoModificacion: n.codigoModificacion ?? null,
      razonModificacion:  n.razonModificacion ?? null,
    })),

    // Si este documento ES una nota (33/34, no mora) → su factura padre
    notaOrigen,

    // Notas de débito por mora atadas a esta factura
    notasMora: notasMoraRows.map(n => ({
      id:         n.id,
      codigo:     n.codigo,
      montoTotal: n.montoTotal,
      estado:     n.estado,
      estadoPago: n.estadoPago,
    })),

    // Si este documento ES una ND de mora → la factura padre
    moraOrigen,
  });
}
