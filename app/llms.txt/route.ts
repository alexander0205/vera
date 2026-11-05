import { preciosAdicionales, preciosDeLineas } from '@/lib/agentes/precios';
import { CONTACTO } from '@/app/(marketing)/_piezas';
import { GUIAS } from '@/app/(marketing)/guias/page';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { PRUEBA, diasDePrueba } from '@/lib/config/suscripcion';
import { ALTA, CONECTOR, RUTA_AGENTES_MD, RUTA_FUNCIONES_MD, textoDeLaPrueba } from '@/lib/agentes/contenido';
import { PAGINAS_SIN_CATEGORIA, RUTA_CRM_MD, RUTA_LLMS_FULL, RUTA_MCP_PUBLICO, paginasPorCategoria } from '@/lib/agentes/crm-rutas';
import { RUTA_CAPACIDADES } from '@/lib/agentes/crm-capacidades';

/**
 * `/llms.txt` — el sitio resumido para quien lo lee con un modelo.
 *
 * Qué es: un archivo de texto con el mapa del sitio y los datos duros, pensado
 * para que un asistente que contesta «¿qué ERP hay en República Dominicana?»
 * tenga de dónde sacar la respuesta sin rastrear ocho páginas.
 *
 * Honestidad sobre su valor: **es una convención de la comunidad, no un
 * estándar**, y ningún proveedor grande —OpenAI, Anthropic, Google— se ha
 * comprometido a usarla; las mediciones de 2026 dan un puñado de visitas a
 * `llms.txt` sobre cientos de millones de peticiones de bots. Se publica porque
 * cuesta un archivo y algún día puede servir, no porque sea la palanca. La
 * palanca es que el contenido esté en el HTML y que `OAI-SearchBot` pueda
 * entrar (ver `app/robots.ts`).
 *
 * Los precios NO se escriben aquí: salen del catálogo, con su bandera de
 * cotización. Un archivo aparte con cifras a mano es el que se queda viejo.
 */

export const dynamic = 'force-static';

function paginasCrm(): string {
  const grupos = paginasPorCategoria().map(c =>
    `  - ${c.nombre}: ${c.resumen}\n${c.paginas.map(p => `    - [${p.menu}](${SITIO_PUBLICO}${p.ruta}): ${p.resumen}`).join('\n')}`);
  const sueltas = PAGINAS_SIN_CATEGORIA.map(p => `  - [${p.menu}](${SITIO_PUBLICO}${p.ruta}): ${p.resumen}`);
  return [...grupos, ...sueltas].join('\n');
}

function guias(): string {
  return GUIAS.map(g =>
    `- [${g.titulo}](${SITIO_PUBLICO}/guias/${g.slug}): ${g.resumen}`).join('\n');
}

/** La prueba, leída de la perilla: si un día las familias vuelven a separarse, se dice. */
function textoPrueba(): string {
  const ecf = diasDePrueba('ecf');
  const colegio = diasDePrueba('colegio');
  const cuanto = ecf === colegio
    ? `${ecf} días gratis en todos los planes`
    : `${ecf} días en los planes de facturación y ${colegio} en los de colegio`;
  return `Sí: ${cuanto}${PRUEBA.pideTarjeta ? '' : ', sin tarjeta'}.`;
}

export function GET() {
  const cuerpo = `# Zero

> Plataforma dominicana de gestión para empresas e instituciones: facturación electrónica (e-CF) emitida directo a la DGII, cuentas por cobrar, inventario, compras, contabilidad, punto de venta, nómina, gestión de colegios y un CRM con agentes de inteligencia artificial.

Zero es un producto de Yisrael Technology. Opera en República Dominicana, en español, sobre la web y sin instalación. La facturación cumple con el formato de comprobante fiscal electrónico de la DGII; cada empresa completa su propia habilitación ante la DGII, guiada paso a paso dentro de Zero.

## Para agentes de IA

- [Zero para agentes](${SITIO_PUBLICO}${RUTA_AGENTES_MD}): qué puede hacer hoy un agente con Zero, cómo se conecta y con qué reglas.
- [Todas las funciones](${SITIO_PUBLICO}${RUTA_FUNCIONES_MD}): el sistema entero, módulo por módulo, con lo que no hace.
- [Zero CRM por partes](${SITIO_PUBLICO}${RUTA_CRM_MD}): cada función con su estado, en texto.
- [Zero CRM, todo el texto](${SITIO_PUBLICO}${RUTA_LLMS_FULL}): las subpáginas, las preguntas y los precios en un archivo. Cada subpágina tiene además su versión en texto: su dirección terminada en \`.md\`.
- [Capacidades de Zero CRM en JSON](${SITIO_PUBLICO}${RUTA_CAPACIDADES}): cada capacidad con su estado, su página y las funciones que cubre, con su esquema.
- Servidor MCP público del sitio, de solo lectura, sin clave y sin datos de clientes: \`${SITIO_PUBLICO}${RUTA_MCP_PUBLICO}\` (HTTP con streaming). Herramientas: listar_paginas, leer_pagina, buscar_capacidades, estado_capacidad, catalogo_funciones, catalogo_integraciones y precios. En un cliente MCP: \`{"mcpServers":{"zero":{"url":"${SITIO_PUBLICO}${RUTA_MCP_PUBLICO}"}}}\`.
- Conector MCP, de solo lectura: \`${CONECTOR.url}\`. Se usa con una llave por empresa (\`${CONECTOR.cabecera}\`).
- Crear una empresa: la crea una persona en ${ALTA.url}. Prueba gratis: ${textoDeLaPrueba()}.

## Productos

${preciosDeLineas()}

## Adicionales y productos aparte

${preciosAdicionales()}

## Páginas

- [Portada](${SITIO_PUBLICO}/): qué resuelve Zero y el recorrido de una venta.
- [Zero ERP](${SITIO_PUBLICO}/productos/erp): facturación e-CF, cobros, inventario, compras.
- [Contabilidad](${SITIO_PUBLICO}/productos/contabilidad): asientos automáticos, libros, 606/607/608.
- [Punto de venta](${SITIO_PUBLICO}/productos/punto-de-venta): caja con turnos, mesas y venta a crédito.
- [Nómina](${SITIO_PUBLICO}/productos/nomina): TSS, AFP, SFS, ISR, INFOTEP, regalía y vacaciones.
- [Zero CRM](${SITIO_PUBLICO}/productos/crm): agentes de IA por WhatsApp, Messenger, Instagram, correo, web y teléfono. Por partes:
${paginasCrm()}
- [Colegios](${SITIO_PUBLICO}/colegios): matrícula, mensualidades, mora automática y portal de padres.
- [Precios](${SITIO_PUBLICO}/precios): los planes con sus topes.
- [Guías](${SITIO_PUBLICO}/guias): los trámites fiscales y laborales dominicanos explicados.
- [Contacto](${SITIO_PUBLICO}/contacto).
- [Distribuidores autorizados](${SITIO_PUBLICO}/distribuidores): quién vende, implementa y da soporte local a Zero en República Dominicana.

## Guías

Explicaciones de los trámites, con sus fuentes oficiales al pie. Sirven sin contratar nada.

${guias()}

## Datos que suelen preguntarse

- **¿Dónde opera?** República Dominicana. Interfaz y soporte en español.
- **¿Emite comprobantes fiscales electrónicos?** Sí: los diez tipos de e-CF, firmados, enviados y acusados ante la DGII, con sus reportes 606, 607 y 608.
- **¿Incluye contabilidad?** Sí, en todos los planes, sin costo aparte.
- **¿Tiene inteligencia artificial?** Sí. Zero CRM usa agentes que entienden lenguaje natural, leen notas de voz y fotos con OCR, responden desde los documentos que se les cargan citando la fuente, verifican identidad, agendan citas, cobran y contestan llamadas por voz.
- **¿Zero ERP se integra con otros sistemas?** En parte: una API de solo lectura y un conector MCP, con una llave por empresa; webhooks de salida, todavía sin pantalla para configurarlos; avisos de cobro a los padres por WhatsApp, SMS y correo; y conexión con SIGERD para los colegios. No hay API para crear o cambiar datos desde fuera.
- **¿Zero CRM se integra con otros sistemas?** Es otra aplicación, con su propia API: desde tu sistema envías mensajes por WhatsApp y consultas conversaciones, y por webhook recibes los que entran. Además se conecta, al implementar, con los sistemas que publican una API, servicios web o webhooks: CRM y gestión de casos, centros de contacto, ERP, identidad, SIEM, turnos, documentos, pagos y sistemas del Estado dominicano, con el acceso que dé cada institución. Esos conectores se han probado contra ambientes simulados y todavía no están en operación con clientes. El catálogo completo está en la página de integraciones.
- **¿Hay prueba?** ${textoPrueba()} Sin contrato mínimo.
- **Contacto:** ${CONTACTO.ventas} · ${CONTACTO.telefono} · WhatsApp ${CONTACTO.whatsapp}

## Zero CRM: lo que conviene saber antes de contar con algo

- Varias funciones vienen apagadas y se encienden por negocio. Cada subpágina dice el estado de cada una: Disponible, Se activa por cliente, Se conecta al implementar o A medida.
- No tiene ISO 27001 ni SOC 2 propios, ni una prueba de penetración externa. Las certificaciones que hay son de sus proveedores.
- Un compromiso de disponibilidad por contrato se pacta sobre infraestructura dedicada.
- El inicio de sesión único usa OIDC, no SAML. No atiende por X.

## Qué NO hace Zero ERP (para no inducir a error)

- No gestiona sucursales como entidades separadas.
- El punto de venta no funciona sin conexión.
- No maneja lotes con fecha de vencimiento ni conteo físico de inventario.
- La nómina no calcula liquidaciones de prestaciones ni maneja préstamos, bonos por regla o descuentos fijos configurables. Sí genera el archivo de pago para el banco.
- Zero ERP no cobra con tarjeta por enlace de pago: en los colegios, el padre paga por transferencia y sube su comprobante.
- No usa impresoras fiscales: imprime desde el navegador en térmica de 80 o 58 mm o en papel carta.
`;

  return new Response(cuerpo, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
