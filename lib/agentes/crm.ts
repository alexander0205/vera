/**
 * Zero CRM por partes: lo que leen las personas, los buscadores y los asistentes.
 *
 * De aquí salen las subpáginas de `/productos/crm/*` y `/productos/crm.md`. Un
 * solo origen a propósito: el dato estructurado y la versión en texto tienen que
 * ser el MISMO contenido que se ve en la página, nunca uno paralelo.
 *
 * Reglas al escribir aquí (las vigila `tests/unit/crm-subpaginas.test.ts`):
 *
 *  - **Cada función dice su estado, en palabras.** Casi todo en el CRM se enciende
 *    por negocio (los módulos nacen apagados), y decirlo evita que alguien lea
 *    «disponible» donde hay que activar algo.
 *  - **Lo probado solo contra un simulador es «Se conecta al implementar».** Esos
 *    conectores son código real, pero no han hablado con la instalación de ningún
 *    cliente. Nunca se presentan como integraciones en operación.
 *  - **Sin clientes, organismos, cifras de resultados ni certificaciones propias.**
 *    Las certificaciones que hay son de los proveedores y se dice así. Se habla de
 *    lo que el producto hace, no de quién lo pidió.
 *  - **Nada de instrucciones para quien lo lea con un modelo.** Se escribe claro
 *    para cualquiera; lo demás es hacer trampa, y además se nota.
 */

import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { CRM_ACTUALIZADA, PAGINAS_CRM, RUTA_CRM, RUTA_CRM_MD, RUTA_LLMS_FULL, RUTA_MCP_PUBLICO, type ClaveCrm, paginaCrm } from './crm-rutas';

/** Dónde vive la aplicación del CRM: su estado público y su política de privacidad. */
const APP_CRM = 'https://crm.zero.com.do';
export const ENLACE_ESTADO = `${APP_CRM}/estado`;
export const ENLACE_PRIVACIDAD = `${APP_CRM}/privacidad`;

export type EstadoCrm = 'disponible' | 'activa' | 'implementar' | 'medida';

export const ESTADOS: Record<EstadoCrm, { nombre: string; detalle: string }> = {
  disponible: { nombre: 'Disponible', detalle: 'Está en el producto.' },
  activa: { nombre: 'Se activa por cliente', detalle: 'Existe y viene apagado; se enciende para tu negocio.' },
  implementar: {
    nombre: 'Se conecta al implementar',
    detalle: 'El conector existe y se ha probado contra ambientes simulados. La conexión real se hace con tu sistema.',
  },
  medida: { nombre: 'A medida', detalle: 'Se define y se cotiza contigo.' },
};

export type FuncionCrm = { titulo: string; detalle: string; estado: EstadoCrm };

export type GrupoCrm = { titulo: string; detalle?: string; funciones: readonly FuncionCrm[] };

export type NotaCrm = { titulo: string; texto: string; enlace?: { texto: string; href: string } };

export type ContenidoCrm = {
  /** Para `<title>`; el sitio le agrega « · Zero». */
  tituloSeo: string;
  descripcion: string;
  palabras: readonly string[];
  encabezado: string;
  bajada: string;
  captura?: { src: string; alt: string };
  grupos: readonly GrupoCrm[];
  notas?: readonly NotaCrm[];
};

export const CONTENIDO_CRM: Record<ClaveCrm, ContenidoCrm> = {
  'chatbot-whatsapp': {
    tituloSeo: 'Chatbot con IA para WhatsApp y otros canales',
    descripcion: 'Chatbot con inteligencia artificial para WhatsApp, Messenger, Instagram, correo y chat web: entiende lenguaje natural, guía, retoma y pasa a una persona.',
    palabras: ['chatbot con IA para WhatsApp', 'chatbot omnicanal', 'WhatsApp Business API', 'procesamiento de lenguaje natural', 'formularios conversacionales', 'consulta de solicitudes por WhatsApp'],
    encabezado: 'Un asistente que entiende cómo escribe la gente de verdad.',
    bajada: 'Se puede empezar con un saludo o con la pregunta directa. El asistente reconoce la intención aunque venga con faltas, a medias o con modismos, ofrece opciones cuando ayudan y pregunta cuando hay duda.',
    captura: { src: '/home/capturas/crm-flujos.png', alt: 'Editor de flujos de Zero CRM' },
    grupos: [
      {
        titulo: 'La conversación',
        funciones: [
          { titulo: 'Conversación abierta y menús guiados', detalle: 'Empieza con texto libre y ofrece botones o listas según lo que permita cada canal.', estado: 'disponible' },
          { titulo: 'Distintas formas de pedir lo mismo', detalle: 'Reconoce la intención con faltas, abreviaturas o modismos, y sigue por el paso que corresponde.', estado: 'disponible' },
          { titulo: 'Cuando no entiende', detalle: 'Pide aclarar, da ejemplos y, al tercer intento, pasa a una persona con lo conversado.', estado: 'disponible' },
          { titulo: 'Mensajes de espera', detalle: 'Si una consulta tarda, avisa, y deja de avisar cuando termina.', estado: 'activa' },
          { titulo: 'Otros idiomas', detalle: 'Detecta el idioma y contesta en él; el asesor ve la traducción. Probado en inglés y francés en el chat web.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Sin empezar de cero',
        detalle: 'Lo que la persona ya dijo no se le vuelve a preguntar, aunque cambie de canal o se vaya un rato.',
        funciones: [
          { titulo: 'El mismo flujo en cada canal', detalle: 'WhatsApp, Messenger, Instagram, correo y chat web. Queda registrado por dónde llegó cada persona.', estado: 'disponible' },
          { titulo: 'Retomar en otro canal', detalle: 'Quien empezó en la web puede seguir por WhatsApp, y el asistente le recuerda en qué iba.', estado: 'disponible' },
          { titulo: 'Datos que se reutilizan', detalle: 'Lo que dio en la conversación sirve para los pasos siguientes y para las solicitudes nuevas.', estado: 'disponible' },
          { titulo: 'Inactividad', detalle: 'Avisa antes de cerrar, deja seguir y permite retomar después.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Solicitudes y trámites',
        funciones: [
          { titulo: 'Formularios conversacionales', detalle: 'Pregunta de a una, valida el formato, resume y deja corregir antes de enviar.', estado: 'activa' },
          { titulo: 'Condiciones antes de continuar', detalle: 'Pide aceptar, guarda la respuesta y la fecha, y explica qué pasa si no acepta.', estado: 'activa' },
          { titulo: 'Consulta de solicitudes', detalle: 'Por número, documento, correo o teléfono. Pide un segundo dato para proteger a la persona.', estado: 'activa' },
          { titulo: 'Avisos de cambio de estado', detalle: 'Informa por el canal de la persona, en lenguaje claro. Fuera de la ventana de 24 horas de WhatsApp hace falta una plantilla aprobada por Meta.', estado: 'disponible' },
        ],
      },
    ],
  },

  'chat-web': {
    tituloSeo: 'Chat web con tu marca para tu sitio',
    descripcion: 'Un chat para tu página con tu logo, tus colores y tu horario, que atiende con el mismo flujo que WhatsApp. Se instala con una línea y acepta archivos.',
    palabras: ['chat web para mi página', 'widget de chat con IA', 'chat con marca propia', 'chat accesible'],
    encabezado: 'Un chat en tu página que parece tuyo.',
    bajada: 'Se instala con una línea en tu sitio y atiende con el mismo flujo que los demás canales. El canal se enciende para tu negocio; una vez encendido, trae todo lo de abajo.',
    grupos: [
      {
        titulo: 'En tu sitio',
        funciones: [
          { titulo: 'Se instala con una línea', detalle: 'Se pega en tu página y conversa con el mismo flujo y la misma bandeja.', estado: 'activa' },
          { titulo: 'Tu marca', detalle: 'Logo, colores, textos, trato de usted o de tú, botón, esquinas y letra, con vista previa.', estado: 'disponible' },
          { titulo: 'Tu horario', detalle: 'Muestra cuándo hay personas atendiendo.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Lo que ve quien escribe',
        funciones: [
          { titulo: 'Estado a la vista', detalle: 'Escribiendo, enviado, entregado, leído y hora de cada mensaje.', estado: 'disponible' },
          { titulo: 'Archivos', detalle: 'Fotos, PDF, Word, video y notas de voz, hasta 4 MB por archivo.', estado: 'disponible' },
          { titulo: 'Botones, listas y tarjetas con imagen', detalle: 'Si un canal no lo permite, usa una alternativa.', estado: 'disponible' },
        ],
      },
    ],
    notas: [
      {
        titulo: 'Accesibilidad',
        texto: 'Lo revisamos con herramientas automáticas y con recorridos solo de teclado. Todavía no lo hemos probado con lectores de pantalla reales ni con personas con discapacidad, y no tenemos una certificación de accesibilidad.',
      },
    ],
  },

  documentos: {
    tituloSeo: 'Lectura de documentos OCR y base de conocimiento',
    descripcion: 'Lee fotos y PDF dentro de la conversación, revisa su calidad y pide confirmar lo leído. Responde desde tus documentos cargados, con registro de la fuente.',
    palabras: ['OCR en WhatsApp', 'lectura de documentos con IA', 'validación de documentos', 'base de conocimiento', 'respuestas desde documentos'],
    encabezado: 'Recibe, lee y revisa documentos dentro de la conversación.',
    bajada: 'La persona manda una foto o un PDF, el sistema revisa si se puede leer, saca los datos y le pide confirmarlos. Y el asistente puede responder a partir de los documentos que le cargues.',
    grupos: [
      {
        titulo: 'Lo que llega por la conversación',
        funciones: [
          { titulo: 'Lectura con confirmación', detalle: 'Saca los datos de una foto o un PDF, como una cédula o un comprobante, y pide confirmarlos. Como toda lectura automática puede fallar; por eso se confirma.', estado: 'disponible' },
          { titulo: 'Revisión antes de aceptar', detalle: 'Mira formato, tamaño, luz, contraste y nitidez. Si no sirve, dice por qué y pide otra. Tras tres intentos pasa a una persona.', estado: 'disponible' },
          { titulo: 'Guardado', detalle: 'Archivos en almacenamiento privado, cifrados con AES-256. La versión en PDF se genera cuando se pide.', estado: 'disponible' },
          { titulo: 'Para el asesor', detalle: 'Ve el documento sin salir de la bandeja, lo valida o pide otra versión. La anterior queda como reemplazada.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Base de conocimiento',
        funciones: [
          { titulo: 'Tus documentos como fuente', detalle: 'Carga PDF y Word, y el asistente responde desde ellos.', estado: 'disponible' },
          { titulo: 'Solo con lo cargado', detalle: 'Se puede configurar para usar solo lo cargado y, si no está, decirlo y ofrecer a una persona.', estado: 'disponible' },
          { titulo: 'Registro de la fuente', detalle: 'Queda de qué documento salió cada respuesta.', estado: 'activa' },
        ],
      },
    ],
  },

  seguimiento: {
    tituloSeo: 'Seguimiento de solicitudes por chat y WhatsApp',
    descripcion: 'Solicitudes con su número desde la conversación, consulta segura del estado, aviso de cada cambio y documentos agregados a la solicitud abierta.',
    palabras: ['seguimiento de solicitudes por WhatsApp', 'consulta de estado de un caso', 'número de caso por chat', 'avisos de cambio de estado', 'gestión de reclamaciones'],
    encabezado: 'Cada solicitud con su número, y la persona sabe siempre en qué va.',
    bajada: 'Lo que se pide en la conversación queda como una solicitud con número propio. La persona consulta el estado cuando quiere, recibe un aviso cuando cambia y agrega lo que falte sin empezar otra vez.',
    grupos: [
      {
        titulo: 'Registrar',
        funciones: [
          { titulo: 'Número al momento', detalle: 'Al registrar la solicitud, la persona recibe su número en la misma conversación.', estado: 'activa' },
          { titulo: 'Motivo y submotivo', detalle: 'Cada solicitud se clasifica con un catálogo que defines tú. Lo que no encaja queda como «Otro» para revisarlo.', estado: 'activa' },
          { titulo: 'Sin duplicar a la persona', detalle: 'Si ya existe por su documento, correo o teléfono, se usa el mismo registro.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Consultar el estado',
        funciones: [
          { titulo: 'Por número u otros datos', detalle: 'Por número de solicitud, cédula, pasaporte, RNC, correo o teléfono, escritos como la persona quiera.', estado: 'activa' },
          { titulo: 'Con un segundo dato', detalle: 'Para no mostrar lo ajeno, pide otro dato de la misma solicitud. No hace falta si escribe desde la conversación donde la registró o desde el WhatsApp del titular.', estado: 'activa' },
          { titulo: 'Respuesta clara', detalle: 'Estado, fechas y tipo, en palabras sencillas. Si hay varias, las lista; si no hay ninguna, lo dice y ofrece ayuda.', estado: 'disponible' },
          { titulo: 'Una persona cuando la pida', detalle: 'Si en medio de la consulta prefiere hablar con alguien, pasa a una persona del equipo.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Mientras avanza',
        funciones: [
          { titulo: 'Avisos de cambio', detalle: 'Cuando cambia el estado, se avisa por el canal donde escribió, sin términos técnicos, y queda registrado el envío. Fuera de la ventana de 24 horas de WhatsApp hace falta una plantilla aprobada por Meta.', estado: 'disponible' },
          { titulo: 'Agregar a la solicitud abierta', detalle: 'Si manda un documento con una solicitud abierta, se agrega a esa solicitud, queda en su historial y se le confirma.', estado: 'activa' },
          { titulo: 'Lo ya dicho no se vuelve a pedir', detalle: 'Nombre, documento y respuestas previas se reutilizan en los pasos siguientes y al reasignar la conversación.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Al terminar',
        funciones: [
          { titulo: 'Cierre según la solicitud', detalle: 'Mientras sigue en proceso, la conversación no se cierra en silencio. Cuando se resuelve, pregunta si quedó bien y si necesita algo más.', estado: 'activa' },
          { titulo: 'Reabrir si no quedó resuelto', detalle: 'Si responde que no, la solicitud vuelve a estar en proceso y la atención sigue.', estado: 'activa' },
          { titulo: 'Inactividad aparte', detalle: 'El cierre por inactividad tiene su propia regla y su propio aviso, y no cuenta como resuelto.', estado: 'disponible' },
        ],
      },
    ],
    notas: [
      {
        titulo: 'Con tu sistema de casos',
        texto: 'Si tus solicitudes viven en otro sistema, el seguimiento se conecta a él durante la implementación, con el mismo número de caso en los dos lados.',
        enlace: { texto: 'Ver las integraciones', href: `${RUTA_CRM}/integraciones` },
      },
    ],
  },

  citas: {
    tituloSeo: 'Citas desde WhatsApp y el chat, con tu agenda',
    descripcion: 'Citas dentro de la conversación: horarios libres, registro y confirmación. Con la agenda del CRM y Google Calendar, o tu sistema de turnos.',
    palabras: ['agendar citas por WhatsApp', 'citas por chat', 'reservas con chatbot', 'integración con Google Calendar', 'sistema de turnos'],
    encabezado: 'La cita se agenda en la misma conversación.',
    bajada: 'La persona elige día y hora entre los horarios libres, recibe la confirmación por el mismo canal y la cita queda ligada a su conversación y a su solicitud.',
    grupos: [
      {
        titulo: 'En la conversación',
        funciones: [
          { titulo: 'Horarios libres', detalle: 'Ofrece solo los horarios disponibles, con botones o una lista según el canal.', estado: 'activa' },
          { titulo: 'Registro y confirmación', detalle: 'Registra la cita y envía la confirmación con fecha, hora y lugar.', estado: 'activa' },
          { titulo: 'Ligada a la persona', detalle: 'La cita queda en su ficha y, si hay una solicitud, en ella.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Tu agenda',
        funciones: [
          { titulo: 'Calendario del equipo', detalle: 'Las citas se ven en el calendario del CRM, y se cancelan desde ahí.', estado: 'activa' },
          { titulo: 'Google Calendar', detalle: 'Cada persona conecta su cuenta de Google: se consulta su disponibilidad y el evento se crea o se borra solo.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Con tu sistema de turnos',
        funciones: [
          { titulo: 'Sistemas de turnos y Microsoft Bookings', detalle: 'Consultar horarios, registrar, confirmar y cancelar la cita en tu sistema.', estado: 'implementar' },
        ],
      },
    ],
    notas: [
      {
        titulo: 'Lo que debes saber',
        texto: 'El conector con sistemas de turnos se ha probado contra ambientes simulados y todavía no está en operación con ningún cliente. Los nombres de productos son de sus dueños; mencionarlos no implica relación con ellos.',
      },
    ],
  },

  encuestas: {
    tituloSeo: 'Encuesta de satisfacción y cierre confirmado',
    descripcion: 'Pregunta si quedó resuelto, mide la satisfacción con botones, recoge un comentario y lo guarda con la conversación y la solicitud.',
    palabras: ['encuesta de satisfacción por WhatsApp', 'CSAT en chat', 'encuesta al cerrar la conversación', 'plantillas de cierre', 'medir la satisfacción del cliente'],
    encabezado: 'Se cierra cuando la persona confirma, y se mide cómo le fue.',
    bajada: 'Antes de despedirse, el asistente pregunta si quedó resuelto. Después mide la satisfacción en el mismo canal y guarda la respuesta junto a la conversación y la solicitud.',
    grupos: [
      {
        titulo: 'El cierre',
        funciones: [
          { titulo: 'Confirmar antes de cerrar', detalle: '«¿Quedó resuelto?» y «¿Algo más?». Si dice que no, la conversación sigue abierta.', estado: 'disponible' },
          { titulo: 'Plantillas de cierre', detalle: 'Despedidas por categoría: el asesor elige una, la ajusta y la envía. Queda cuál usó.', estado: 'disponible' },
          { titulo: 'También cuando cierra una persona', detalle: 'Si la conversación la cierra alguien del equipo, la encuesta sale igual.', estado: 'activa' },
        ],
      },
      {
        titulo: 'La encuesta',
        funciones: [
          { titulo: 'En el mismo canal', detalle: 'Con botones donde el canal los permite y con números donde no.', estado: 'activa' },
          { titulo: 'Comentario', detalle: 'Un comentario libre después de la calificación. Si en vez de opinar hace una consulta nueva, se atiende como consulta.', estado: 'activa' },
          { titulo: 'Registro completo', detalle: 'Calificación, comentario, fecha y el identificador de la conversación y de la solicitud.', estado: 'activa' },
          { titulo: 'En los indicadores', detalle: 'Los resultados se ven en los paneles y se exportan.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Con tu plataforma de encuestas',
        detalle: 'Si ya mides la satisfacción en otra herramienta.',
        funciones: [
          { titulo: 'Enviar el resultado', detalle: 'El evento de cierre y la respuesta, con el contexto de la interacción.', estado: 'implementar' },
          { titulo: 'Que tu plataforma decida', detalle: 'Reglas para hacer la encuesta en el chat, dejarla a tu plataforma u omitirla. Si tu plataforma no responde, sale la encuesta propia.', estado: 'implementar' },
        ],
      },
    ],
  },

  reportes: {
    tituloSeo: 'Reportes, exportación y trazabilidad',
    descripcion: 'Paneles con filtros por fecha, asesor y canal, detalle de cada interacción, exportación en formatos estándar y una bitácora protegida.',
    palabras: ['reportes de atención al cliente', 'exportar conversaciones a Excel', 'trazabilidad de interacciones', 'bitácora de auditoría', 'indicadores de chat'],
    encabezado: 'Todo lo que pasó, con fecha, autor e identificador.',
    bajada: 'Los paneles resumen la atención y dejan bajar hasta cada conversación. Lo que se exporta respeta los permisos y queda registrado.',
    grupos: [
      {
        titulo: 'Paneles',
        funciones: [
          { titulo: 'Filtros', detalle: 'Por fecha, asesor, canal y tipo de solicitud.', estado: 'activa' },
          { titulo: 'Del total al detalle', detalle: 'De un indicador a la conversación, por su identificador único.', estado: 'activa' },
          { titulo: 'El equipo', detalle: 'Estado de cada asesor con sus pausas, y conversaciones activas, en espera, reasignadas y cerradas.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Exportación',
        funciones: [
          { titulo: 'Formatos estándar', detalle: 'Excel y CSV, y una carpeta por conversación con sus documentos.', estado: 'activa' },
          { titulo: 'Con identificadores', detalle: 'Cada fila lleva el identificador de la conversación y de la solicitud, y la referencia a sus documentos.', estado: 'activa' },
          { titulo: 'Con permiso y registro', detalle: 'Solo exporta quien tiene permiso, y cada exportación queda anotada.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Trazabilidad',
        funciones: [
          { titulo: 'Bitácora', detalle: 'Quién hizo qué, cuándo y sobre qué registro, con filtros.', estado: 'activa' },
          { titulo: 'Protegida', detalle: 'La aplicación solo permite agregar registros, no cambiarlos ni borrarlos.', estado: 'activa' },
          { titulo: 'Exportar la bitácora', detalle: 'En CSV, para auditoría, con permiso.', estado: 'activa' },
        ],
      },
    ],
  },

  administracion: {
    tituloSeo: 'Administración del chatbot sin programar',
    descripcion: 'Flujos, respuestas, plantillas, horarios, metas de tiempo y roles se editan desde pantallas, con versiones y registro de cada cambio.',
    palabras: ['editor visual de flujos', 'administrar un chatbot sin código', 'roles y permisos', 'SLA configurable', 'versiones de flujos'],
    encabezado: 'Lo cambias tú, desde pantallas, y queda registrado.',
    bajada: 'Flujos, respuestas, reglas y permisos se ajustan sin programar. Cada cambio guarda quién lo hizo y cuándo, y se puede volver a una versión anterior.',
    grupos: [
      {
        titulo: 'Contenido y flujos',
        funciones: [
          { titulo: 'Editor visual', detalle: 'Los pasos de la conversación se arman con bloques, sin escribir código.', estado: 'disponible' },
          { titulo: 'Respuestas y documentos', detalle: 'Textos, documentos de consulta y respuestas aprobadas, que se activan o se desactivan.', estado: 'disponible' },
          { titulo: 'Versiones', detalle: 'Cada cambio publicado queda como versión con autor, fecha y nota, y se puede restaurar.', estado: 'disponible' },
          { titulo: 'Publicación controlada', detalle: 'Los cambios quedan en borrador y se prueban con teléfonos de prueba antes de publicarlos.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Reglas de atención',
        funciones: [
          { titulo: 'Horarios y feriados', detalle: 'Horario de atención, feriados y el mensaje para fuera de horario.', estado: 'activa' },
          { titulo: 'Metas de tiempo', detalle: 'Tiempos por prioridad o condición, con aviso al asesor y al supervisor antes de vencer.', estado: 'activa' },
          { titulo: 'Reparto y topes', detalle: 'Cuántas conversaciones atiende cada persona, por área y por canal.', estado: 'activa' },
          { titulo: 'Prioridades', detalle: 'Palabras clave y condiciones que suben la prioridad. Los niveles son alta, media y baja.', estado: 'activa' },
          { titulo: 'Plantillas', detalle: 'Por categoría y por rol, desde una pantalla.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Personas y permisos',
        funciones: [
          { titulo: 'Roles', detalle: 'Asesor, supervisor y administrador, y roles propios con permisos por función.', estado: 'activa' },
          { titulo: 'Datos según el rol', detalle: 'Cada rol ve solo lo que le toca, y se valida en el servidor.', estado: 'disponible' },
          { titulo: 'Registro de cambios', detalle: 'Los cambios de permisos y los accesos privilegiados quedan en la bitácora.', estado: 'activa' },
        ],
      },
    ],
  },

  idiomas: {
    tituloSeo: 'Chatbot multilingüe y accesible',
    descripcion: 'Contesta en el idioma de quien escribe y el asesor lee la traducción. Pantallas revisadas con pautas de accesibilidad y uso con teclado.',
    palabras: ['chatbot multilingüe', 'traducción automática en el chat', 'atención en inglés y francés', 'chat accesible', 'WCAG'],
    encabezado: 'Atiende en el idioma de quien escribe, y se puede usar sin ratón.',
    bajada: 'El asistente reconoce el idioma y responde en él. Tu equipo trabaja en español y ve cada mensaje traducido. Y las pantallas se revisan con pautas de accesibilidad.',
    grupos: [
      {
        titulo: 'Idiomas',
        funciones: [
          { titulo: 'Reconoce el idioma', detalle: 'Lo detecta en cada mensaje y el asistente contesta en él.', estado: 'activa' },
          { titulo: 'El asesor ve la traducción', detalle: 'Cada mensaje llega traducido al idioma de tu equipo.', estado: 'activa' },
          { titulo: 'Responder en su idioma', detalle: 'El asesor escribe en español y, con un botón, lo traduce antes de enviar.', estado: 'activa' },
          { titulo: 'Idiomas probados', detalle: 'Inglés y francés en el chat web. Otros idiomas se prueban al implementar.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Accesibilidad',
        funciones: [
          { titulo: 'Revisión con pautas', detalle: 'Las pantallas se revisan con herramientas automáticas según las pautas WCAG 2.2, niveles A y AA.', estado: 'disponible' },
          { titulo: 'Con teclado', detalle: 'Las funciones principales se usan con teclado, con el foco visible y un enlace para saltar el menú.', estado: 'disponible' },
          { titulo: 'Contraste y etiquetas', detalle: 'Colores con contraste suficiente, y botones y campos con su nombre.', estado: 'disponible' },
          { titulo: 'En cualquier pantalla', detalle: 'Se adapta al celular, la tableta y la computadora, sin desplazamiento lateral.', estado: 'disponible' },
          { titulo: 'Tu identidad visual', detalle: 'Logo, colores y letra de tu organización en el chat.', estado: 'disponible' },
        ],
      },
    ],
    notas: [
      {
        titulo: 'Lo que no hemos probado',
        texto: 'No lo hemos probado con lectores de pantalla reales ni con personas con discapacidad, y no tenemos una certificación de accesibilidad.',
      },
    ],
  },

  bandeja: {
    tituloSeo: 'Bandeja de asesores con reparto y ayuda de IA',
    descripcion: 'Lo que el bot no resuelve llega a tu equipo con contexto: reparto por topes, prioridad automática, plantillas, respuestas sugeridas y corrector.',
    palabras: ['bandeja de atención al cliente', 'consola de agentes', 'reparto de chats', 'prioridad de conversaciones', 'plantillas de respuesta', 'agent assist'],
    encabezado: 'Lo que el bot no resuelve llega a tu equipo con todo el contexto.',
    bajada: 'Quien atiende ve la conversación, los datos, los documentos y el historial en un solo sitio, con la IA ayudando al lado. Y las reglas de quién atiende qué las pones tú.',
    captura: { src: '/home/capturas/crm-inbox.png', alt: 'Bandeja de Zero CRM con conversaciones de WhatsApp y las que atendió el agente' },
    grupos: [
      {
        titulo: 'El pase a una persona',
        funciones: [
          { titulo: 'Con los datos completos', detalle: 'El bot pide los datos que faltan, sin repetir lo ya dicho, y confirma. El asesor recibe el resumen.', estado: 'disponible' },
          { titulo: 'Ficha al lado', detalle: 'Datos, documentos, historial y otras conversaciones de la misma persona.', estado: 'disponible' },
          { titulo: 'Horarios y feriados', detalle: 'Fuera de horario informa la alternativa y no asigna a nadie.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Para quien atiende',
        funciones: [
          { titulo: 'Respuestas sugeridas', detalle: 'La IA propone respuestas desde tu base de conocimiento, y hay acciones rápidas para consultar el caso y sus documentos.', estado: 'disponible' },
          { titulo: 'Plantillas', detalle: 'Por categoría y por rol, sin comandos. Se insertan y se revisan antes de enviar.', estado: 'disponible' },
          { titulo: 'Cierre con confirmación', detalle: 'Pregunta si quedó resuelto y, si dicen que no, la conversación sigue abierta.', estado: 'disponible' },
          { titulo: 'Resumen a pedido', detalle: 'Resume la conversación con IA cuando el asesor lo pide.', estado: 'activa' },
          { titulo: 'Dictado y corrector', detalle: 'El asesor dicta por voz y revisa ortografía y gramática. Nada sale sin que lo confirme.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Reglas de atención',
        funciones: [
          { titulo: 'Reparto', detalle: 'Tope de chats por persona, área y canal, con cola que se reparte al liberarse un asesor.', estado: 'activa' },
          { titulo: 'Cola con su posición', detalle: 'Mientras espera, la persona sabe cuántas conversaciones hay antes de la suya.', estado: 'activa' },
          { titulo: 'Prioridad automática', detalle: 'Por palabras clave, tono, tipo de solicitud y estado del caso, con el motivo a la vista.', estado: 'activa' },
        ],
      },
    ],
  },

  supervision: {
    tituloSeo: 'Supervisión en vivo e indicadores de atención',
    descripcion: 'Indicadores con su definición, tiempos de atención con aviso, monitoreo en vivo, análisis de sentimiento, encuesta al cerrar y exportación con registro.',
    palabras: ['supervisión de chats en vivo', 'SLA de atención al cliente', 'análisis de sentimiento', 'indicadores de contact center', 'exportar conversaciones'],
    encabezado: 'Sabes cómo va la atención sin pedirle un reporte a nadie.',
    bajada: 'Quien supervisa ve el equipo y las conversaciones mientras pasan, con indicadores que dicen cómo se calculan. Casi todo esto se enciende por negocio.',
    grupos: [
      {
        titulo: 'Indicadores',
        funciones: [
          { titulo: 'Con su definición', detalle: 'Espera, atención, abandono, resolución sin persona y primer contacto. La precisión del bot es una estimación, y así se indica.', estado: 'activa' },
          { titulo: 'Por persona', detalle: 'Estado, pausas con motivo, chats activos, atendidos y reasignados.', estado: 'activa' },
          { titulo: 'Tiempos de atención', detalle: 'Metas generales y por prioridad, con aviso antes de vencer.', estado: 'activa' },
        ],
      },
      {
        titulo: 'En vivo',
        funciones: [
          { titulo: 'Monitoreo', detalle: 'Ver una conversación, escribirle en privado al asesor o intervenir. Queda registrado.', estado: 'activa' },
          { titulo: 'Sentimiento', detalle: 'El tono de cada conversación, con alerta al supervisor.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Calidad y control',
        funciones: [
          { titulo: 'Encuesta al cerrar', detalle: 'Con botones y comentario, y la pregunta de si quedó resuelto.', estado: 'disponible' },
          { titulo: 'Exportación', detalle: 'Excel, CSV y una carpeta por conversación, según permisos y con registro.', estado: 'activa' },
          { titulo: 'Control de cambios', detalle: 'Versiones de los flujos, y restaurar. Con publicación controlada, los cambios pasan por borrador.', estado: 'disponible' },
        ],
      },
    ],
  },

  integraciones: {
    tituloSeo: 'Integraciones, API y conectores',
    descripcion: 'API REST, webhooks y conectores por API para CRM y centro de contacto, como Dynamics y uContact, que se enlazan con el sistema del cliente al implementar.',
    palabras: ['integración de chatbot con CRM', 'conector Dynamics', 'conector uContact', 'Microsoft Bookings', 'API REST WhatsApp', 'webhooks', 'integración SIEM'],
    encabezado: 'API, webhooks y conectores para enlazarte con tus sistemas.',
    bajada: 'Lo que ya está en el producto, y lo que se enlaza con tus sistemas durante la implementación. Cada línea dice cuál de las dos es.',
    grupos: [
      {
        titulo: 'Hoy, en el producto',
        funciones: [
          { titulo: 'Mensajería', detalle: 'WhatsApp Business API con tu número, Messenger, Instagram y correo.', estado: 'disponible' },
          { titulo: 'API REST y webhooks', detalle: 'Desde tu sistema envías mensajes por WhatsApp y consultas conversaciones; por webhook recibes los mensajes que entran.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Se conecta al implementar',
        detalle: 'Conectores por API para CRM y centro de contacto, como Dynamics y uContact, que se conectan al sistema del cliente durante la implementación.',
        funciones: [
          { titulo: 'CRM, como Dynamics', detalle: 'Crear, consultar y actualizar casos, evitar duplicados, adjuntar documentos y devolver el número de caso.', estado: 'implementar' },
          { titulo: 'Centro de contacto, como uContact', detalle: 'Enviar mensajes y eventos, tipificar, y registrar la confirmación o el error.', estado: 'implementar' },
          { titulo: 'Plataformas de encuestas', detalle: 'Enviar el evento de cierre con el contexto de la interacción.', estado: 'implementar' },
          { titulo: 'Citas y sistemas de turnos, como Microsoft Bookings', detalle: 'Consultar horarios, registrar la cita y confirmarla.', estado: 'implementar' },
          { titulo: 'SIEM', detalle: 'Eventos de seguridad en JSON, CEF o syslog con TLS.', estado: 'implementar' },
          { titulo: 'Si un sistema no responde', detalle: 'Cola con reintentos a los 30 segundos, 2 minutos, 10 minutos y 1 hora. Lo que falla queda en la bitácora.', estado: 'implementar' },
        ],
      },
      {
        titulo: 'Otros sistemas',
        funciones: [
          { titulo: 'Conectores nuevos', detalle: 'Para un sistema que no esté en esta lista, el conector se define y se cotiza contigo.', estado: 'medida' },
        ],
      },
    ],
    notas: [
      {
        titulo: 'Lo que debes saber',
        texto: 'Estos conectores se han probado contra ambientes simulados, no contra instalaciones de clientes. Todavía no están en operación con ningún cliente. La conexión real se ajusta y se prueba con tu sistema, y una instalación dentro de tu red puede requerir VPN o un agente puente. Los nombres de productos son de sus dueños; mencionarlos no implica relación con ellos.',
      },
      {
        titulo: 'Para asistentes de IA',
        texto: `Este contenido se puede leer, bajar o conectar desde un asistente de IA. Cada página tiene su versión en texto (agrega .md a la dirección), todo junto está en ${SITIO_PUBLICO}${RUTA_LLMS_FULL}, cada capacidad con su estado está en ${SITIO_PUBLICO}${RUTA_CRM}/capacidades.json, y hay un servidor MCP público de solo lectura, sin clave y sin datos de clientes, en ${SITIO_PUBLICO}${RUTA_MCP_PUBLICO}.`,
        enlace: { texto: 'Ver las capacidades en JSON', href: `${RUTA_CRM}/capacidades.json` },
      },
    ],
  },

  seguridad: {
    tituloSeo: 'Seguridad y privacidad',
    descripcion: 'Cifrado en tránsito y guardado, roles, doble factor, inicio único OIDC, bitácora y trato de datos personales. Y lo que aún no podemos afirmar.',
    palabras: ['seguridad chatbot', 'doble factor', 'inicio de sesión único OIDC', 'bitácora de auditoría', 'protección de datos personales', 'Ley 172-13'],
    encabezado: 'Cómo protegemos la información, y lo que todavía no podemos afirmar.',
    bajada: 'Lo que hace el producto, con su estado, y sin adornos: qué está cifrado y qué no lleva un cifrado adicional, qué se enciende por negocio y qué certificaciones hay.',
    grupos: [
      {
        titulo: 'Cifrado',
        funciones: [
          { titulo: 'En tránsito', detalle: 'Solo TLS 1.2 y 1.3. La base de datos rechaza conexiones sin cifrar.', estado: 'disponible' },
          { titulo: 'Guardado', detalle: 'Archivos con AES-256 y acceso público bloqueado. La base, con el cifrado de su proveedor. Las credenciales de terceros, con AES-256-GCM. El texto de las conversaciones no lleva un cifrado adicional de la aplicación.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Acceso',
        funciones: [
          { titulo: 'Roles y áreas', detalle: 'Roles, áreas y permisos validados en el servidor.', estado: 'disponible' },
          { titulo: 'Permisos finos y roles propios', detalle: 'Permisos por persona y roles que tú creas.', estado: 'activa' },
          { titulo: 'Doble factor e inicio único', detalle: 'Segundo factor por aplicación de códigos, e inicio único con proveedores compatibles con OIDC. La conexión se prueba con tu proveedor al implementar. No usa SAML.', estado: 'activa' },
        ],
      },
      {
        titulo: 'Trazabilidad',
        funciones: [
          { titulo: 'Bitácora', detalle: 'Quién hizo qué y cuándo. La aplicación solo permite agregar registros.', estado: 'activa' },
          { titulo: 'Envío a un SIEM', detalle: 'Eventos en JSON, CEF o syslog con TLS. La recepción se ha probado contra un receptor simulado.', estado: 'implementar' },
        ],
      },
      {
        titulo: 'Datos personales',
        funciones: [
          { titulo: 'Datos personales y la IA', detalle: 'Para clasificar, sugerir, resumir y recordar, la cédula, el teléfono y datos similares se cambian por una etiqueta antes de llegar al modelo. El agente conversacional, la base de conocimiento, la lectura de documentos y la traducción sí los reciben, porque los necesitan.', estado: 'disponible' },
          { titulo: 'Consentimiento', detalle: 'Paso de autorización con fecha, canal y texto.', estado: 'activa' },
          { titulo: 'Supresión', detalle: 'Borrado de una conversación con sus archivos, a petición.', estado: 'disponible' },
        ],
      },
    ],
    notas: [
      {
        titulo: 'Certificaciones',
        texto: 'Zero no tiene ISO 27001 ni SOC 2 propios, y no ha hecho una prueba de penetración externa. Nuestros proveedores sí tienen certificaciones, y son de ellos. Lo que hacemos: revisión de dependencias, pruebas automáticas de seguridad y revisión de código.',
      },
      {
        titulo: 'Proveedores que tratan datos',
        texto: 'Vercel, MongoDB Atlas, Amazon Web Services, Meta, Resend, y Anthropic o Google para la IA.',
        enlace: { texto: 'Leer la política de privacidad de Zero CRM', href: ENLACE_PRIVACIDAD },
      },
    ],
  },

  disponibilidad: {
    tituloSeo: 'Disponibilidad y continuidad',
    descripcion: 'Estado público del servicio, monitoreo cada 5 minutos, qué pasa si algo falla y cómo se pacta la disponibilidad con infraestructura dedicada.',
    palabras: ['disponibilidad del servicio', 'continuidad del negocio', 'estado del servicio', 'escalabilidad chatbot'],
    encabezado: 'Lo que medimos en público y lo que se puede contratar.',
    bajada: 'La medición está a la vista de cualquiera. Y un compromiso de disponibilidad por contrato se pacta sobre infraestructura dedicada, con sus condiciones escritas.',
    grupos: [
      {
        titulo: 'Lo que se mide',
        funciones: [
          { titulo: 'Estado público', detalle: 'Disponibilidad, minutos sin servicio e incidentes, sin iniciar sesión.', estado: 'disponible' },
          { titulo: 'Monitoreo', detalle: 'Se comprueba cada 5 minutos, con aviso por correo al caer y al recuperarse.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Si algo falla',
        funciones: [
          { titulo: 'Aplicación', detalle: 'Corre en instancias sin estado: cualquier instancia puede atender cualquier petición.', estado: 'disponible' },
          { titulo: 'Base de datos', detalle: 'Tres nodos con cambio automático si cae el principal.', estado: 'disponible' },
          { titulo: 'Inteligencia artificial', detalle: 'Si un modelo no responde, se intenta otro; si fallan todos, sigue sin IA o pasa a una persona.', estado: 'disponible' },
        ],
      },
      {
        titulo: 'Capacidad',
        funciones: [
          { titulo: 'Cómo crece', detalle: 'La plataforma donde corre agrega instancias según la demanda, y la base se amplía con el plan contratado. Las cargas altas se ensayan con el volumen y el ambiente de cada implementación.', estado: 'disponible' },
          { titulo: 'Infraestructura dedicada', detalle: 'Base y despliegue propios para tu organización.', estado: 'medida' },
        ],
      },
    ],
    notas: [
      {
        titulo: 'Compromisos por contrato',
        texto: 'Con infraestructura dedicada, contratada aparte, se puede pactar un compromiso de disponibilidad, por ejemplo 99.9 % mensual, junto con objetivos de recuperación. Las condiciones quedan escritas en el contrato.',
        enlace: { texto: 'Ver el estado del servicio', href: ENLACE_ESTADO },
      },
    ],
  },

  preguntas: {
    tituloSeo: 'Preguntas frecuentes',
    descripcion: 'Respuestas directas sobre el chatbot, los canales, los documentos, las integraciones, la seguridad, la disponibilidad y el precio de Zero CRM.',
    palabras: ['preguntas frecuentes chatbot', 'chatbot con IA República Dominicana', 'cuánto cuesta un chatbot'],
    encabezado: 'Las dudas directas, con respuesta directa.',
    bajada: 'Lo que más se pregunta antes de contratar. Si la respuesta depende de algo, lo decimos.',
    grupos: [],
  },
};

export type PreguntaCrm = { pregunta: string; respuesta: string; destacada?: boolean };

/**
 * Las preguntas, escritas como se preguntan y empezando por el sí o el no.
 *
 * Las `destacada` van también en la página principal del CRM.
 */
export const PREGUNTAS_CRM: readonly PreguntaCrm[] = [
  { pregunta: '¿Zero CRM tiene chatbot con IA para WhatsApp?', respuesta: 'Sí. Atiende con tu número por la API oficial de WhatsApp, con IA, menús guiados y paso a una persona.', destacada: true },
  { pregunta: '¿Por qué canales atiende por escrito?', respuesta: 'Por WhatsApp, Messenger, Instagram, correo y chat web, todos en la misma bandeja. Por ahora no atiende por X.', destacada: true },
  { pregunta: '¿Todo viene encendido desde el primer día?', respuesta: 'No. Varias funciones vienen apagadas y se encienden para tu negocio. Cada página dice el estado de cada función.', destacada: true },
  { pregunta: '¿Puede leer documentos?', respuesta: 'Sí. Lee fotos y PDF, revisa su calidad y pide confirmar lo leído.' },
  { pregunta: '¿Qué hace cuando no sabe la respuesta?', respuesta: 'Se puede configurar para responder solo con tus documentos y, si no está, decirlo y ofrecer a una persona. Ninguna IA acierta siempre; por eso hay supervisión y registro de fuentes.' },
  { pregunta: '¿Cómo pasa una conversación a una persona?', respuesta: 'El bot pide los datos que faltan, confirma y entrega al asesor la conversación con un resumen. Fuera de horario informa la alternativa.' },
  { pregunta: '¿Se puede consultar el estado de una solicitud por WhatsApp?', respuesta: 'Sí, y se activa por cliente. Por número u otro dato, y con un segundo dato para proteger a la persona. Cada cambio de estado se le avisa por su canal.' },
  { pregunta: '¿Puede agendar citas?', respuesta: 'Sí, con la agenda del CRM y Google Calendar, que se activan por cliente. Con sistemas de turnos externos se conecta al implementar.' },
  { pregunta: '¿Mide la satisfacción al terminar?', respuesta: 'Sí, y se activa por cliente. Pregunta si quedó resuelto y hace una encuesta con botones y comentario en el mismo canal.' },
  { pregunta: '¿Hace falta programar para cambiar el chatbot?', respuesta: 'No. Flujos, respuestas, plantillas, horarios y permisos se editan desde pantallas, con versiones y registro de cada cambio.' },
  { pregunta: '¿Hay supervisión en vivo?', respuesta: 'Sí, y se activa por cliente: monitoreo, mensaje privado al asesor, intervención y análisis de sentimiento.', destacada: true },
  { pregunta: '¿Funciona en otros idiomas?', respuesta: 'Sí, y se activa por cliente. Lo probamos en inglés y francés en el chat web.' },
  { pregunta: '¿Se integra con Dynamics o uContact?', respuesta: 'Hay conectores por API que se conectan al sistema del cliente durante la implementación. Se han probado contra ambientes simulados y todavía no están en operación con clientes.', destacada: true },
  { pregunta: '¿Se conecta con Microsoft Bookings u otros sistemas de turnos?', respuesta: 'Hay un conector para consultar horarios y registrar citas, en el mismo estado: se enlaza al implementar y se ha probado contra ambientes simulados.' },
  { pregunta: '¿Tiene ISO 27001 o SOC 2?', respuesta: 'No propios, y tampoco una prueba de penetración externa. Nuestros proveedores tienen certificaciones, y son de ellos.', destacada: true },
  { pregunta: '¿Qué pasa con los datos personales cuando los ve la IA?', respuesta: 'Para clasificar, sugerir, resumir y recordar, se cambian por una etiqueta antes de llegar al modelo. El agente conversacional, la base de conocimiento, la lectura de documentos y la traducción sí los reciben, porque los necesitan.' },
  { pregunta: '¿Qué disponibilidad ofrece?', respuesta: 'Publicamos la medición en la página de estado del servicio. Un compromiso por contrato se pacta sobre infraestructura dedicada, por ejemplo 99.9 % mensual, junto con objetivos de recuperación.' },
  { pregunta: '¿Ayuda a cumplir la Ley 172-13?', respuesta: 'Sí, con funciones como el consentimiento con fecha, el acceso por roles, la bitácora y la supresión de datos. El cumplimiento también depende de cómo lo use cada organización.' },
  { pregunta: '¿Para qué tipo de organización está pensado?', respuesta: 'Para quien recibe muchas consultas y trabaja con reglas claras: educación, salud, servicios, instituciones y sectores regulados. Es una orientación, no una lista de clientes.' },
  { pregunta: '¿Puedo conectar un asistente de IA a esta información?', respuesta: `Sí. Hay un servidor MCP público de solo lectura en ${SITIO_PUBLICO}${RUTA_MCP_PUBLICO}, sin clave y sin datos de clientes, más la versión en texto de cada página y ${SITIO_PUBLICO}${RUTA_LLMS_FULL}.` },
  { pregunta: '¿Cuánto cuesta?', respuesta: 'Se cotiza según el volumen y lo que haya que conectar. Se contrata aparte de los planes de Zero.', destacada: true },
];

export const PREGUNTAS_DESTACADAS_CRM: readonly PreguntaCrm[] = PREGUNTAS_CRM.filter(p => p.destacada);

/** A mano y no con `new Date(iso)`: eso se lee en UTC y aquí cae un día antes. */
export function fechaCrm(iso: string = CRM_ACTUALIZADA): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Un enlace del sitio, absoluto: en texto plano un `/ruta` no lleva a ninguna parte. */
const absoluta = (href: string) => (href.startsWith('/') ? `${SITIO_PUBLICO}${href}` : href);

/** Una subpágina en Markdown: su bajada, sus grupos con el estado de cada función y sus notas. */
function seccionMarkdown(clave: ClaveCrm, nivel: '#' | '##'): string {
  const p = paginaCrm(clave);
  const c = CONTENIDO_CRM[clave];
  const grupos = c.grupos.map(g => {
    const funciones = g.funciones.map(f => `- **${f.titulo}** (${ESTADOS[f.estado].nombre}): ${f.detalle}`).join('\n');
    return `${nivel}# ${g.titulo}\n\n${g.detalle ? `${g.detalle}\n\n` : ''}${funciones}`;
  }).join('\n\n');
  const notas = (c.notas ?? []).map(n => `**${n.titulo}.** ${n.texto}${n.enlace ? ` ${n.enlace.texto}: ${absoluta(n.enlace.href)}` : ''}`).join('\n\n');
  return `${nivel} ${p.menu}\n\n${c.bajada}\n\nPágina: ${SITIO_PUBLICO}${p.ruta}\n\n${grupos}${notas ? `\n\n${notas}` : ''}`;
}

function preguntasMarkdown(nivel: '##' | '###'): string {
  return PREGUNTAS_CRM.map(q => `${nivel} ${q.pregunta}\n\n${q.respuesta}`).join('\n\n');
}

/** `/productos/crm/<página>.md`: una subpágina en texto limpio, con la leyenda de estados. */
export function subpaginaMarkdown(clave: ClaveCrm): string {
  const p = paginaCrm(clave);
  const c = CONTENIDO_CRM[clave];
  const estados = (Object.values(ESTADOS)).map(e => `- **${e.nombre}:** ${e.detalle}`).join('\n');
  const cuerpo = clave === 'preguntas'
    ? `# ${p.menu}\n\n${c.bajada}\n\nPágina: ${SITIO_PUBLICO}${p.ruta}\n\n${preguntasMarkdown('##')}`
    : seccionMarkdown(clave, '#');
  return `${cuerpo}

## Qué significa cada estado

${estados}

---

Zero CRM. Actualizado el ${fechaCrm()}. Todas las partes: ${SITIO_PUBLICO}${RUTA_CRM_MD} · Todo el texto: ${SITIO_PUBLICO}${RUTA_LLMS_FULL}
`;
}

/** `/productos/crm.md`: las subpáginas en texto limpio, con el estado de cada función. */
export function crmMarkdown(): string {
  const estados = (Object.values(ESTADOS)).map(e => `- **${e.nombre}:** ${e.detalle}`).join('\n');
  const paginas = PAGINAS_CRM.filter(p => p.clave !== 'preguntas').map(p => seccionMarkdown(p.clave, '##')).join('\n\n');
  const preguntas = preguntasMarkdown('###');

  return `# Zero CRM, por partes

> Chatbot con IA y bandeja para el equipo, por WhatsApp, Messenger, Instagram, correo y chat web. Se contrata aparte de los planes de Zero y el precio es bajo cotización.

Actualizado el ${fechaCrm()}. Esta versión reúne las subpáginas del CRM; el resumen general está en ${SITIO_PUBLICO}${RUTA_CRM}. Versión en texto: ${SITIO_PUBLICO}${RUTA_CRM_MD}

## Qué significa cada estado

${estados}

${paginas}

## Preguntas frecuentes

${preguntas}
`;
}

/** La entrada de menú y el contenido juntos: lo que necesita pintar una subpágina. */
export function subpaginaCrm(clave: ClaveCrm) {
  return { ...paginaCrm(clave), ...CONTENIDO_CRM[clave] };
}
