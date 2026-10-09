/**
 * POST /api/cuentas-por-cobrar/recordatorios — recordatorios de pago por correo
 *
 * Body:
 *   { docIds: number[], confirmar?: boolean }
 *
 * SIN `confirmar: true` devuelve una PREVISUALIZACIÓN: a quién se enviaría, con
 * qué saldo, y quiénes quedan fuera por no tener correo. No envía nada.
 * Con `confirmar: true` envía y registra un evento de tipo 'contacto' por cada
 * cuenta, para que quede en el historial de gestión quién avisó y cuándo.
 *
 * El doble paso es deliberado: esto le escribe a clientes reales. Un envío
 * masivo disparado por error no se puede deshacer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teamMembers, teams } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { userCanForTeam } from '@/lib/auth/permissions';
import { sendRecordatorioCobroEmail } from '@/lib/email';
import { registrarEvento } from '@/lib/cobranza/seguimiento';
import { hoyRD } from '@/lib/utils/format';
import { logAudit, getIp } from '@/lib/audit';

/** Tope por lote: evita convertir un clic en cientos de correos. */
const MAX_POR_LOTE = 50;

const schema = z.object({
  docIds:    z.array(z.number().int().positive()).min(1).max(MAX_POR_LOTE),
  confirmar: z.boolean().optional(),
});

interface Destino {
  id: number; codigo: string; cliente: string; email: string | null;
  saldoCents: number; fechaLimite: string | null; diasVencido: number;
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  // Escribirle a un cliente es una acción hacia afuera: se exige el mismo
  // permiso que para facturar, no el de solo lectura.
  if (!await userCanForTeam(teamId, user.platformRole, member?.role, 'facturas:crear')) {
    return NextResponse.json({ error: 'Sin permiso para enviar recordatorios' }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Datos inválidos (máximo ${MAX_POR_LOTE} cuentas por lote)`, detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { docIds, confirmar } = parsed.data;

  const [empresa] = await db
    .select({ razonSocial: teams.razonSocial, name: teams.name })
    .from(teams).where(eq(teams.id, teamId)).limit(1);
  const emisor = empresa?.razonSocial ?? empresa?.name ?? 'Zero';

  // Saldo calculado igual que en la cartera — el correo no puede decir un monto
  // distinto al que muestra la pantalla.
  const filas = await db.execute(sql`
    SELECT d.id,
      coalesce(d.codigo, d.encf) AS codigo,
      coalesce(nullif(d.razon_social_comprador, ''), 'Consumidor Final') AS cliente,
      nullif(d.email_comprador, '') AS email,
      to_char(NULLIF(d.fecha_limite_pago, '')::date, 'YYYY-MM-DD') AS fecha_limite,
      GREATEST(0, d.monto_total
        - coalesce((SELECT SUM(p.monto_centavos) FROM pagos_recibidos p WHERE p.ecf_document_id = d.id), 0)
        - coalesce((SELECT SUM(nc.monto_total) FROM ecf_documents nc
             WHERE nc.team_id = d.team_id AND nc.tipo_ecf = '34'
               AND nc.credito_generado_cents IS NULL
               AND nc.estado NOT IN ('ANULADO','RECHAZADO')
               AND nc.codigo_modificacion IS DISTINCT FROM 2
               AND (nc.origen_documento_id = d.id
                    OR (d.encf LIKE 'E%' AND nc.ncf_modificado = d.encf))), 0)
      ) + coalesce((
        SELECT SUM(nd.monto_total - coalesce((
          SELECT SUM(p2.monto_centavos) FROM pagos_recibidos p2 WHERE p2.ecf_document_id = nd.id
        ), 0))
        FROM ecf_documents nd
        WHERE nd.mora_origen_id = d.id AND nd.estado != 'ANULADO'
          AND (nd.monto_total - coalesce((
            SELECT SUM(p3.monto_centavos) FROM pagos_recibidos p3 WHERE p3.ecf_document_id = nd.id
          ), 0)) > 0
      ), 0) AS saldo,
      GREATEST(0, (now() AT TIME ZONE 'America/Santo_Domingo')::date
                  - NULLIF(d.fecha_limite_pago, '')::date) AS dias_vencido
    FROM ecf_documents d
    WHERE d.team_id = ${teamId}
      AND d.id IN (${sql.join(docIds.map(i => sql`${i}`), sql`, `)})
  `) as unknown as Array<Record<string, string | number | null>>;

  const destinos: Destino[] = filas.map(f => ({
    id:          Number(f.id),
    codigo:      String(f.codigo),
    cliente:     String(f.cliente),
    email:       (f.email as string) ?? null,
    saldoCents:  Number(f.saldo),
    fechaLimite: (f.fecha_limite as string) ?? null,
    diasVencido: Number(f.dias_vencido ?? 0),
  }));

  const enviables  = destinos.filter(d => d.email && d.saldoCents > 0);
  const sinCorreo  = destinos.filter(d => !d.email);
  const sinSaldo   = destinos.filter(d => d.email && d.saldoCents <= 0);

  // ── Previsualización ──────────────────────────────────────────────────────
  if (!confirmar) {
    return NextResponse.json({
      preview: true,
      enviables: enviables.map(d => ({
        id: d.id, codigo: d.codigo, cliente: d.cliente, email: d.email,
        saldoCents: d.saldoCents, diasVencido: d.diasVencido,
      })),
      omitidos: {
        sinCorreo: sinCorreo.map(d => ({ id: d.id, codigo: d.codigo, cliente: d.cliente })),
        sinSaldo:  sinSaldo.map(d => ({ id: d.id, codigo: d.codigo, cliente: d.cliente })),
      },
    });
  }

  // ── Envío ─────────────────────────────────────────────────────────────────
  const enviados: number[] = [];
  const fallidos: { id: number; error: string }[] = [];

  for (const d of enviables) {
    try {
      await sendRecordatorioCobroEmail({
        email:       d.email!,
        cliente:     d.cliente,
        emisor,
        documento:   d.codigo,
        saldoCents:  d.saldoCents,
        fechaLimite: d.fechaLimite,
        diasVencido: d.diasVencido,
      });
      // Queda en el historial de gestión: quién avisó, cuándo y por qué canal.
      await registrarEvento({
        teamId, docId: d.id, userId: user.id,
        tipo: 'contacto', fecha: hoyRD(), canal: 'correo',
        comentario: `Recordatorio de pago enviado a ${d.email}`,
      });
      enviados.push(d.id);
    } catch (e) {
      fallidos.push({ id: d.id, error: e instanceof Error ? e.message : 'Error al enviar' });
    }
  }

  logAudit({
    teamId, userId: user.id, actor: user.email,
    action:   'RECORDATORIOS_COBRO_ENVIADOS',
    resource: `docs:${enviados.join(',')}`,
    ip:       getIp(req),
    meta:     { solicitados: docIds.length, enviados: enviados.length, fallidos: fallidos.length },
  });

  return NextResponse.json({
    ok: true,
    enviados: enviados.length,
    fallidos,
    omitidos: { sinCorreo: sinCorreo.length, sinSaldo: sinSaldo.length },
  });
}
