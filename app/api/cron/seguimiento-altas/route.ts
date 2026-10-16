/**
 * GET /api/cron/seguimiento-altas — cada hora, de 9 a 18 h de República Dominicana.
 *
 * Le escribe UNA vez, a las 24 horas, a quien empezó a registrarse y se quedó
 * a medias: sin confirmar el correo, sin poner el RNC o sin terminar el alta.
 * El correo sale de Alexander (`alexander@zero.com.do`), con la respuesta a su
 * buzón, porque lo que se busca es una conversación, no una notificación.
 * Quién, cuándo y qué se dice: `lib/seguimiento/altas.ts`.
 *
 * `?ensayo=1` devuelve a quién le escribiría sin enviar nada ni apuntar nada.
 *
 * Idempotente: cada envío se apunta en `audit_logs` (`SEGUIMIENTO_ALTA`) ANTES
 * de pasar al siguiente, y nadie con ese apunte vuelve a recibir otro. Si el
 * envío falla, no se apunta: se reintenta en la pasada siguiente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { auditLogs } from '@/lib/db/schema';
import { resend } from '@/lib/email';
import { baseDeEnlaces } from '@/lib/config/enlaces';
import { crearEnlaceDeVerificacion } from '@/lib/auth/verificacion';
import {
  REMITENTE, RESPONDER_A, VENTANA_DIAS, aQuienEscribir, correoDeSeguimiento, type Candidato,
} from '@/lib/seguimiento/altas';

export const maxDuration = 60;

/** Tope por pasada: si un día entran muchos, que salgan repartidos por hora. */
const POR_PASADA = 25;

type Fila = {
  teamId: number; userId: number; email: string; nombre: string | null; empresa: string | null;
  registro: number; verificado: boolean; paso: number; completado: boolean; interno: boolean; yaContactado: boolean;
};

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const ensayo = req.nextUrl.searchParams.get('ensayo') === '1';
  const desde = new Date(Date.now() - (VENTANA_DIAS + 1) * 86_400_000);

  // Quien FUNDÓ una empresa (SIGN_UP con CREATE_TEAM del mismo usuario; los
  // invitados no tienen el segundo) en los últimos días.
  const filas = (await db.execute<Fila>(sql`
    select t.id as "teamId", u.id as "userId", u.email, u.name as nombre,
           coalesce(nullif(t.nombre_comercial, ''), nullif(t.razon_social, '')) as empresa,
           -- En segundos: la columna es un timestamp sin zona guardado en UTC,
           -- y así no depende de cómo cada lado lea un texto de fecha.
           extract(epoch from min(a.timestamp))::float8 as registro,
           u.email_verified as verificado, t.onboarding_paso as paso,
           (t.onboarding_completado_en is not null) as completado,
           (u.platform_role = 'admin') as interno,
           exists (select 1 from audit_logs l where l.team_id = t.id and l.action = 'SEGUIMIENTO_ALTA') as "yaContactado"
    from activity_logs a
    join teams t on t.id = a.team_id
    join users u on u.id = a.user_id
    where a.action = 'SIGN_UP'
      and a.timestamp >= ${desde}
      and u.deleted_at is null
      and exists (select 1 from activity_logs c
                  where c.team_id = a.team_id and c.user_id = a.user_id and c.action = 'CREATE_TEAM')
    group by t.id, u.id
  `)) as unknown as Fila[];

  const candidatos: Candidato[] = filas.map((f) => ({
    teamId: f.teamId, userId: f.userId, email: f.email, nombre: f.nombre, empresa: f.empresa,
    registro: new Date(Number(f.registro) * 1000), verificado: !!f.verificado, paso: Number(f.paso ?? 1),
    completado: !!f.completado, interno: !!f.interno, yaContactado: !!f.yaContactado,
  }));
  const toca = aQuienEscribir(candidatos, new Date()).slice(0, POR_PASADA);

  if (ensayo) {
    return NextResponse.json({
      ok: true, ensayo: true, revisados: candidatos.length,
      escribiria: toca.map(({ candidato, etapa }) => ({ teamId: candidato.teamId, etapa, registro: candidato.registro })),
    });
  }

  const enlaceEntrar = `${baseDeEnlaces()}/sign-in`;
  let enviados = 0;
  const errores: { teamId: number; error: string }[] = [];

  for (const { candidato: c, etapa } of toca) {
    try {
      const enlaceVerificar = etapa === 'sin-verificar' ? await crearEnlaceDeVerificacion(c.userId) : undefined;
      const { asunto, texto } = correoDeSeguimiento(etapa, {
        nombre: c.nombre, empresa: c.empresa, enlaceVerificar, enlaceEntrar,
      });
      const res = await resend.emails.send({
        from: REMITENTE, to: c.email, replyTo: RESPONDER_A, subject: asunto, text: texto,
      });
      if (res.error) throw new Error(JSON.stringify(res.error));
      await db.insert(auditLogs).values({
        teamId: c.teamId, userId: c.userId, actor: 'system', action: 'SEGUIMIENTO_ALTA',
        resource: etapa, metadata: JSON.stringify({ resendId: res.data?.id ?? null, asunto }),
      });
      enviados++;
    } catch (e) {
      console.error('[seguimiento-altas] no salió el correo del team', c.teamId, e);
      errores.push({ teamId: c.teamId, error: e instanceof Error ? e.message.slice(0, 200) : 'error' });
    }
  }

  return NextResponse.json({ ok: true, revisados: candidatos.length, enviados, errores });
}
