/**
 * Barrido diario de suscripciones. Hace dos cosas:
 *
 * 1. AVISA el paso a solo lectura. Es el caso que Stripe no notifica: no es un
 *    evento suyo, es el calendario — se venció la prueba, o se agotó la gracia
 *    de mora. El estado se deriva solo (lib/suscripcion/estado.ts), así que la
 *    app ya se comporta bien sin este cron; lo que falta sin él es DECÍRSELO
 *    al cliente, y quien está a punto de perder el acceso es justamente el que
 *    no está entrando a ver el banner.
 *
 * 2. RECONCILIA contra Stripe. Un webhook perdido —caída, secret rotado, bug—
 *    deja la fila desincronizada para siempre, porque nada la vuelve a tocar
 *    hasta el próximo evento de ESA empresa. Esta pasada le pregunta a Stripe
 *    por cada empresa con cliente y reescribe lo que haga falta. Con pocas
 *    decenas de empresas es un puñado de requests; si algún día son miles,
 *    esto es lo que hay que trocear.
 *
 * Es idempotente: `aviso_solo_lectura_en` marca que ya se mandó, así que
 * correrlo dos veces el mismo día no manda dos correos; y la reconciliación
 * escribe lo mismo que ya hay cuando no hay drift.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { BILLING_ENABLED } from '@/lib/config/billing';
import { evaluarSuscripcion } from '@/lib/suscripcion/estado';
import { sincronizarConStripe } from '@/lib/payments/sincronizar';
import { destinatarioDeSuscripcion } from '@/lib/suscripcion/destinatario';
import { enviarSoloLectura } from '@/lib/email/suscripcion';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Con el billing apagado no hay nada que barrer, y sobre todo no hay nada
  // que avisarle a nadie: sería mandar correos de cobro en un producto que
  // todavía no cobra.
  if (!BILLING_ENABLED) {
    return NextResponse.json({ ok: true, motivo: 'billing apagado', avisados: 0 });
  }

  const ahora = new Date();

  // ── Reconciliación contra Stripe ──────────────────────────────────────────
  // Antes de evaluar nada: si un webhook se perdió, lo que hay en la base está
  // viejo, y avisar sobre datos viejos es avisar mal. 'admin' queda fuera
  // (acceso manual, Stripe no opina) y sin customer no hay a quién preguntar.
  const conCliente = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(
      isNotNull(teams.stripeCustomerId),
      or(isNull(teams.subscriptionStatus), ne(teams.subscriptionStatus, 'admin')),
    ));

  let reconciliadas = 0;
  const driftFallos: { teamId: number; error: string }[] = [];
  // En serie a propósito: son pocas empresas y la API de Stripe tiene rate
  // limit; un Promise.all aquí es la forma de estrenarlo.
  for (const t of conCliente) {
    try {
      const r = await sincronizarConStripe(t.id);
      if (r.aplicado) reconciliadas++;
    } catch (err) {
      driftFallos.push({ teamId: t.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (driftFallos.length > 0) {
    console.warn('[cron.suscripciones] reconciliación con fallos', driftFallos);
  }

  // Solo las que tienen un reloj corriendo. Una empresa sin prueba ni mora no
  // puede cambiar de estado por el paso del tiempo, así que no se mira.
  const candidatas = await db
    .select({
      id:                 teams.id,
      planName:           teams.planName,
      subscriptionStatus: teams.subscriptionStatus,
      trialEnd:           teams.trialEnd,
      periodoFin:         teams.periodoFin,
      morosoDesde:        teams.morosoDesde,
      cancelarAlFin:      teams.cancelarAlFin,
      avisoSoloLecturaEn: teams.avisoSoloLecturaEn,
    })
    .from(teams)
    .where(and(
      or(isNotNull(teams.trialEnd), isNotNull(teams.morosoDesde)),
      // Ya avisada = no se vuelve a mirar. Se limpia al reactivar.
      isNull(teams.avisoSoloLecturaEn),
    ));

  const avisados: number[] = [];
  const fallos: { teamId: number; error: string }[] = [];

  for (const t of candidatas) {
    const sus = evaluarSuscripcion(t, ahora);
    if (sus.estado !== 'solo-lectura') continue;

    try {
      const destinatario = await destinatarioDeSuscripcion(t.id);
      if (!destinatario) {
        fallos.push({ teamId: t.id, error: 'sin destinatario' });
        continue;
      }

      await enviarSoloLectura({
        ...destinatario,
        // Si hubo un cobro fallido, el motivo es ese; si no, se le acabó la
        // prueba. El orden importa: una empresa que pagó y luego cayó en mora
        // tiene las DOS fechas puestas.
        motivo: t.morosoDesde ? 'mora' : 'prueba',
        diasRestantes: sus.diasRestantes ?? 0,
      });

      // Se marca DESPUÉS de enviar: al revés, un fallo de Resend dejaría la
      // marca puesta y el cliente no se enteraría nunca.
      await db.update(teams)
        .set({ avisoSoloLecturaEn: ahora, updatedAt: ahora })
        .where(eq(teams.id, t.id));

      avisados.push(t.id);
    } catch (err) {
      fallos.push({ teamId: t.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (fallos.length > 0) {
    console.warn('[cron.suscripciones] avisos que no salieron', fallos);
  }

  return NextResponse.json({
    ok: true,
    reconciliadas,
    reconciliacionFallos: driftFallos.length,
    revisadas: candidatas.length,
    avisados: avisados.length,
    teams: avisados,
    fallos: fallos.length,
  });
}
