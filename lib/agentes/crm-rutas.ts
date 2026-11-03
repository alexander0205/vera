/**
 * Las páginas de Zero CRM: dónde viven y cómo se llaman en los menús.
 *
 * Va aparte del contenido (`lib/agentes/crm.ts`) porque esto lo usa también la
 * cabecera, que es de cliente: importar los textos desde ahí los metería enteros
 * en el JavaScript de todas las páginas del sitio.
 *
 * De esta lista salen el menú, la navegación del CRM, el pie, el sitemap y
 * `llms.txt`. Una subpágina nueva se agrega aquí y aparece en todos a la vez.
 */

export const RUTA_CRM = '/productos/crm';
export const RUTA_CRM_MD = '/productos/crm.md';

/** Se cambia al tocar los textos de `crm.ts`: es la fecha que se ve en cada página. */
export const CRM_ACTUALIZADA = '2026-11-03';

export const PAGINAS_CRM = [
  { clave: 'chatbot-whatsapp', ruta: `${RUTA_CRM}/chatbot-whatsapp`, menu: 'Chatbot y WhatsApp', resumen: 'Conversación abierta o guiada, en cada canal.' },
  { clave: 'chat-web', ruta: `${RUTA_CRM}/chat-web`, menu: 'Chat web', resumen: 'Una ventana en tu página, con tu marca y tu horario.' },
  { clave: 'documentos', ruta: `${RUTA_CRM}/documentos`, menu: 'Documentos y OCR', resumen: 'Recibe, lee y revisa documentos, y responde desde los tuyos.' },
  { clave: 'seguimiento', ruta: `${RUTA_CRM}/seguimiento`, menu: 'Solicitudes y seguimiento', resumen: 'Número propio, consulta segura del estado y avisos de cada cambio.' },
  { clave: 'citas', ruta: `${RUTA_CRM}/citas`, menu: 'Citas y agenda', resumen: 'Horarios libres, registro y confirmación dentro de la conversación.' },
  { clave: 'encuestas', ruta: `${RUTA_CRM}/encuestas`, menu: 'Encuestas y cierre', resumen: 'Cierre confirmado, satisfacción con botones y comentario.' },
  { clave: 'bandeja', ruta: `${RUTA_CRM}/bandeja`, menu: 'Bandeja de asesores', resumen: 'Reparto, prioridad, plantillas y ayuda de la IA.' },
  { clave: 'supervision', ruta: `${RUTA_CRM}/supervision`, menu: 'Supervisión', resumen: 'Indicadores, tiempos de atención y monitoreo en vivo.' },
  { clave: 'reportes', ruta: `${RUTA_CRM}/reportes`, menu: 'Reportes y trazabilidad', resumen: 'Paneles con filtros, exportación y bitácora de todo.' },
  { clave: 'administracion', ruta: `${RUTA_CRM}/administracion`, menu: 'Administración', resumen: 'Flujos, reglas, horarios y permisos, sin programar.' },
  { clave: 'idiomas', ruta: `${RUTA_CRM}/idiomas`, menu: 'Idiomas y accesibilidad', resumen: 'Responde en el idioma de quien escribe y se usa con teclado.' },
  { clave: 'integraciones', ruta: `${RUTA_CRM}/integraciones`, menu: 'Integraciones', resumen: 'API, webhooks y conectores que se enlazan al implementar.' },
  { clave: 'seguridad', ruta: `${RUTA_CRM}/seguridad`, menu: 'Seguridad y privacidad', resumen: 'Cifrado, acceso, bitácora y qué pasa con los datos personales.' },
  { clave: 'disponibilidad', ruta: `${RUTA_CRM}/disponibilidad`, menu: 'Disponibilidad', resumen: 'Lo que se mide en público y lo que se pacta por contrato.' },
  { clave: 'preguntas', ruta: `${RUTA_CRM}/preguntas`, menu: 'Preguntas frecuentes', resumen: 'Las dudas directas, con respuesta directa.' },
] as const;

export type ClaveCrm = (typeof PAGINAS_CRM)[number]['clave'];

/** La entrada de una subpágina. Existe siempre: la clave solo admite las de la lista. */
export function paginaCrm(clave: ClaveCrm) {
  return PAGINAS_CRM.find(p => p.clave === clave)!;
}
