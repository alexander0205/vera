/**
 * GET /api/facturas/[id]  — Detalle completo de un documento e-CF
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams, clients } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
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

  const tipoNombre = TIPOS_ECF[doc.tipoEcf as keyof typeof TIPOS_ECF] ?? `Tipo ${doc.tipoEcf}`;
  const regla = TIPO_ECF_REGLAS[doc.tipoEcf];

  return NextResponse.json({
    id: doc.id,
    encf: doc.encf,
    tipoEcf: doc.tipoEcf,
    tipoNombre,
    categoria: regla?.categoria ?? 'venta',
    estado: doc.estado,
    trackId: doc.trackId,
    codigoSeguridad: doc.codigoSeguridad,
    mensajesDgii: doc.mensajesDgii ? JSON.parse(doc.mensajesDgii) : null,
    ncfModificado: doc.ncfModificado,
    fechaEmision: doc.fechaEmision.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),

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
  });
}
