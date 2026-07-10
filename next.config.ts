import type { NextConfig } from 'next';
import { readFileSync } from 'fs';
import { validateEnv } from './lib/env';

validateEnv();

// Versión del sistema (package.json) — expuesta al cliente para mostrar en el nav.
const appVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version ?? '0.0.0';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://api.stripe.com https://ecf-api.zero.com.do; frame-src 'self' blob: https://js.stripe.com; object-src 'none'; base-uri 'self'",
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
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
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
