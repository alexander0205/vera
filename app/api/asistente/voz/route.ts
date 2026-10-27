/**
 * Dictado del asistente: la persona habla y el texto cae en la caja del chat
 * para que lo revise antes de enviarlo.
 *
 *   GET  /api/asistente/voz            → { servidor } si hay Whisper aquí.
 *   POST /api/asistente/voz (audio)    → { texto }
 *
 * Whisper (large-v3-turbo) por Groq: su capa gratuita da horas de audio al
 * día, de sobra para dictar al chat, y entiende bien el español dominicano.
 * Sin `GROQ_API_KEY` el panel dicta con el reconocimiento de voz del propio
 * navegador (también gratis, sin pasar por aquí).
 *
 * El audio no se guarda: va a Groq, vuelve el texto y se descarta.
 */
import { NextRequest, NextResponse } from 'next/server';
import { evaluarAcceso, sinAcceso } from '@/lib/asistente/acceso';
import { rateLimitDb } from '@/lib/rate-limit';

export const maxDuration = 60;

const GROQ = 'https://api.groq.com/openai/v1/audio/transcriptions';
/** Unos 2 minutos de voz en webm/opus pesan mucho menos; esto frena un archivo cualquiera. */
const MAX_BYTES = 10 * 1024 * 1024;
/** Palabras de Zero que Whisper no conoce: con la pista las escribe bien. */
const VOCABULARIO = 'Zero, Gobernanza, SIGERD, matrícula, mensualidad, colegiatura, avance de anualidad, mora, NCF, e-CF, RNC, ITBIS, DGII, TSS, Talleres, paquete.';

export async function GET() {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);
  return NextResponse.json({ servidor: Boolean(process.env.GROQ_API_KEY) });
}

export async function POST(req: NextRequest) {
  const acceso = await evaluarAcceso();
  if (!acceso.ok) return sinAcceso(acceso);

  const llave = process.env.GROQ_API_KEY;
  if (!llave) return NextResponse.json({ error: 'El dictado del servidor no está configurado.', navegador: true }, { status: 501 });

  const limite = await rateLimitDb(`asistente_voz:${acceso.user.id}`, 60, 60 * 60_000);
  if (!limite.allowed) {
    return NextResponse.json({ error: 'Dictaste mucho en poco rato. Espera unos minutos o escribe la pregunta.' }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: 'No llegó el audio.' }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: 'El audio es muy largo: dicta en partes de menos de 2 minutos.' }, { status: 413 });

  const envio = new FormData();
  envio.append('file', audio, audio.type.includes('mp4') ? 'voz.mp4' : audio.type.includes('ogg') ? 'voz.ogg' : 'voz.webm');
  envio.append('model', 'whisper-large-v3-turbo');
  envio.append('language', 'es');
  envio.append('response_format', 'json');
  envio.append('temperature', '0');
  envio.append('prompt', VOCABULARIO);

  try {
    const r = await fetch(GROQ, {
      method: 'POST', headers: { Authorization: `Bearer ${llave}` }, body: envio, signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) {
      console.error('[asistente/voz] Groq respondió', r.status, (await r.text().catch(() => '')).slice(0, 200));
      return NextResponse.json({ error: 'No pude pasar el audio a texto ahora. Intenta otra vez o escribe.' }, { status: 502 });
    }
    const d = await r.json() as { text?: string };
    return NextResponse.json({ texto: String(d.text ?? '').trim() });
  } catch (e) {
    console.error('[asistente/voz] fallo:', e);
    return NextResponse.json({ error: 'No pude pasar el audio a texto ahora. Intenta otra vez o escribe.' }, { status: 502 });
  }
}
