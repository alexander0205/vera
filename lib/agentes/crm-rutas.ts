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

/** El MCP público del sitio: solo lectura, sin clave y sin datos de clientes. */
export const RUTA_MCP_PUBLICO = '/api/mcp-publico';

/** Todo el texto del CRM en un archivo, para quien lo lee con un modelo. */
export const RUTA_LLMS_FULL = '/llms-full.txt';

/** Se cambia al tocar los textos de `crm.ts`: es la fecha que se ve en cada página. */
export const CRM_ACTUALIZADA = '2026-11-03';

/**
 * Las cuatro partes en que se agrupan las páginas. Preguntas frecuentes queda
 * fuera de las tres: no es una parte del producto.
 */
export const CATEGORIAS_CRM = [
  { clave: 'atencion', nombre: 'Atención', resumen: 'Por dónde te escribe la gente y cómo se le contesta.' },
  { clave: 'ventas', nombre: 'Ventas', resumen: 'Cómo se capta, se sigue y se cierra cada oportunidad.' },
  { clave: 'operacion', nombre: 'Operación', resumen: 'Cómo trabaja tu equipo cada conversación y cada solicitud.' },
  { clave: 'plataforma', nombre: 'Plataforma', resumen: 'Cómo se administra, se conecta, se protege y se mantiene en pie.' },
] as const;

export type ClaveCategoriaCrm = (typeof CATEGORIAS_CRM)[number]['clave'];

/** En el orden en que se muestran: por categoría, y preguntas al final. */
export const PAGINAS_CRM = [
  { clave: 'chatbot-whatsapp', categoria: 'atencion', ruta: `${RUTA_CRM}/chatbot-whatsapp`, menu: 'Chatbot y WhatsApp', resumen: 'Conversación abierta o guiada, en cada canal.' },
  { clave: 'chat-web', categoria: 'atencion', ruta: `${RUTA_CRM}/chat-web`, menu: 'Chat web', resumen: 'Una ventana en tu página, con tu marca y tu horario.' },
  { clave: 'documentos', categoria: 'atencion', ruta: `${RUTA_CRM}/documentos`, menu: 'Documentos y OCR', resumen: 'Recibe, lee y revisa documentos, y responde desde los tuyos.' },
  { clave: 'idiomas', categoria: 'atencion', ruta: `${RUTA_CRM}/idiomas`, menu: 'Idiomas y accesibilidad', resumen: 'Responde en el idioma de quien escribe y se usa con teclado.' },
  { clave: 'pipeline', categoria: 'ventas', ruta: `${RUTA_CRM}/pipeline`, menu: 'Pipeline de oportunidades', resumen: 'Etapas, tarjetas que se arrastran, tareas y ganados.' },
  { clave: 'contactos', categoria: 'ventas', ruta: `${RUTA_CRM}/contactos`, menu: 'Contactos y prospectos', resumen: 'Ficha con su fuente, notas, llamadas, importar y exportar.' },
  { clave: 'captacion', categoria: 'ventas', ruta: `${RUTA_CRM}/captacion`, menu: 'Captación de clientes', resumen: 'Formularios, anuncios de Meta y reservas que entran solos.' },
  { clave: 'automatizaciones', categoria: 'ventas', ruta: `${RUTA_CRM}/automatizaciones`, menu: 'Seguimiento automático', resumen: 'Mensajes por etapa, plantillas, envíos masivos y recordatorios.' },
  { clave: 'bandeja', categoria: 'operacion', ruta: `${RUTA_CRM}/bandeja`, menu: 'Bandeja de asesores', resumen: 'Reparto, prioridad, plantillas y ayuda de la IA.' },
  { clave: 'supervision', categoria: 'operacion', ruta: `${RUTA_CRM}/supervision`, menu: 'Supervisión', resumen: 'Indicadores, tiempos de atención y monitoreo en vivo.' },
  { clave: 'seguimiento', categoria: 'operacion', ruta: `${RUTA_CRM}/seguimiento`, menu: 'Solicitudes y seguimiento', resumen: 'Número propio, consulta segura del estado y avisos de cada cambio.' },
  { clave: 'citas', categoria: 'operacion', ruta: `${RUTA_CRM}/citas`, menu: 'Citas y agenda', resumen: 'Horarios libres, registro y confirmación dentro de la conversación.' },
  { clave: 'encuestas', categoria: 'operacion', ruta: `${RUTA_CRM}/encuestas`, menu: 'Encuestas y cierre', resumen: 'Cierre confirmado, satisfacción con botones y comentario.' },
  { clave: 'reportes', categoria: 'operacion', ruta: `${RUTA_CRM}/reportes`, menu: 'Reportes y trazabilidad', resumen: 'Paneles con filtros, exportación y bitácora de todo.' },
  { clave: 'administracion', categoria: 'plataforma', ruta: `${RUTA_CRM}/administracion`, menu: 'Administración', resumen: 'Flujos, reglas, horarios y permisos, sin programar.' },
  { clave: 'integraciones', categoria: 'plataforma', ruta: `${RUTA_CRM}/integraciones`, menu: 'Integraciones', resumen: 'Catálogo de sistemas con los que se conecta al implementar.' },
  { clave: 'seguridad', categoria: 'plataforma', ruta: `${RUTA_CRM}/seguridad`, menu: 'Seguridad y privacidad', resumen: 'Cifrado, acceso, bitácora y qué pasa con los datos personales.' },
  { clave: 'disponibilidad', categoria: 'plataforma', ruta: `${RUTA_CRM}/disponibilidad`, menu: 'Disponibilidad', resumen: 'Lo que se mide en público y lo que se pacta por contrato.' },
  { clave: 'preguntas', categoria: null, ruta: `${RUTA_CRM}/preguntas`, menu: 'Preguntas frecuentes', resumen: 'Las dudas directas, con respuesta directa.' },
] as const;

export type PaginaCrm = (typeof PAGINAS_CRM)[number];

/** Las páginas de cada categoría, en orden. Lo usan el menú, el pie, las tarjetas y los textos para IA. */
export function paginasPorCategoria() {
  return CATEGORIAS_CRM.map(c => ({ ...c, paginas: PAGINAS_CRM.filter(p => p.categoria === c.clave) }));
}

/** Las páginas que no son de ninguna categoría: hoy, preguntas frecuentes. */
export const PAGINAS_SIN_CATEGORIA = PAGINAS_CRM.filter(p => p.categoria === null);

export type ClaveCrm = (typeof PAGINAS_CRM)[number]['clave'];

/** La entrada de una subpágina. Existe siempre: la clave solo admite las de la lista. */
export function paginaCrm(clave: ClaveCrm) {
  return PAGINAS_CRM.find(p => p.clave === clave)!;
}
