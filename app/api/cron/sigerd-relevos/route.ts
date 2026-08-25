/**
 * Vigilancia de los relés de SIGERD.
 *
 * Los relés son máquinas en casas de República Dominicana: se duerme la
 * laptop, se va la luz, se cae el internet del barrio. El cliente releva solo
 * (lib/sigerd/relevo.ts), así que una caída no se nota — y ese es justamente
 * el problema: sin esto, el colegio descubre que no quedaba ninguno el día que
 * intenta sincronizar, no el día que se cayó el primero.
 *
 * Qué comprueba, y por qué desde aquí: se pregunta el `/salud` de cada relé
 * DESDE VERCEL, que es el único camino que importa. Un relé puede estar
 * perfecto en su casa y ser inalcanzable porque el túnel se murió; probarlo
 * desde la máquina misma no lo detectaría.
 *
 * Un relé cuenta como sano solo si contesta 200 Y dice salir por una IP
 * dominicana. Si sale por otro país el portal no le va a contestar, y el
 * síntoma sería idéntico a «SIGERD está caído».
 *
 * Cuándo avisa:
 *   - NINGUNO sano  → correo y Slack en cada pasada. Es una caída, y repetir
 *     el aviso mientras dure es lo correcto.
 *   - ALGUNO caído pero queda otro → una vez cada 12 h. Relevar ya funcionó y
 *     nadie tiene que levantarse de noche por una máquina de respaldo, pero
 *     tampoco puede quedarse callado semanas hasta que caiga la última.
 *
 * El antirruido se apoya en `system_logs`: se busca si ya se avisó lo mismo
 * hace poco. Sin tabla nueva y sobrevive a los reinicios, que es más de lo que
 * daría una variable en memoria.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { systemLogs } from '@/lib/db/schema';
import { logError, logWarn } from '@/lib/logger';
import { enviarAlertaEmail } from '@/lib/email';
import { enviarAlertaSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FUENTE = 'cron/sigerd-relevos';
const HORAS_ENTRE_AVISOS_DEGRADADO = 12;
const TIMEOUT_MS = 10_000;

type Revision = {
  base: string;
  sano: boolean;
  ms: number;
  detalle: string;
};

function configuradas(): string[] {
  return (process.env.SIGERD_RELAYS ?? process.env.SIGERD_BASE_URL ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s && !s.includes('sigerd.minerd.gob.do'));
}

async function revisar(base: string): Promise<Revision> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const clave = process.env.SIGERD_RELAY_KEY ?? '';
    const r = await fetch(`${base}/salud`, {
      headers: clave ? { 'X-Relay-Key': clave } : {},
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const ms = Date.now() - t0;
    if (!r.ok) return { base, sano: false, ms, detalle: `respondió HTTP ${r.status}` };

    const j = (await r.json()) as { pais?: string; ip?: string; proveedor?: string };
    if (j.pais !== 'DO') {
      return { base, sano: false, ms, detalle: `sale por ${j.pais ?? 'país desconocido'} — el portal no le contesta` };
    }
    return { base, sano: true, ms, detalle: `${j.ip ?? '?'} · ${j.proveedor ?? 'proveedor desconocido'}` };
  } catch (e) {
    const agotado = e instanceof Error && e.name === 'AbortError';
    return {
      base,
      sano: false,
      ms: Date.now() - t0,
      detalle: agotado ? `no respondió en ${TIMEOUT_MS / 1000}s` : `no se pudo contactar (${e instanceof Error ? e.message : String(e)})`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** ¿Ya avisamos algo de este tipo hace poco? Evita repetir la degradación. */
async function avisadoHaceMenosDe(horas: number, marca: string): Promise<boolean> {
  const desde = new Date(Date.now() - horas * 3_600_000);
  const [fila] = await db
    .select({ id: systemLogs.id })
    .from(systemLogs)
    .where(and(eq(systemLogs.source, FUENTE), eq(systemLogs.message, marca), gt(systemLogs.createdAt, desde)))
    .orderBy(desc(systemLogs.id))
    .limit(1);
  return Boolean(fila);
}

/** ¿Hay por dónde avisar? Sin esto, una caída pasa en silencio. */
function hayCanalDeAviso(): boolean {
  const correo = (process.env.ALERTAS_EMAIL ?? process.env.HABILITACION_ALERT_EMAIL ?? '').trim();
  return Boolean(correo || process.env.SLACK_WEBHOOK_URL);
}

function informe(revisiones: Revision[]): string {
  return revisiones
    .map((r) => `${r.sano ? '✓' : '✗'}  ${r.base}  (${r.ms}ms)  ${r.detalle}`)
    .join('\n');
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const bases = configuradas();

  // Sin relés no hay nada que vigilar. No es un fallo: es una instalación que
  // todavía sale directo al portal (solo sirve desde el país).
  if (bases.length === 0) {
    return NextResponse.json({ ok: true, revisados: 0, nota: 'sin relés configurados' });
  }

  const revisiones = await Promise.all(bases.map(revisar));
  const sanos = revisiones.filter((r) => r.sano);
  const caidos = revisiones.filter((r) => !r.sano);
  const detalle = informe(revisiones);

  // ── Ninguno sano: SIGERD está caído para todos los colegios ──────────
  if (sanos.length === 0) {
    const asunto = `SIGERD sin salida: ${caidos.length} de ${bases.length} relés caídos`;
    await logError({ source: FUENTE, message: 'sin-relevos', details: detalle });
    await enviarAlertaEmail(
      asunto,
      `Ningún relé de SIGERD responde. Mientras dure, ningún colegio puede sincronizar ni consultar el portal.\n\n${detalle}\n\n` +
        `Qué mirar, en orden:\n` +
        `  1. ¿La máquina está encendida y despierta?\n` +
        `  2. ¿El túnel está corriendo? (cloudflared como servicio, no en una terminal)\n` +
        `  3. ~/Library/Logs/sigerd-rele.log en la máquina\n` +
        `  4. ¿Cambió SIGERD_RELAY_KEY en Vercel y no en las máquinas?`,
    );
    await enviarAlertaSlack(`:rotating_light: *SIGERD sin salida* — ningún relé responde\n\`\`\`${detalle}\`\`\``);

    // Si no hay por dónde avisar, la caída pasa en silencio y nos enteramos
    // cuando un colegio llama. Queda escrito para que se vea en la bitácora,
    // y la ruta responde 503 para que el fallo del cron salte en Vercel.
    if (!hayCanalDeAviso()) {
      await logError({
        source: FUENTE,
        message: 'sin-canal-de-aviso',
        details: 'SIGERD está caído y no hay ALERTAS_EMAIL ni SLACK_WEBHOOK_URL configurados.',
      });
      return NextResponse.json(
        { ok: false, sanos: 0, caidos: caidos.length, revisiones, error: 'sin canal de aviso configurado' },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: false, sanos: 0, caidos: caidos.length, revisiones });
  }

  // ── Degradado: releva solo, pero se quedó sin respaldo ───────────────
  if (caidos.length > 0) {
    const marca = `degradado:${caidos.map((c) => c.base).sort().join(',')}`;

    // Se pregunta ANTES de escribir: si se escribe primero, la consulta
    // encuentra la fila recién puesta y el aviso no sale nunca.
    const yaAvisado = await avisadoHaceMenosDe(HORAS_ENTRE_AVISOS_DEGRADADO, marca);
    await logWarn({ source: FUENTE, message: marca, details: detalle });

    if (!yaAvisado) {
      await enviarAlertaEmail(
        `SIGERD degradado: ${caidos.length} de ${bases.length} relés caídos`,
        `SIGERD sigue funcionando —el tráfico salió por los que quedan— pero hay máquinas fuera.\n\n${detalle}\n\n` +
          `Sin urgencia, pero conviene levantarlas antes de quedarse con una sola.\n` +
          `Este aviso se repite como mucho cada ${HORAS_ENTRE_AVISOS_DEGRADADO} horas mientras siga igual.`,
      );
      await enviarAlertaSlack(
        `:warning: *SIGERD degradado* — ${caidos.length} de ${bases.length} relés caídos, ` +
          `sigue funcionando por los que quedan\n\`\`\`${detalle}\`\`\``,
      );
    }
    return NextResponse.json({ ok: true, sanos: sanos.length, caidos: caidos.length, revisiones });
  }

  // ── Todo bien ────────────────────────────────────────────────────────
  // A propósito no se escribe nada: son 48 pasadas al día y llenar `system_logs`
  // de «todo bien» solo entierra las que sí importan. La respuesta ya queda en
  // el log de la función.
  return NextResponse.json({ ok: true, sanos: sanos.length, caidos: 0, revisiones });
}
