/**
 * El texto de lo que le llega al equipo de Zero en la campana del panel cuando
 * algo pasa en una tarea de un colegio. Puro y sin base de datos.
 *
 * Es otro texto que el de `notificacionDeTarea` (el del colegio): aquel habla a
 * UNA persona («Soporte IT · Zero te asignó una tarea»), este habla al equipo y
 * tiene que decir DE QUÉ COLEGIO es, porque en el panel se mezclan todos. Y el
 * enlace no abre «Por revisar» del colegio sino la tarea en `/admin/tareas`.
 *
 * Esto es campana y push. Las tareas NUNCA salen por WhatsApp: no hay aquí, ni
 * en quien llama a esto, ningún camino hacia allá.
 */

import type { DatosTarea } from './texto';
import { HORAS_ALERTA } from '@/lib/administracion-escolar/tareas-reglas';

const HIZO: Record<DatosTarea['cambio'], string> = {
  creada: 'creó una tarea para Soporte',
  mensaje: 'escribió',
  adjunto: 'subió un archivo',
  en_proceso: 'tomó la tarea',
  revision: 'pasó a revisión',
  completada: 'completó',
  reabierta: 'volvió a abrir',
  urgente: '',
};

/** La tarea en el panel del equipo de Zero. */
export const enlaceDeTareaEnPanel = (id: number) => `/admin/tareas?tarea=${id}`;

export function notificacionDeTareaParaZero(d: DatosTarea, colegio: string | null): { titulo: string; detalle: string; enlace: string } {
  const texto = d.texto?.trim() ? (d.cambio === 'adjunto' ? `📎 ${d.texto.trim()}` : d.texto.trim()) : null;
  const cuerpo = texto ? `${d.titulo}: ${texto}` : d.titulo;
  const detalle = [colegio?.trim(), cuerpo].filter(Boolean).join(' · ');
  return {
    titulo: (d.cambio === 'urgente' ? `URGENTE: ${HORAS_ALERTA} horas sin respuesta` : `${d.autor} ${HIZO[d.cambio]}`).slice(0, 160),
    detalle: detalle.length > 280 ? `${detalle.slice(0, 279).trimEnd()}…` : detalle,
    enlace: enlaceDeTareaEnPanel(d.tareaId),
  };
}
