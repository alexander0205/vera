import type { MetadataRoute } from 'next';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';

/**
 * Qué puede recorrer un buscador.
 *
 * Se abre el sitio público entero y se cierra la aplicación: dentro no hay nada
 * que indexar —todo pide sesión— y dejarlo abierto solo gasta rastreo y llena
 * los resultados de pantallas de inicio de sesión.
 *
 * Las rutas con secreto en la dirección NO se listan aquí a propósito.
 * `robots.txt` es público: escribir `/pagar/` es publicar que existe. No están
 * enlazadas desde ningún sitio, que es lo que de verdad las mantiene fuera.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/admin/', '/pos/', '/nomina/', '/contabilidad/', '/escolar/', '/cuenta/', '/sign-in', '/sign-up'],
    },
    sitemap: new URL('/sitemap.xml', SITIO_PUBLICO).toString(),
    host: SITIO_PUBLICO,
  };
}
