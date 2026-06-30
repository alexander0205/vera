/**
 * POST /api/facturas/[id]/reset-emision
 *
 * Cancela un envío RECHAZADO por la DGII y devuelve el documento a BORRADOR
 * para corregirlo y reintentar. Solo admin (mismo nivel que anular).
 *
 * Body: { mantenerEncf?: boolean }
 *   - false (default): descarta el e-NCF rechazado; el reenvío toma uno nuevo
 *     de la secuencia (recomendado — un e-NCF rechazado no se reusa).
 *   - true: conserva el e-NCF; el reenvío lo reintenta tal cual (el usuario
 *     "prueba con el mismo" tras corregir el error).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teamMembers, users } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { userCanForTeam } from '@/lib/auth/permissions';
import { logAudit, getIp } from '@/lib/audit';
import { withRequestAuditContext } from '@/lib/db/audit-context';

const RESETEABLES = ['RECHAZADO'];

const bodySchema = z.object({ mantenerEncf: z.boolean().optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  // Gate: mismo permiso admin que anular.
  const [[u], [m]] = await Promise.all([
    db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, user.id)).limit(1),
    db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId))).limit(1),
  ]);
  if (!await userCanForTeam(teamId, u?.platformRole, m?.role, 'facturas:anular')) {
    return NextResponse.json({ error: 'Sin permiso para cancelar envíos' }, { status: 403 });
  }

  const { id } = await params;
  const docId = parseInt(id);
  if (isNaN(docId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  let mantenerEncf = false;
  try {
    const body = await req.json();
    mantenerEncf = bodySchema.parse(body ?? {}).mantenerEncf ?? false;
  } catch { /* sin body → mantenerEncf=false */ }

  const [doc] = await db
    .select()
    .from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

  if (!RESETEABLES.includes(doc.estado)) {
    return NextResponse.json(
      { error: `Solo se puede reintentar un documento rechazado por la DGII (estado actual: ${doc.estado}).` },
      { status: 422 },
    );
  }

  const encfPrevio = doc.encf;

  await withRequestAuditContext(
    (tx) => tx
      .update(ecfDocuments)
      .set({
        estado:          'BORRADOR',
        // mantenerEncf=true conserva el e-NCF para reintentarlo; si no, se descarta
        // (queda vacío) y el reenvío adquiere el siguiente de la secuencia.
        encf:            mantenerEncf ? doc.encf : '',
        trackId:         null,
        codigoSeguridad: null,
        fechaFirma:      null,
        urlVerificacion: null,
        mensajesDgii:    null,
        ecfApiEmisionId: null,
        updatedBy:       user.id,
        updatedAt:       new Date(),
      })
      .where(eq(ecfDocuments.id, docId)),
    { userId: user.id, teamId },
  );

  logAudit({
    teamId, userId: user.id, actor: user.email,
    action:   'ECF_RESET',
    resource: encfPrevio,
    ip:       getIp(req),
    meta:     { mantenerEncf, encfPrevio, via: 'reset-emision', docId },
  });

  return NextResponse.json({ ok: true, docId, mantenerEncf, estado: 'BORRADOR' });
}
