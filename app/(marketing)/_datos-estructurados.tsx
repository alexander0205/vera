/**
 * Datos estructurados (JSON-LD) del sitio público.
 *
 * Es lo que leen Google y los asistentes de IA cuando resumen de qué va esto.
 * Un buscador puede adivinar a partir del texto; un asistente que contesta
 * «¿qué CRM con IA hay en República Dominicana?» se apoya en lo declarado, y
 * si no hay nada declarado, resume lo que le parece.
 *
 * Dos reglas:
 *
 *  - **Solo lo que la página dice.** Marcar como `FAQPage` algo que no está
 *    escrito arriba es exactamente lo que penaliza Google, y con razón: el
 *    dato estructurado tiene que ser el mismo contenido, no uno paralelo.
 *  - **Sin `aggregateRating` ni reseñas inventadas.** No tenemos reseñas
 *    verificables; declararlas es pedir una penalización manual.
 *
 * Va en un `<script type="application/ld+json">` dentro del cuerpo, que es la
 * forma que Next recomienda para App Router.
 */

import { CONTACTO } from './_piezas';
import { SITIO_PUBLICO, urlDelSitio } from '@/lib/config/enlaces';

const ORGANIZACION = {
  '@type': 'Organization',
  '@id': `${SITIO_PUBLICO}/#organizacion`,
  name: 'Zero',
  url: SITIO_PUBLICO,
  logo: urlDelSitio('/marca/zero-horizontal-azul.svg'),
  email: CONTACTO.ventas,
  telephone: CONTACTO.telefono,
  areaServed: { '@type': 'Country', name: 'República Dominicana' },
  address: { '@type': 'PostalAddress', addressCountry: 'DO', addressLocality: 'Santo Domingo' },
  // Un asistente que contesta «¿a quién le escribo?» saca el dato de aquí.
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'sales',
      telephone: CONTACTO.telefono,
      email: CONTACTO.ventas,
      areaServed: 'DO',
      availableLanguage: ['Spanish'],
    },
    {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: CONTACTO.soporte,
      areaServed: 'DO',
      availableLanguage: ['Spanish'],
    },
  ],
} as const;

function Json({ datos }: { datos: object }) {
  return (
    <script
      type="application/ld+json"
      // El contenido es nuestro y se arma aquí, no llega de fuera: no hay nada
      // que un tercero pueda inyectar. Se escapa `<` de todos modos, que es lo
      // único que podría cerrar la etiqueta antes de tiempo.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, '\\u003c') }}
    />
  );
}

/** La empresa y el sitio. Va una sola vez, en la portada. */
export function DatosDelSitio() {
  return (
    <Json
      datos={{
        '@context': 'https://schema.org',
        '@graph': [
          ORGANIZACION,
          {
            '@type': 'WebSite',
            '@id': `${SITIO_PUBLICO}/#sitio`,
            url: SITIO_PUBLICO,
            name: 'Zero',
            inLanguage: 'es-DO',
            publisher: { '@id': `${SITIO_PUBLICO}/#organizacion` },
          },
        ],
      }}
    />
  );
}

/**
 * Un producto de la plataforma.
 *
 * `SoftwareApplication` y no `Product`: lo que se vende es software de
 * negocio, y es la categoría por la que un asistente lo encuentra cuando le
 * preguntan por un sistema, no por un artículo de tienda.
 */
export function DatosDeProducto({
  nombre, descripcion, ruta, captura, precioDesde, precioHasta, funciones,
}: {
  nombre: string;
  descripcion: string;
  ruta: string;
  captura?: string;
  /** En dólares al mes. Se omite cuando la línea se cotiza. */
  precioDesde?: number | null;
  /** El techo del rango. Con los dos, se declara `AggregateOffer`. */
  precioHasta?: number | null;
  funciones: readonly string[];
}) {
  return (
    <Json
      datos={{
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: nombre,
        description: descripcion,
        url: urlDelSitio(ruta),
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'es-DO',
        featureList: [...funciones],
        ...(captura ? { screenshot: urlDelSitio(captura) } : {}),
        publisher: { '@id': `${SITIO_PUBLICO}/#organizacion` },
        ...(precioDesde != null
          ? {
            offers: precioHasta != null && precioHasta !== precioDesde
              ? {
                '@type': 'AggregateOffer',
                lowPrice: precioDesde,
                highPrice: precioHasta,
                priceCurrency: 'USD',
                offerCount: 4,
                availability: 'https://schema.org/InStock',
                url: urlDelSitio('/precios'),
              }
              : {
                '@type': 'Offer',
                price: precioDesde,
                priceCurrency: 'USD',
                availability: 'https://schema.org/InStock',
                url: urlDelSitio('/precios'),
              },
          }
          : {}),
      }}
    />
  );
}

/**
 * Las preguntas de una página, tal como están escritas en ella.
 *
 * Solo para acordeones cuyo texto se pinta en el HTML aunque esté plegado —el
 * nuestro lo hace—. Marcar como pregunta algo que solo existe al abrirlo es
 * declarar contenido que el robot no ve.
 */
export function DatosDePreguntas({
  preguntas,
}: {
  preguntas: readonly { pregunta: string; respuesta: string }[];
}) {
  return (
    <Json
      datos={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: preguntas.map(p => ({
          '@type': 'Question',
          name: p.pregunta,
          acceptedAnswer: { '@type': 'Answer', text: p.respuesta },
        })),
      }}
    />
  );
}

/**
 * Las migas de pan de una página interior.
 *
 * Es lo que hace que en el resultado salga «zero.com.do › Productos › Nómina»
 * en vez de la dirección cruda, y lo que le dice a un asistente dónde encaja
 * esta página dentro del sitio.
 */
export function DatosDeRuta({ migas }: { migas: readonly { nombre: string; ruta: string }[] }) {
  return (
    <Json
      datos={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITIO_PUBLICO },
          ...migas.map((m, i) => ({
            '@type': 'ListItem',
            position: i + 2,
            name: m.nombre,
            item: urlDelSitio(m.ruta),
          })),
        ],
      }}
    />
  );
}

/**
 * Una guía, declarada como artículo.
 *
 * `Article` y no `BlogPosting`: no es un blog con opinión, es documentación de
 * un trámite. `dateModified` importa más que la fecha de publicación —para una
 * guía fiscal, lo que el lector y el buscador quieren saber es si sigue
 * vigente— y por eso se declara siempre.
 */
export function DatosDeArticulo({
  titulo, descripcion, ruta, actualizada,
}: {
  titulo: string;
  descripcion: string;
  ruta: string;
  /** ISO (YYYY-MM-DD). */
  actualizada: string;
}) {
  return (
    <Json
      datos={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: titulo,
        description: descripcion,
        url: urlDelSitio(ruta),
        inLanguage: 'es-DO',
        dateModified: actualizada,
        datePublished: actualizada,
        author: { '@id': `${SITIO_PUBLICO}/#organizacion` },
        publisher: { '@id': `${SITIO_PUBLICO}/#organizacion` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': urlDelSitio(ruta) },
      }}
    />
  );
}
