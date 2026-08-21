import type { NextConfig } from 'next';
import { readFileSync } from 'fs';
import { validateEnv } from './lib/env';

validateEnv();

// Versión del sistema (package.json) — expuesta al cliente para mostrar en el nav.
const appVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version ?? '0.0.0';

/**
 * `font-src` — las tipografías van embebidas como `data:` URI, y sin esta
 * directiva caían en `default-src 'self'`, que no las admite: el navegador las
 * bloqueaba y la interfaz se pintaba con la fuente del sistema.
 *
 * `connect-src` con `*.zero.com.do` — el sistema vive repartido en varios
 * subdominios (app, facturacion, pos, colegio) y el proxy manda cada ruta al
 * suyo. Cuando Next precarga un enlace a otro módulo —`/cuenta` desde el panel
 * de facturación, por ejemplo— hace un fetch que termina en una redirección a
 * otro host, y con `'self'` a secas el navegador la bloquea. No es un fallo
 * cosmético: la precarga es la que hace que navegar entre módulos sea
 * instantáneo.
 *
 * `googletagmanager.com` y `google-analytics.com` — Google Analytics, que se
 * carga SOLO en la web pública (ver `components/analytics/google-analytics.tsx`).
 * La cabecera es una sola para todo el sitio, así que la lista permite el
 * origen en todas partes; lo que decide dónde se mide es dónde se monta la
 * etiqueta, y no está montada en el panel ni en las rutas con token.
 *
 * `worker-src blob:` — sin `worker-src` propio, un Worker cae a `script-src`,
 * que no admite `blob:`. `modern-screenshot` (captura de pantalla del chat de
 * soporte) crea su worker desde una blob: URL; sin esto el navegador lo
 * bloquea y la librería cae a un fallback que exporta el canvas en negro.
 *
 * `microphone=(self), display-capture=(self)` — la videollamada de soporte
 * (docs/superpowers/specs/2026-08-20-videollamada-soporte-design.md) pide
 * getUserMedia (audio) y getDisplayMedia (pantalla). Sin esto el navegador
 * bloquea ambos de raíz, antes de que el código llegue a pedir permiso. La
 * cámara se queda cerrada — no la usa nada de este feature.
 *
 * `stun: turn: turns:` en connect-src — los navegadores tratan las
 * conexiones ICE de WebRTC como sujetas a connect-src; sin estos esquemas
 * ahí, la conexión a los servidores STUN/TURN se bloquea.
 */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.zero.com.do https://api.stripe.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com stun: turn: turns:; frame-src 'self' blob: https://js.stripe.com; object-src 'none'; base-uri 'self'",
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // `camera=()` (deshabilitada del todo) tira "Permissions policy
    // violation: camera is not allowed in this document" al llamar
    // getDisplayMedia — este Chromium liga compartir pantalla a la misma
    // política de cámara, aunque no se pida video de cámara en ningún
    // momento. `camera=(self)` no prende la cámara sola ni evita el
    // permiso del navegador; solo deja que ESTE origen pueda pedirlo.
    value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
  },
];

const nextConfig: NextConfig = {

  /**
   * `/pricing` era una TERCERA pantalla de planes, heredada del template.
   *
   * Las buenas son `/precios` (la web pública) y `/dashboard/suscripcion` (la
   * de dentro, que es donde de verdad se elige). `/pricing` no solo repetía:
   * mandaba siempre al checkout, así que a una empresa que nunca tuvo plan le
   * pedía tarjeta en lugar de abrirle la prueba —que es lo que hace la buena
   * con `empezarPruebaAction`.
   *
   * Se borró la página y queda esta redirección porque hay enlaces vivos que no
   * se pueden reescribir: el `cancel_url` de sesiones de Stripe ya abiertas, y
   * el `urlUpgrade` que la API de emisión ya devolvió a quien tocó su límite.
   * Permanente, que es lo que es.
   */
  async redirects() {
    return [
      { source: '/pricing', destination: '/dashboard/suscripcion', permanent: true },
    ];
  },
  // Desactivar el indicador de dev para evitar conflicto con extensiones del browser
  devIndicators: false,
  // pdf-parse / pdfjs-dist cargan su worker desde node_modules en runtime;
  // si Next los bundlea, el worker no se resuelve. Mantenerlos externos.
  //
  // sharp va acá por lo mismo pero con una vuelta más: resuelve su binario
  // nativo (@img/sharp-linux-x64 + libvips) en tiempo de ejecución, así que
  // bundlearlo lo rompe. Ver también outputFileTracingIncludes abajo.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'sharp'],

  // El trazado estático no siempre sigue las dependencias opcionales por
  // plataforma de sharp, y sin ellas la función arranca sin el binario: en
  // producción las miniaturas de los comprobantes dejaron de generarse en
  // silencio. Se fuerza su copia para las rutas que las usan.
  // Se apunta al directorio REAL de cada paquete dentro del store de pnpm. Un
  // glob más ancho (…@img+sharp-linux-x64*/**) también arrastra los symlinks
  // que cada paquete tiene hacia los otros, y Vercel rechaza el despliegue con
  // "invalid deployment package … files in symlinked directories".
  outputFileTracingIncludes: {
    '/api/pagos/adjuntos': [
      './node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/**',
      './node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**',
    ],
    '/api/pagos/adjuntos/[id]': [
      './node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/**',
      './node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**',
    ],
  },
  allowedDevOrigins: ['10.0.0.63', '*.trycloudflare.com', '*.ngrok-free.app', '*.ngrok.app'],
  experimental: {
    ppr: true,
    clientSegmentCache: true,
  },
  turbopack: {
    // Fijar el root para evitar warning de múltiples lockfiles
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
