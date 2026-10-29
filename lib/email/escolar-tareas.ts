/**
 * El correo de una tarea por revisar: que se la asignaron a alguien, que le
 * respondieron, que se completó o que se volvió a abrir.
 *
 * Va al personal del colegio y a Soporte IT, nunca a las familias. A quién lo
 * decide `aQuienAvisar` (lib/administracion-escolar/tareas-reglas.ts); esto
 * solo lo pinta, con la misma plantilla que los demás correos del colegio: un
 * título, la tarea en un recuadro, un botón.
 *
 * El correo no se responde: la conversación vive en la tarea. Por eso el botón
 * lleva a ella y el pie lo dice.
 */

import { resend, assertSent } from '@/lib/email';
import { baseDeEnlaces } from '@/lib/config/enlaces';
import { DE_COLEGIO, type AvisoTarea } from '@/lib/administracion-escolar/tareas-reglas';

const DE = 'Zero <noreply@zero.com.do>';
const AZUL = '#2a45c4';

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export interface DatosAvisoTarea {
  aviso: AvisoTarea;
  colegio: string;
  tareaId: number;
  titulo: string;
  /** El alumno, o «Toda la familia». */
  de: string;
  asignada: string;
  /** Quien hizo el cambio, como firma en la conversación. */
  autor: string;
  /** Lo que se escribió: la descripción al crearla, o la respuesta. */
  texto: string | null;
  documento: string | null;
}

export interface CorreoTarea { asunto: string; html: string; texto: string }

/** El enlace que abre la tarea. Sirve para cualquier tarea, de un alumno o de una familia. */
export const urlDeTarea = (id: number) => `${baseDeEnlaces()}/escolar/por-revisar?tarea=${id}`;

const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function redactar(d: DatosAvisoTarea): { asunto: string; intro: string } {
  const t = recortar(d.titulo, 90);
  switch (d.aviso) {
    case 'creada':
      return { asunto: `Tarea por revisar: ${t}`, intro: `${d.autor} creó una tarea para ${d.asignada} en ${d.colegio}.` };
    case 'mensaje':
      return { asunto: `${d.autor} respondió: ${t}`, intro: `${d.autor} escribió en una tarea de ${d.colegio}.` };
    case 'completada':
      return { asunto: `Completada: ${t}`, intro: `${d.autor} marcó como completada una tarea de ${d.colegio}.` };
    case 'reabierta':
      return { asunto: `Abierta de nuevo: ${t}`, intro: `${d.autor} volvió a abrir una tarea de ${d.colegio}.` };
    case 'revision':
      return { asunto: `En revisión: ${t}`, intro: `${d.autor} pasó a revisión una tarea de ${d.colegio}.` };
    case 'adjunto':
      return { asunto: `${d.autor} subió un archivo: ${t}`, intro: `${d.autor} subió un archivo a una tarea de ${d.colegio}.` };
  }
}

const PIE = 'Este correo no se responde: escribe en la tarea y la respuesta le llega a los demás. '
  + 'Te llega porque la tarea es tuya o participas en ella.';

/** El correo ya armado, sin enviarlo. Lo usan las pruebas para ver qué saldría. */
export function armarCorreoTarea(d: DatosAvisoTarea): CorreoTarea {
  const { asunto, intro } = redactar(d);
  const url = urlDeTarea(d.tareaId);
  // «Del colegio» ya se lee solo; «De: Del colegio» no.
  const meta = [d.de === DE_COLEGIO ? d.de : `De: ${d.de}`, `Asignada a ${d.asignada}`, ...(d.documento ? [d.documento] : [])].join(' · ');
  const texto = d.texto ? recortar(d.aviso === 'adjunto' ? `📎 ${d.texto}` : d.texto, 1200) : null;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
      <p style="margin: 0 0 16px; line-height: 1.6;">${escapeHtml(intro)}</p>
      <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin: 0 0 20px;">
        <p style="margin: 0 0 4px; font-size: 16px; font-weight: 700; color: #111827;">${escapeHtml(d.titulo)}</p>
        <p style="margin: 0; font-size: 13px; color: #6b7280;">${escapeHtml(meta)}</p>
        ${texto ? `<p style="margin: 12px 0 0; padding: 10px 12px; background: #f9fafb; border-radius: 8px; font-size: 14px; line-height: 1.6; white-space: pre-wrap;"><strong>${escapeHtml(d.autor)}:</strong> ${escapeHtml(texto)}</p>` : ''}
      </div>
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(url)}"
           style="background:${AZUL};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
          Abrir la tarea
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">${escapeHtml(PIE)}</p>
    </div>
  `;

  const plano = [
    intro,
    [d.titulo, meta].join('\n'),
    ...(texto ? [`${d.autor}: ${texto}`] : []),
    `Abrir la tarea: ${url}`,
    PIE,
  ].join('\n\n');

  return { asunto, html, texto: plano };
}

/** Manda el aviso a UNA persona. Lanza si Resend rechaza el envío. */
export async function enviarAvisoTarea(email: string, correo: CorreoTarea): Promise<void> {
  const res = await resend.emails.send({
    from: DE, to: email, subject: correo.asunto, html: correo.html, text: correo.texto,
  });
  assertSent(res, 'enviarAvisoTarea');
}

/**
 * Lo que Zero AI abrió en una revisión, en un solo correo: con nueve tareas
 * nuevas, nueve correos se leen como spam y se dejan de abrir.
 */
export function armarCorreoResumenIa(d: { colegio: string; tareas: { id: number; titulo: string }[] }): CorreoTarea {
  const n = d.tareas.length;
  const asunto = n === 1
    ? `Zero AI encontró algo por revisar: ${recortar(d.tareas[0].titulo, 80)}`
    : `Zero AI encontró ${n} cosas por revisar en ${d.colegio}`;
  const intro = `Zero AI revisó los cargos y las facturas de ${d.colegio} y abrió ${n === 1 ? 'una tarea' : `${n} tareas`} `
    + 'para que alguien decida qué se hace.';
  const url = `${baseDeEnlaces()}/escolar/por-revisar`;
  const lista = d.tareas.slice(0, 15);
  const resto = n - lista.length;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
      <p style="margin: 0 0 16px; line-height: 1.6;">${escapeHtml(intro)}</p>
      <ul style="margin: 0 0 20px; padding-left: 18px; line-height: 1.7; font-size: 14px;">
        ${lista.map((t) => `<li><a href="${escapeHtml(urlDeTarea(t.id))}" style="color:${AZUL};">${escapeHtml(t.titulo)}</a></li>`).join('')}
        ${resto > 0 ? `<li>y ${resto} más</li>` : ''}
      </ul>
      <p style="margin: 0 0 20px;">
        <a href="${escapeHtml(url)}"
           style="background:${AZUL};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
          Ver lo que hay por revisar
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">${escapeHtml(PIE)}</p>
    </div>
  `;
  const plano = [
    intro,
    [...lista.map((t) => `- ${t.titulo}: ${urlDeTarea(t.id)}`), ...(resto > 0 ? [`- y ${resto} más`] : [])].join('\n'),
    `Ver lo que hay por revisar: ${url}`,
    PIE,
  ].join('\n\n');
  return { asunto, html, texto: plano };
}
