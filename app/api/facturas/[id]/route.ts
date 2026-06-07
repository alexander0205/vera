/**
 * GET /api/facturas/[id]  — Detalle completo de un documento e-CF
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, clients, pagosRecibidos, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, sql } from 'drizzle-orm';
import { TIPOS_ECF, TIPO_ECF_REGLAS } from '@/lib/ecf/types';

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
  // Líneas individuales del ledger — para mostrar el split real en el detalle.
  const pagoLineasRows = await db
    .select({
      metodo:        pagosRecibidos.metodo,
      montoCentavos: pagosRecibidos.montoCentavos,
      cuenta:        pagosRecibidos.cuenta,
      referencia:    pagosRecibidos.referencia,
    })
    .from(pagosRecibidos)
    .where(eq(pagosRecibidos.ecfDocumentId, docId))
    .orderBy(pagosRecibidos.id);
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

  // Cargar nombre del usuario que creó el documento
  let createdByName: string | null = null;
  if (doc.createdBy) {
    const [creator] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, doc.createdBy))
      .limit(1);
    createdByName = creator?.name ?? null;
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

  // NCA-20: NCs/débitos que referencian este e-NCF (NC tipo 33, débito tipo 34)
  const ncsAsociadas = doc.encf
    ? await db
        .select({
          id:           ecfDocuments.id,
          encf:         ecfDocuments.encf,
          tipoEcf:      ecfDocuments.tipoEcf,
          estado:       ecfDocuments.estado,
          fechaEmision: ecfDocuments.fechaEmision,
          montoTotal:   ecfDocuments.montoTotal,
        })
        .from(ecfDocuments)
        .where(and(
          eq(ecfDocuments.teamId, teamId),
          eq(ecfDocuments.ncfModificado, doc.encf),
        ))
    : [];

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
    fechaEmision: doc.fechaEmision.toISOString(),
    fechaLimitePago: doc.fechaLimitePago,
    tipoPago: doc.tipoPago,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    createdByName,
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
      // Líneas reales del ledger (split). Vacío → el detalle usa el espejo inline.
      lineas: pagoLineasRows.map(p => ({
        metodo:     p.metodo,
        valor:      (p.montoCentavos / 100).toFixed(2),
        cuenta:     p.cuenta ?? undefined,
        referencia: p.referencia ?? undefined,
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
      // formateados en DOP
      montoTotalDOP: (doc.montoTotal / 100).toFixed(2),
      totalItbisDOP: (doc.totalItbis / 100).toFixed(2),
      subtotalDOP:   ((doc.montoTotal - doc.totalItbis) / 100).toFixed(2),
    },

    archivos: {
      xmlUrl: doc.xmlUrl,
      pdfUrl: doc.pdfUrl,
      tieneXmlOriginal: !!doc.xmlOriginal,
      tieneXmlFirmado:  !!doc.xmlFirmado,
    },

    // NCA-20: NCs (tipo 33) y débitos (tipo 34) que referencian este e-NCF
    ncsAsociadas: ncsAsociadas.map(n => ({
      id:           n.id,
      encf:         n.encf,
      tipoEcf:      n.tipoEcf,
      estado:       n.estado,
      fechaEmision: n.fechaEmision?.toISOString?.() ?? n.fechaEmision,
      montoTotal:   n.montoTotal,
      montoTotalDOP: ((n.montoTotal ?? 0) / 100).toFixed(2),
    })),
  });
}
