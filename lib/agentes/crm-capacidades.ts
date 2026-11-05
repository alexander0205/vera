/**
 * Zero CRM en datos: el catálogo de funciones numerado y cada capacidad de las
 * subpáginas con su estado, su página y las funciones que cubre.
 *
 * De aquí salen `/productos/crm/capacidades.json` y el MCP público del sitio.
 * El texto de cada capacidad es el de `lib/agentes/crm.ts`: este archivo solo
 * agrega la numeración, para que nadie tenga que mantener dos listas.
 */

import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { CONTENIDO_CRM, ESTADOS, type EstadoCrm } from './crm';
import { CATEGORIAS_CRM, CRM_ACTUALIZADA, PAGINAS_CRM, RUTA_CRM, type ClaveCrm } from './crm-rutas';
import { CATALOGO_INTEGRACIONES, REQUIERE_INSTITUCION } from './crm-integraciones';

/** El catálogo de funciones de Zero CRM, numerado. */
export const FUNCIONES_CRM: readonly { numero: number; nombre: string }[] = [
  'Inicio guiado o con texto libre', 'Lenguaje natural y lectura de documentos', 'Condiciones antes de continuar',
  'Varios canales con el mismo flujo', 'Retomar sin empezar de cero', 'Cuando no entiende', 'Estado de cada mensaje',
  'Archivos y contenido enriquecido', 'Mensajes de espera', 'Inactividad', 'Idiomas', 'Dictado por voz para el asesor',
  'Formularios conversacionales', 'Base de conocimiento', 'Datos completos antes de pasar a una persona',
  'Casos en un CRM corporativo', 'Motivo hacia el centro de contacto', 'Ayuda de IA para el asesor',
  'Recepción de documentos', 'Revisión de documentos', 'Documentos para el asesor',
  'Documentos hacia el sistema de casos', 'Estados sincronizados con el sistema de casos',
  'Conversación hacia el centro de contacto', 'Consulta del estado de una solicitud', 'Avisos de cambio de estado',
  'Contexto que se reutiliza', 'Plantillas de cierre', 'Cierre según la solicitud', 'Pase según el horario',
  'Encuesta y cierre confirmado', 'Paneles', 'Roles y permisos', 'Reparto de conversaciones', 'Prioridad',
  'Exportación', 'Administración de contenidos y flujos', 'Evento hacia una plataforma de encuestas',
  'Encuesta gestionada por otra plataforma', 'Corrector', 'Identificación de la persona',
  'Metas de tiempo de atención', 'Plantillas de respuesta', 'Sentimiento', 'Monitoreo en vivo', 'Citas y turnos',
  'Seguridad', 'Disponibilidad', 'Capacidad', 'Trazabilidad', 'Experiencia y accesibilidad', 'Autenticación',
  'Eventos de seguridad hacia un SIEM',
  // Ventas
  'Pipeline de oportunidades', 'Contactos y fuente de captación', 'Formularios y captación de clientes',
  'Seguimiento automático por etapa', 'Envíos en lote', 'Reservas en línea', 'Cobro por enlace',
].map((nombre, i) => ({ numero: i + 1, nombre }));

/** Qué funciones del catálogo cubre cada capacidad, por página y título. */
const FUNCIONES_DE: Record<ClaveCrm, Record<string, readonly number[]>> = {
  'chatbot-whatsapp': {
    'Conversación abierta y menús guiados': [1], 'Distintas formas de pedir lo mismo': [2], 'Cuando no entiende': [6],
    'Mensajes de espera': [9], 'Otros idiomas': [11], 'El mismo flujo en cada canal': [4], 'Retomar en otro canal': [5, 41],
    'Datos que se reutilizan': [27], Inactividad: [10], 'Formularios conversacionales': [13],
    'Condiciones antes de continuar': [3], 'Consulta de solicitudes': [25], 'Avisos de cambio de estado': [26],
  },
  'chat-web': {
    'Se instala con una línea': [4], 'Tu marca': [51], 'Tu horario': [30], 'Estado a la vista': [7], Archivos: [8, 19],
    'Botones, listas y tarjetas con imagen': [8],
  },
  documentos: {
    'Lectura con confirmación': [2, 19], 'Revisión antes de aceptar': [20], Guardado: [19, 47], 'Para el asesor': [21],
    'Tus documentos como fuente': [14], 'Solo con lo cargado': [14], 'Registro de la fuente': [14, 50],
  },
  seguimiento: {
    'Número al momento': [16, 25], 'Motivo y submotivo': [17], 'Sin duplicar a la persona': [41],
    'Por número u otros datos': [25], 'Con un segundo dato': [25, 41], 'Respuesta clara': [25],
    'Una persona cuando la pida': [15], 'Avisos de cambio': [26], 'Agregar a la solicitud abierta': [27],
    'Lo ya dicho no se vuelve a pedir': [27], 'Cierre según la solicitud': [29], 'Reabrir si no quedó resuelto': [29, 31],
    'Inactividad aparte': [10, 29],
  },
  citas: {
    'Horarios libres': [46], 'Registro y confirmación': [46], 'Ligada a la persona': [46], 'Calendario del equipo': [46],
    'Google Calendar': [46], 'Sistemas de turnos externos': [46],
  },
  encuestas: {
    'Confirmar antes de cerrar': [31], 'Plantillas de cierre': [28], 'También cuando cierra una persona': [31],
    'En el mismo canal': [31], Comentario: [31], 'Registro completo': [31, 50], 'En los indicadores': [32],
    'Enviar el resultado': [38], 'Que tu plataforma decida': [39],
  },
  pipeline: {
    'Etapas a tu medida': [54], 'Arrastrar y soltar': [54, 50], 'Tablero armado con IA': [54], 'Responsable, prioridad y fecha': [54],
    Tareas: [54], 'Archivos e imágenes': [54], 'Contacto desde la tarjeta': [54, 55], 'Enlace directo': [54],
    'Interés detectado en el chat': [54, 56], Ganados: [54, 32], 'Cobro por enlace': [60],
  },
  contactos: {
    'Fuente de captación': [55], 'Notas y llamadas': [55], Recordatorios: [55, 57], 'Todas sus conversaciones': [55, 41],
    'Importar y exportar': [55, 36], 'Acciones en lote': [55], 'Visitantes del chat web': [55],
  },
  captacion: {
    'Editor y enlace público': [56], 'Con IA': [56], Archivos: [56, 19], 'Respuestas y estadísticas': [56],
    'Anuncios de Meta': [56], 'Reservas en línea': [59], 'Interés en el chat': [56],
  },
  automatizaciones: {
    'Al entrar en una etapa': [57], 'Si se estanca o nadie la atiende': [57], 'Por vencer o con las tareas hechas': [57],
    'Por WhatsApp, correo o SMS': [57], 'Plantillas aprobadas por Meta': [57], 'Con botón para enviar': [57],
    'Esperar la confirmación': [57], 'Una sola vez': [57], 'Envío en lote': [58],
  },
  bandeja: {
    'Con los datos completos': [15], 'Ficha al lado': [21, 41], 'Horarios y feriados': [30], 'Respuestas sugeridas': [18],
    Plantillas: [43], 'Cierre con confirmación': [29, 31], 'Resumen a pedido': [18], 'Dictado y corrector': [12, 40],
    Reparto: [34], 'Cola con su posición': [9, 34], 'Prioridad automática': [35],
  },
  supervision: {
    'Con su definición': [32], 'Por persona': [32], 'Tiempos de atención': [42], Monitoreo: [45], Sentimiento: [44],
    'Encuesta al cerrar': [31], Exportación: [36], 'Control de cambios': [37],
  },
  reportes: {
    Filtros: [32], 'Del total al detalle': [32, 50], 'El equipo': [32], 'Formatos estándar': [36],
    'Con identificadores': [36, 50], 'Con permiso y registro': [33, 36], Bitácora: [50], Protegida: [50],
    'Exportar la bitácora': [50],
  },
  administracion: {
    'Editor visual': [37], 'Respuestas y documentos': [14, 37], Versiones: [37], 'Publicación controlada': [37],
    'Horarios y feriados': [30], 'Metas de tiempo': [42], 'Reparto y topes': [34], Prioridades: [35], Plantillas: [43],
    Roles: [33], 'Datos según el rol': [33], 'Registro de cambios': [33, 50],
  },
  idiomas: {
    'Reconoce el idioma': [11], 'El asesor ve la traducción': [11], 'Responder en su idioma': [11], 'Idiomas probados': [11],
    'Revisión con pautas': [51], 'Con teclado': [51], 'Contraste y etiquetas': [51], 'En cualquier pantalla': [51],
    'Tu identidad visual': [51],
  },
  integraciones: {
    Mensajería: [4], 'API REST y webhooks': [4], 'Casos en tu sistema': [16, 22, 23], 'Conversación hacia tu centro de contacto': [17, 24],
    'Resultado de encuestas': [38], 'Citas en tu sistema de turnos': [46], 'Eventos de seguridad a tu SIEM': [53],
    'Si un sistema no responde': [23, 24], 'Conectores nuevos': [],
  },
  seguridad: {
    'En tránsito': [47], Guardado: [47], 'Roles y áreas': [33], 'Permisos finos y roles propios': [33],
    'Doble factor e inicio único': [52], Bitácora: [50], 'Envío a un SIEM': [53], 'Datos personales y la IA': [47],
    Consentimiento: [3], Supresión: [47],
  },
  disponibilidad: {
    'Estado público': [48], Monitoreo: [48], Aplicación: [48, 49], 'Base de datos': [48], 'Inteligencia artificial': [48],
    'Cómo crece': [49], 'Infraestructura dedicada': [48, 49],
  },
  preguntas: {},
};

export type CapacidadCrm = {
  id: string;
  titulo: string;
  detalle: string;
  grupo: string;
  estado: EstadoCrm;
  estadoNombre: string;
  pagina: ClaveCrm;
  categoria: string | null;
  url: string;
  funciones: readonly number[];
};

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const idDe = (clave: string, titulo: string) => `${clave}.${sinAcentos(titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/** Todas las capacidades de las subpáginas, en el orden en que se ven. */
export function capacidadesCrm(): CapacidadCrm[] {
  return PAGINAS_CRM.flatMap(p => CONTENIDO_CRM[p.clave].grupos.flatMap(g => g.funciones.map(f => ({
    id: idDe(p.clave, f.titulo),
    titulo: f.titulo,
    detalle: f.detalle,
    grupo: g.titulo,
    estado: f.estado,
    estadoNombre: ESTADOS[f.estado].nombre,
    pagina: p.clave,
    categoria: p.categoria,
    url: `${SITIO_PUBLICO}${p.ruta}`,
    funciones: FUNCIONES_DE[p.clave][f.titulo] ?? [],
  }))));
}

/** Busca por palabras en título, detalle, grupo y página, sin importar acentos ni mayúsculas. */
export function buscarCapacidades(texto?: string, estado?: EstadoCrm): CapacidadCrm[] {
  const palabras = sinAcentos(texto ?? '').split(/\s+/).filter(w => w.length > 1);
  return capacidadesCrm().filter(c => {
    if (estado && c.estado !== estado) return false;
    const donde = sinAcentos(`${c.titulo} ${c.detalle} ${c.grupo} ${c.pagina}`);
    return palabras.every(w => donde.includes(w));
  });
}

export const RUTA_CAPACIDADES = `${RUTA_CRM}/capacidades.json`;
export const RUTA_ESQUEMA_CAPACIDADES = `${RUTA_CRM}/capacidades.schema.json`;

/** `/productos/crm/capacidades.json`. */
export function capacidadesJson() {
  return {
    $schema: `${SITIO_PUBLICO}${RUTA_ESQUEMA_CAPACIDADES}`,
    producto: 'Zero CRM',
    sitio: `${SITIO_PUBLICO}${RUTA_CRM}`,
    actualizada: CRM_ACTUALIZADA,
    estados: (Object.keys(ESTADOS) as EstadoCrm[]).map(e => ({ clave: e, nombre: ESTADOS[e].nombre, detalle: ESTADOS[e].detalle })),
    categorias: CATEGORIAS_CRM,
    paginas: PAGINAS_CRM.map(p => ({ clave: p.clave, categoria: p.categoria, titulo: p.menu, resumen: p.resumen, url: `${SITIO_PUBLICO}${p.ruta}`, markdown: `${SITIO_PUBLICO}${p.ruta}.md` })),
    funciones: FUNCIONES_CRM,
    capacidades: capacidadesCrm(),
    integraciones: {
      nota: `Catálogo de sistemas con los que Zero CRM se conecta. Salvo los marcados como disponibles, se conectan al implementar y no están en operación con clientes. Los sistemas del Estado: ${REQUIERE_INSTITUCION} Nombrar un sistema no implica alianza ni certificación.`,
      categorias: CATALOGO_INTEGRACIONES.map(c => ({ clave: c.clave, titulo: c.titulo, como: c.como, sistemas: c.sistemas.map(x => ({ ...x, estadoNombre: ESTADOS[x.estado].nombre })) })),
    },
  };
}

/** El esquema de ese archivo, para quien lo valide o lo use como herramienta. */
export const ESQUEMA_CAPACIDADES = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${SITIO_PUBLICO}${RUTA_ESQUEMA_CAPACIDADES}`,
  title: 'Capacidades de Zero CRM',
  description: 'Cada capacidad publicada en las subpáginas de Zero CRM, con su estado, su página y las funciones del catálogo que cubre.',
  type: 'object',
  required: ['producto', 'actualizada', 'estados', 'categorias', 'paginas', 'funciones', 'capacidades', 'integraciones'],
  properties: {
    producto: { type: 'string' },
    sitio: { type: 'string', format: 'uri' },
    actualizada: { type: 'string', format: 'date' },
    estados: {
      type: 'array',
      items: { type: 'object', required: ['clave', 'nombre', 'detalle'], properties: { clave: { enum: Object.keys(ESTADOS) }, nombre: { type: 'string' }, detalle: { type: 'string' } } },
    },
    categorias: {
      type: 'array',
      items: { type: 'object', required: ['clave', 'nombre'], properties: { clave: { type: 'string' }, nombre: { type: 'string' }, resumen: { type: 'string' } } },
    },
    paginas: {
      type: 'array',
      items: { type: 'object', required: ['clave', 'titulo', 'url', 'markdown'], properties: { clave: { type: 'string' }, categoria: { type: ['string', 'null'] }, titulo: { type: 'string' }, resumen: { type: 'string' }, url: { type: 'string', format: 'uri' }, markdown: { type: 'string', format: 'uri' } } },
    },
    integraciones: {
      type: 'object',
      required: ['categorias'],
      properties: {
        nota: { type: 'string' },
        categorias: {
          type: 'array',
          items: {
            type: 'object',
            required: ['clave', 'titulo', 'sistemas'],
            properties: {
              clave: { type: 'string' }, titulo: { type: 'string' }, como: { type: 'string' },
              sistemas: { type: 'array', items: { type: 'object', required: ['nombre', 'detalle', 'estado'], properties: { nombre: { type: 'string' }, detalle: { type: 'string' }, estado: { enum: Object.keys(ESTADOS) }, estadoNombre: { type: 'string' }, fuente: { type: 'string', format: 'uri' } } } },
            },
          },
        },
      },
    },
    funciones: {
      description: 'Catálogo numerado de funciones de Zero CRM.',
      type: 'array',
      items: { type: 'object', required: ['numero', 'nombre'], properties: { numero: { type: 'integer', minimum: 1 }, nombre: { type: 'string' } } },
    },
    capacidades: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'titulo', 'detalle', 'estado', 'pagina', 'url', 'funciones'],
        properties: {
          id: { type: 'string' },
          titulo: { type: 'string' },
          detalle: { type: 'string' },
          grupo: { type: 'string' },
          estado: { enum: Object.keys(ESTADOS) },
          estadoNombre: { type: 'string' },
          pagina: { type: 'string' },
          categoria: { type: ['string', 'null'] },
          url: { type: 'string', format: 'uri' },
          funciones: { description: 'Números del catálogo `funciones` que cubre.', type: 'array', items: { type: 'integer', minimum: 1 } },
        },
      },
    },
  },
} as const;
