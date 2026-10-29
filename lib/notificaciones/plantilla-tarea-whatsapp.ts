/**
 * La plantilla de WhatsApp con que Zero avisa de una tarea, y sus parámetros.
 *
 * WhatsApp no deja escribirle a alguien que no nos escribió en las últimas 24
 * horas salvo con una plantilla APROBADA por Meta (regla de la casa: sin
 * plantilla aprobada, el canal se apaga; nunca texto libre). Esta es esa
 * plantilla: una sola para todos los cambios de una tarea, con lo que pasó como
 * variable, para no esperar una aprobación por cada caso.
 *
 * Sale por el número de Zero (`CRM_ZERO_API_KEY`), no por el del colegio: quien
 * avisa es el Departamento de IT de Zero. Se publica desde Admin › WhatsApp ›
 * Plantillas; mientras Meta no la apruebe, `avisarTareaPorWhatsApp` no manda
 * nada. Puro: lo prueban los tests y lo lee la pantalla de admin.
 */

import type { CambioTarea } from './texto';

export const PLANTILLA_TAREA_WHATSAPP = {
  nombre: 'zero_tarea_novedad',
  idioma: 'es',
  categoria: 'utility' as const,
  cuerpo: 'Hola {{1}}, hay una novedad en una tarea de {{2}} en Zero.\n\n'
    + '{{3}}\nTarea: {{4}}\n\n'
    + 'Ábrela aquí para ver los detalles y responder: {{5}}\n\n'
    + 'Este número solo envía avisos. Responde dentro de Zero.',
  pie: 'Departamento de IT · Zero',
  variables: [
    { pos: 1, nombre: 'nombre', tipo: 'texto', ejemplo: 'Lizandro' },
    { pos: 2, nombre: 'colegio', tipo: 'texto', ejemplo: 'Infantil Mi Casita II' },
    { pos: 3, nombre: 'que_paso', tipo: 'texto', ejemplo: 'El Departamento de IT respondió' },
    { pos: 4, nombre: 'tarea', tipo: 'texto', ejemplo: 'Cómo inactivar un estudiante' },
    { pos: 5, nombre: 'enlace', tipo: 'url', ejemplo: 'https://app.zero.com.do/escolar/por-revisar?tarea=8' },
  ],
};

const QUE_PASO: Record<CambioTarea, (autor: string) => string> = {
  creada: (a) => `${a} te asignó una tarea`,
  mensaje: (a) => `${a} respondió`,
  adjunto: (a) => `${a} subió un archivo`,
  revision: () => 'La tarea quedó en revisión: revísala y confírmanos',
  completada: () => 'La tarea se completó',
  reabierta: () => 'La tarea se volvió a abrir',
  urgente: () => 'URGENTE: la tarea lleva 24 horas sin respuesta',
};

/**
 * Meta rechaza un parámetro con saltos de línea, tabuladores o más de cuatro
 * espacios seguidos, y uno vacío. Se limpia y se recorta.
 */
export function limpiarParametro(v: string | null | undefined, tope = 200): string {
  const t = (v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (!t) return '-';
  return t.length > tope ? `${t.slice(0, tope - 1).trimEnd()}…` : t;
}

/** Los cinco parámetros, en el orden de la plantilla. */
export function parametrosTareaWhatsApp(d: {
  nombre: string | null; colegio: string; cambio: CambioTarea; autor: string; titulo: string; url: string;
}): string[] {
  return [
    limpiarParametro(d.nombre ?? 'equipo', 60),
    limpiarParametro(d.colegio, 80),
    limpiarParametro(QUE_PASO[d.cambio](d.autor), 120),
    limpiarParametro(d.titulo, 120),
    limpiarParametro(d.url, 300),
  ];
}
