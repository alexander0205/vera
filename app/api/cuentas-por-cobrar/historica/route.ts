/**
 * POST /api/cuentas-por-cobrar/historica
 *
 * Crea una cuenta por cobrar HISTÓRICA — factura previa al uso de emitedo
 * que NO se envía a DGII. Solo se registra para tracking de cobranza.
 *
 * Distinguible del resto:
 * - estado:  'HISTORICA'
 * - encf:    provisto por el user (NCF preimpreso legacy) o auto-generado `HIST-{ts}`
 * - tipoEcf: '00' (placeholder — no es un tipo DGII válido)
 * - tipoPago: 2 (crédito, para que aparezca en AR)
 *
 * Opcionalmente registra un pago inicial si `montoYaPagadoDOP` > 0.
 *
 * Body:
 *   {
 *     encf?:                string,
 *     clientId?:            number,
 *     rncComprador?:        string,
 *     razonSocialComprador?: string,
 *     emailComprador?:      string,
 *     fechaEmision:         'YYYY-MM-DD',
 *     fechaLimitePago:      'YYYY-MM-DD',
 *     montoTotalDOP:        number,
 *     montoYaPagadoDOP?:    number,
 *     notas?:               string,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser, getTeamIdForUser, registrarPago } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { userCan } from '@/lib/config/roles';
import { logAudit, getIp } from '@/lib/audit';

const schema = z.object({
  encf:                 z.string().max(40).optional(),
  clientId:             z.number().int().positive().optional(),
  rncComprador:         z.string().max(20).optional(),
  razonSocialComprador: z.string().max(255).optional(),
  emailComprador:       z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  fechaEmision:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fechaLimitePago:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  montoTotalDOP:        z.number().positive(),
  montoYaPagadoDOP:     z.number().min(0).optional(),
  notas:                z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

    const [member] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1);

    if (!userCan(user.platformRole, member?.role, 'facturas:crear')) {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
    }

    const body   = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }

    const d = parsed.data;
    const yaPagadoCts = Math.round((d.montoYaPagadoDOP ?? 0) * 100);
    const totalCts    = Math.round(d.montoTotalDOP * 100);

    if (yaPagadoCts > totalCts) {
      return NextResponse.json({ error: 'Monto ya pagado no puede exceder el total' }, { status: 422 });
    }

    // encf: provisto o auto-generado `HIST-{teamId}-{timestamp36}`
    const encf = d.encf?.trim() || `HIST-${teamId}-${Date.now().toString(36).toUpperCase()}`;

    const [saved] = await db.insert(ecfDocuments).values({
      teamId,
      clientId:             d.clientId ?? null,
      encf,
      tipoEcf:              '00',           // marker: no es comprobante DGII
      estado:               'HISTORICA',
      rncComprador:         d.rncComprador,
      razonSocialComprador: d.razonSocialComprador,
      emailComprador:       d.emailComprador,
      montoTotal:           totalCts,
      totalItbis:           0,              // legacy: no separamos ITBIS
      tipoPago:             2,              // crédito → aparece en AR
      // Parsear YYYY-MM-DD como fecha local (mediodía evita drift TZ negativo).
      // `new Date('2026-04-01')` se interpreta como UTC midnight → en TZ -4
      // termina mostrando 31/03. Usar mediodía mantiene la fecha en cualquier TZ.
      fechaEmision:         new Date(d.fechaEmision + 'T12:00:00'),
      fechaLimitePago:      d.fechaLimitePago,
      notas:                d.notas ?? `Cuenta por cobrar histórica importada por ${user.email}`,
    }).returning();

    // Si vino pagado parcial inicial, registrarlo
    let pagoInicial = null;
    if (yaPagadoCts > 0) {
      const result = await registrarPago({
        teamId,
        ecfDocumentId: saved.id,
        montoCentavos: yaPagadoCts,
        metodo:        'otro',
        fechaPago:     d.fechaEmision,
        notas:         'Pago previo (importado con cuenta histórica)',
        createdBy:     user.id,
      });
      pagoInicial = result.pago;
    }

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action:   'PAGO_REGISTRADO',  // reusamos acción existente para histórica con pago
      resource: `doc:${saved.id}`,
      ip:       getIp(req),
      meta:     {
        tipo:        'cuenta_historica',
        encf,
        totalCts,
        yaPagadoCts,
        clienteRnc:  d.rncComprador,
      },
    });

    return NextResponse.json({
      ok:              true,
      documentoId:     saved.id,
      encf,
      saldoPendiente:  totalCts - yaPagadoCts,
      pagoInicialId:   pagoInicial?.id ?? null,
    });
  } catch (err) {
    console.error('[POST /api/cuentas-por-cobrar/historica]', err);
    const mensaje = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
