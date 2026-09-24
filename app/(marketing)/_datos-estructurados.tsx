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
  nombre, descripcion, ruta, captura, precioDesde, funciones,
}: {
  nombre: string;
  descripcion: string;
  ruta: string;
  captura?: string;
  /** En dólares al mes. Se omite cuando la línea se cotiza. */
  precioDesde?: number | null;
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
            offers: {
              '@type': 'Offer',
              price: precioDesde,
              priceCurrency: 'USD',
              // `lowPrice` sin `highPrice` no vale: se declara como «desde».
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
