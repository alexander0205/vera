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
 */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.zero.com.do https://api.stripe.com; frame-src 'self' blob: https://js.stripe.com; object-src 'none'; base-uri 'self'",
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
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
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
