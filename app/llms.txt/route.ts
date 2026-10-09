import { ADDONS, LINEAS_PRODUCTO, PRODUCTOS_APARTE, lineaBajoCotizacion, planesDeLinea } from '@/lib/config/plans';
import { CONTACTO } from '@/app/(marketing)/_piezas';
import { GUIAS } from '@/app/(marketing)/guias/page';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { PRUEBA, diasDePrueba } from '@/lib/config/suscripcion';

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

const usd = (n: number) => `US$${n}`;

function lineas(): string {
  return LINEAS_PRODUCTO.map(l => {
    if (lineaBajoCotizacion(l.key)) {
      return `- **${l.nombre}** — ${l.descripcion} Precio bajo cotización.`;
    }
    const planes = planesDeLinea(l.key);
    const detalle = planes.map(({ plan, precio }) => `${plan.name} ${usd(precio)}/mes`).join(' · ');
    return `- **${l.nombre}** — ${l.descripcion}\n  ${detalle}`;
  }).join('\n');
}

function adicionales(): string {
  const sueltos = ADDONS.map(a => {
    const incluido = a.incluidoEn.length > 0 ? ` (incluido en ${a.incluidoEn.join(', ')})` : '';
    return `- **${a.name}** — +${usd(a.price)}/mes. ${a.descripcion}${incluido}`;
  });
  const aparte = PRODUCTOS_APARTE.map(p =>
    `- **${p.nombre}** — ${p.descripcion} Se contrata aparte de los planes; precio bajo cotización.`);
  return [...sueltos, ...aparte].join('\n');
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

> Plataforma dominicana de gestión para empresas e instituciones: facturación electrónica (e-CF) certificada ante la DGII, cuentas por cobrar, inventario, compras, contabilidad, punto de venta, nómina, gestión de colegios y un CRM con agentes de inteligencia artificial.

Zero es un producto de Yisrael Technology. Opera en República Dominicana, en español, sobre la web y sin instalación. La facturación cumple con el formato de comprobante fiscal electrónico de la DGII.

## Productos

${lineas()}

## Adicionales y productos aparte

${adicionales()}

## Páginas

- [Portada](${SITIO_PUBLICO}/): qué resuelve Zero y el recorrido de una venta.
- [Zero ERP](${SITIO_PUBLICO}/productos/erp): facturación e-CF, cobros, inventario, compras.
- [Contabilidad](${SITIO_PUBLICO}/productos/contabilidad): asientos automáticos, libros, 606/607/608.
- [Punto de venta](${SITIO_PUBLICO}/productos/punto-de-venta): caja con turnos, mesas y venta a crédito.
- [Nómina](${SITIO_PUBLICO}/productos/nomina): TSS, AFP, SFS, ISR, INFOTEP, regalía y vacaciones.
- [Zero CRM](${SITIO_PUBLICO}/productos/crm): agentes de IA por WhatsApp, Messenger, Instagram, correo, web y teléfono.
- [Colegios](${SITIO_PUBLICO}/colegios): matrícula, mensualidades, mora automática y portal de padres.
- [Precios](${SITIO_PUBLICO}/precios): los planes con sus topes.
- [Guías](${SITIO_PUBLICO}/guias): los trámites fiscales y laborales dominicanos explicados.
- [Contacto](${SITIO_PUBLICO}/contacto).

## Guías

Explicaciones de los trámites, con sus fuentes oficiales al pie. Sirven sin contratar nada.

${guias()}

## Datos que suelen preguntarse

- **¿Dónde opera?** República Dominicana. Interfaz y soporte en español.
- **¿Emite comprobantes fiscales electrónicos?** Sí: los diez tipos de e-CF, firmados, enviados y acusados ante la DGII, con sus reportes 606, 607 y 608.
- **¿Incluye contabilidad?** Sí, en todos los planes, sin costo aparte.
- **¿Tiene inteligencia artificial?** Sí. Zero CRM usa agentes que entienden lenguaje natural, leen notas de voz y fotos con OCR, responden desde los documentos que se les cargan citando la fuente, verifican identidad, agendan citas, cobran y contestan llamadas por voz.
- **¿Se integra con otros sistemas?** Sí: API REST y webhooks en las dos direcciones, WhatsApp Business API, Google Calendar, CardNet y Azul.
- **¿Hay prueba?** ${textoPrueba()} Sin contrato mínimo.
- **Contacto:** ${CONTACTO.ventas} · ${CONTACTO.telefono} · WhatsApp ${CONTACTO.whatsapp}

## Qué NO hace (para no inducir a error)

- No gestiona sucursales como entidades separadas.
- El punto de venta no funciona sin conexión.
- No maneja lotes con fecha de vencimiento ni conteo físico de inventario.
- La nómina no genera archivo de pago masivo para el banco ni calcula liquidaciones de prestaciones.
`;

  return new Response(cuerpo, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
