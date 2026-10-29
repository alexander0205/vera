/**
 * Las tareas por revisar en Slack: cada cambio (creada, respuesta, archivo,
 * en revisión, completada, abierta de nuevo) llega al canal del equipo de Zero,
 * de todos los colegios, para que nada se quede esperando a que alguien entre
 * a «Por revisar».
 *
 * Va al canal de soporte (`SUPPORT_SLACK_WEBHOOK_URL`, el de los tickets) salvo
 * que `ESCOLAR_TAREAS_SLACK_WEBHOOK_URL` diga otro. Solo sale desde producción:
 * quien llama lo decide (ver `avisarDeTarea`). Nunca lanza.
 */

import { enviarAlertaSlackBlocks } from '@/lib/slack';
import { urlDeTarea } from '@/lib/email/escolar-tareas';
import { DE_COLEGIO, ETIQUETA_ESTADO, type AvisoTarea, type EstadoTarea } from './tareas-reglas';

export interface DatosSlackTarea {
  aviso: AvisoTarea;
  colegio: string;
  tareaId: number;
  titulo: string;
  de: string;
  asignada: string;
  estado: EstadoTarea;
  autor: string;
  /** Lo que se escribió, o el nombre del archivo. */
  texto: string | null;
  documento: string | null;
}

/** Slack interpreta `&`, `<` y `>`: se escapan para que un texto no arme enlaces ni menciones. */
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

const QUE_PASO: Record<AvisoTarea, { icono: string; verbo: string }> = {
  creada: { icono: '🆕', verbo: 'creó una tarea' },
  mensaje: { icono: '💬', verbo: 'respondió' },
  adjunto: { icono: '📎', verbo: 'subió un archivo' },
  revision: { icono: '🔎', verbo: 'pasó a revisión' },
  completada: { icono: '✅', verbo: 'completó' },
  reabierta: { icono: '↩️', verbo: 'volvió a abrir' },
  urgente: { icono: '🚨', verbo: 'avisa: 24 horas sin respuesta en' },
};

export function armarSlackTarea(d: DatosSlackTarea): { blocks: object[]; texto: string } {
  const { icono, verbo } = QUE_PASO[d.aviso];
  const titulo = escapar(recortar(d.titulo, 140));
  const meta = [
    d.de === DE_COLEGIO ? d.de : `De: ${d.de}`, `Asignada a ${d.asignada}`, ETIQUETA_ESTADO[d.estado],
    ...(d.documento ? [d.documento] : []),
  ].map(escapar).join(' · ');
  const cuerpo = d.texto ? (d.aviso === 'adjunto' ? `📎 ${d.texto}` : d.texto) : null;

  const blocks: object[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `${icono} *${escapar(d.colegio)}* · ${escapar(d.autor)} ${verbo}\n*<${urlDeTarea(d.tareaId)}|#${d.tareaId} ${titulo}>*` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: meta }] },
  ];
  if (cuerpo) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: escapar(recortar(cuerpo, 1500)).replace(/^/gm, '>') } });
  blocks.push({ type: 'actions', elements: [
    { type: 'button', text: { type: 'plain_text', text: 'Abrir la tarea', emoji: true }, url: urlDeTarea(d.tareaId), style: 'primary' },
  ] });

  return { blocks, texto: `${d.colegio} · ${d.autor} ${verbo}: ${recortar(d.titulo, 90)}` };
}

export async function avisarTareaEnSlack(d: DatosSlackTarea): Promise<void> {
  try {
    const { blocks, texto } = armarSlackTarea(d);
    await enviarAlertaSlackBlocks(blocks, texto,
      process.env.ESCOLAR_TAREAS_SLACK_WEBHOOK_URL || process.env.SUPPORT_SLACK_WEBHOOK_URL);
  } catch (err) {
    console.error('[tareas] no salió el aviso a Slack', d.tareaId, d.aviso, err instanceof Error ? err.message : err);
  }
}
