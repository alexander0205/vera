/**
 * El catálogo de sistemas con los que Zero CRM se puede conectar, por categoría.
 *
 * Reglas (las vigila `tests/unit/crm-subpaginas.test.ts`):
 *
 *  - **Casi todo es «Se conecta al implementar».** El conector se arma con la
 *    interfaz que el sistema publica (API, servicios web, webhooks o archivos) y
 *    se prueba con la instalación de cada cliente. Ninguno está en operación con
 *    clientes. Solo los canales que el producto ya atiende dicen otra cosa.
 *  - **Nombrar no es aliarse.** Los nombres son de sus dueños; no hay alianza,
 *    certificación ni logotipos.
 *  - **Los sistemas del Estado, con su fuente.** Cada uno se describe por lo que
 *    hace, con un enlace oficial (preferiblemente .gob.do), y dice que hace falta
 *    el acuerdo o el acceso de la institución que lo opera.
 */

import type { EstadoCrm } from './crm';

export type SistemaIntegrable = {
  nombre: string;
  /** Qué hace, o cómo se conecta, en una línea. */
  detalle: string;
  estado: EstadoCrm;
  /** Página oficial que respalda lo dicho. Solo en los del Estado. */
  fuente?: string;
};

export type CategoriaIntegracion = {
  clave: string;
  titulo: string;
  /** Cómo se conecta esa familia de sistemas, en general. */
  como: string;
  sistemas: readonly SistemaIntegrable[];
};

const al = (detalle: string, nombre: string): SistemaIntegrable => ({ nombre, detalle, estado: 'implementar' });
const varios = (detalle: string, ...nombres: string[]) => nombres.map(n => al(detalle, n));

/** Lo que piden todos los del Estado: el acceso lo da la institución que opera el sistema. */
export const REQUIERE_INSTITUCION = 'Requiere el acuerdo o el acceso que otorgue la institución que lo opera.';

export const CATALOGO_INTEGRACIONES: readonly CategoriaIntegracion[] = [
  {
    clave: 'canales',
    titulo: 'Canales de mensajería',
    como: 'Por las API oficiales de cada plataforma. Los que dicen «Disponible» ya atienden hoy.',
    sistemas: [
      { nombre: 'WhatsApp', detalle: 'API oficial de WhatsApp Business, con tu número.', estado: 'disponible' },
      { nombre: 'Instagram', detalle: 'Mensajes directos, por la API de Meta.', estado: 'disponible' },
      { nombre: 'Messenger', detalle: 'Mensajes de tu página, por la API de Meta.', estado: 'disponible' },
      { nombre: 'Correo electrónico', detalle: 'Entrada y salida de correos en la misma bandeja.', estado: 'disponible' },
      { nombre: 'Chat web', detalle: 'Una línea en tu sitio, con tu marca.', estado: 'activa' },
      { nombre: 'SMS', detalle: 'Avisos y respuestas por mensaje de texto, con un proveedor de SMS.', estado: 'activa' },
      { nombre: 'Telegram', detalle: 'Por la API de bots de Telegram. Hoy no está construido.', estado: 'medida' },
    ],
  },
  {
    clave: 'anuncios',
    titulo: 'Anuncios y captación',
    como: 'Los contactos que dejan sus datos en un anuncio entran al pipeline, en la columna que elijas.',
    sistemas: [
      { nombre: 'Anuncios de Meta (Instagram y Facebook)', detalle: 'Formularios de anuncios, conectados con la cuenta de cada negocio.', estado: 'activa' },
    ],
  },
  {
    clave: 'estado-dominicano',
    titulo: 'Sistemas del Estado dominicano',
    como: `Por servicios web, la Plataforma Única de Interoperabilidad o la interfaz que publique cada institución. ${REQUIERE_INSTITUCION}`,
    sistemas: [
      { nombre: 'Plataforma Única de Interoperabilidad (OGTIC)', detalle: 'La plataforma que opera la OGTIC para que las instituciones públicas intercambien datos de forma segura.', estado: 'implementar', fuente: 'https://ogtic.gob.do' },
      { nombre: 'DGII: facturación electrónica e-CF', detalle: 'Servicios web documentados por la DGII: recepción, consulta del estado de un e-CF y directorio de facturadores electrónicos, con la certificación y las credenciales del contribuyente.', estado: 'implementar', fuente: 'https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion%20Tecnica%20Servicios%20DGII.pdf' },
      { nombre: 'JCE: validación de identidad', detalle: 'Consulta al maestro de cedulados y validación de identidad, mediante convenio con la Junta Central Electoral.', estado: 'implementar', fuente: 'https://jce.gob.do' },
      { nombre: 'TSS: SUIR', detalle: 'Sistema Único de Información y Recaudo de la Seguridad Social: registro de trabajadores y aportes de los empleadores.', estado: 'implementar', fuente: 'https://www.tss.gob.do' },
      { nombre: 'SIGEF (Ministerio de Hacienda)', detalle: 'Sistema de gestión financiera del Estado: presupuesto, contabilidad gubernamental y tesorería.', estado: 'implementar', fuente: 'https://transparencia.hacienda.gob.do/wp-content/uploads/2023/12/TDR-BID-Implementaci%C3%B3n-SIGEF-en-Poderes-1.pdf' },
      { nombre: 'SASP (Ministerio de Administración Pública)', detalle: 'Sistema de Administración de Servidores Públicos: registro de los servidores públicos y procesamiento de sus nóminas.', estado: 'implementar', fuente: 'https://map.gob.do/transparencia/download/1132/informes-semestrales/22319/informe-ejecucion-segundo-semestre-metas-fisicas-financieras-presupuestaria-2026-4.pdf' },
      { nombre: 'Portal Transaccional de compras públicas (DGCP)', detalle: 'Sistema electrónico de compras y contrataciones del Estado, para consultar procesos y su estado.', estado: 'implementar', fuente: 'https://www.dgcp.gob.do/wp-content/uploads/page/introduccion-al-portal-transaccional.pdf' },
      { nombre: 'Sistema 311', detalle: 'Denuncias, quejas, reclamaciones y sugerencias sobre entidades del Estado: registrar o derivar el caso y guardar su número.', estado: 'implementar', fuente: 'https://311.gob.do' },
      { nombre: 'SAIP (DIGEIG)', detalle: 'Portal único de solicitudes de acceso a la información pública (Ley 200-04): orientar a la persona y registrar su solicitud.', estado: 'implementar', fuente: 'https://saip.gob.do' },
      { nombre: 'Gob.do', detalle: 'Portal único de trámites del Estado: llevar a la persona al trámite correcto desde la conversación.', estado: 'implementar', fuente: 'https://www.gob.do' },
      { nombre: 'Portal de Datos Abiertos', detalle: 'Catálogo público de datos del Estado, con una API de consulta que no pide credenciales.', estado: 'implementar', fuente: 'https://datos.gob.do' },
      { nombre: 'Firma digital con entidades de certificación autorizadas por INDOTEL', detalle: 'Firmar o validar documentos con certificados de una entidad autorizada, como Avansi.', estado: 'implementar', fuente: 'https://indotel.gob.do/wp-content/uploads/2022/10/resoluci_n_070_2022_avansi.pdf' },
    ],
  },
  {
    clave: 'crm-casos',
    titulo: 'CRM y gestión de casos',
    como: 'Por API REST o servicios web: crear y consultar casos, adjuntar documentos y mantener el estado igual en los dos lados.',
    sistemas: varios('Casos, contactos y documentos por su API.', 'Salesforce', 'ServiceNow', 'Zendesk', 'Jira Service Management', 'GLPI', 'Microsoft Dynamics 365'),
  },
  {
    clave: 'contact-center',
    titulo: 'Centros de contacto',
    como: 'Por API o webhooks: la conversación del chat entra al centro de contacto, con su tipificación.',
    sistemas: varios('Mensajes, tipificación y datos de la interacción por su API.', 'Genesys', 'Avaya', 'Five9', 'Twilio', 'uContact'),
  },
  {
    clave: 'erp',
    titulo: 'ERP y contabilidad',
    como: 'Por API o servicios web: consultar clientes, facturas, saldos o pedidos desde la conversación.',
    sistemas: varios('Clientes, facturas y saldos por su API.', 'SAP', 'Oracle', 'Microsoft Dynamics 365', 'Odoo', 'Sage'),
  },
  {
    clave: 'identidad',
    titulo: 'Identidad e inicio de sesión único',
    como: 'Por OIDC, para que tu equipo entre con su cuenta de siempre. SAML no está construido.',
    sistemas: [
      ...varios('Inicio de sesión único por OIDC.', 'Microsoft Entra ID', 'Okta', 'Keycloak', 'Google Workspace'),
      { nombre: 'SAML 2.0', detalle: 'Hoy no está construido; se define y se cotiza.', estado: 'medida' },
    ],
  },
  {
    clave: 'seguridad',
    titulo: 'Seguridad y registros',
    como: 'Eventos de seguridad en JSON, CEF o syslog con TLS, hacia tu SIEM.',
    sistemas: varios('Eventos de seguridad en JSON, CEF o syslog.', 'Splunk', 'Microsoft Sentinel', 'IBM QRadar', 'Elastic', 'Wazuh'),
  },
  {
    clave: 'turnos',
    titulo: 'Turnos, citas y agenda',
    como: 'Por API: consultar horarios libres, registrar la cita y confirmarla.',
    sistemas: [
      { nombre: 'Google Calendar', detalle: 'Disponibilidad y eventos de la cuenta de Google de cada persona.', estado: 'activa' },
      ...varios('Horarios, registro y confirmación por su API.', 'Outlook y Microsoft 365', 'Microsoft Bookings', 'Qmatic', 'Wavetec'),
    ],
  },
  {
    clave: 'documentos',
    titulo: 'Documentos',
    como: 'Por API: guardar lo que llega por la conversación en tu repositorio, o responder desde él.',
    sistemas: varios('Guardar y leer documentos por su API.', 'SharePoint', 'Google Drive', 'Alfresco', 'OpenText'),
  },
  {
    clave: 'pagos',
    titulo: 'Pagos en República Dominicana',
    como: 'Enlace de pago generado en la conversación. Es a medida: se activa con las credenciales de comercio de cada negocio.',
    sistemas: ['CardNet', 'Azul'].map(nombre => ({ nombre, detalle: 'Enlace de pago con tus credenciales de comercio.', estado: 'medida' as const })),
  },
  {
    clave: 'bi',
    titulo: 'Inteligencia de negocio',
    como: 'Hoy, por exportación en Excel o CSV; la conexión directa a los datos se hace al implementar.',
    sistemas: varios('Indicadores de la atención para tus tableros.', 'Power BI', 'Tableau', 'Looker'),
  },
];

/** Todos los sistemas del catálogo, con su categoría. */
export function sistemasIntegrables() {
  return CATALOGO_INTEGRACIONES.flatMap(c => c.sistemas.map(s => ({ ...s, categoria: c.clave, categoriaTitulo: c.titulo })));
}

/** El catálogo en Markdown: para la versión en texto de la página y para `llms-full.txt`. */
export function catalogoIntegracionesMarkdown(nivel: string, nombreEstado: (e: EstadoCrm) => string): string {
  return CATALOGO_INTEGRACIONES.map(c => {
    const lineas = c.sistemas.map(s => `- **${s.nombre}** (${nombreEstado(s.estado)}): ${s.detalle}${s.fuente ? ` Fuente: ${s.fuente}` : ''}`).join('\n');
    return `${nivel} ${c.titulo}\n\n${c.como}\n\n${lineas}`;
  }).join('\n\n');
}
