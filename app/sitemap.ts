import type { MetadataRoute } from 'next';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { GUIAS } from '@/app/(marketing)/guias/page';

/**
 * El mapa del sitio público.
 *
 * Solo lo que un desconocido puede abrir: la portada, los productos, los
 * precios, los colegios, el contacto y lo legal. Nada de la aplicación —y
 * menos las rutas que llevan el secreto en la dirección (`/pagar/<token>`,
 * `/d/…`, `/foto/…`)—: un sitemap es una invitación a indexar, y esas páginas
 * existen justo para que no las vea nadie más que quien recibió el enlace.
 *
 * Las fechas salen del despliegue y no de un literal: una `lastModified`
 * congelada en el día que alguien escribió este archivo le dice al buscador
 * que el sitio lleva un año sin tocarse.
 */
const RUTAS = [
  { ruta: '/', prioridad: 1 },
  { ruta: '/productos/erp', prioridad: 0.9 },
  { ruta: '/productos/crm', prioridad: 0.9 },
  { ruta: '/productos/punto-de-venta', prioridad: 0.8 },
  { ruta: '/productos/nomina', prioridad: 0.8 },
  { ruta: '/productos/contabilidad', prioridad: 0.8 },
  { ruta: '/colegios', prioridad: 0.8 },
  { ruta: '/precios', prioridad: 0.9 },
  { ruta: '/guias', prioridad: 0.7 },
  { ruta: '/contacto', prioridad: 0.6 },
  { ruta: '/terminos', prioridad: 0.2 },
  { ruta: '/privacidad', prioridad: 0.2 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const cuando = new Date();
  // Las guías salen de su propia lista: una guía nueva entra al sitemap sola.
  const todas = [
    ...RUTAS,
    ...GUIAS.map(g => ({ ruta: `/guias/${g.slug}`, prioridad: 0.7 })),
  ];
  return todas.map(({ ruta, prioridad }) => ({
    url: new URL(ruta, SITIO_PUBLICO).toString(),
    lastModified: cuando,
    changeFrequency: 'weekly',
    priority: prioridad,
  }));
}
