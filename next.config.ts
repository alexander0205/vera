import type { NextConfig } from 'next';
import { validateEnv } from './lib/env';

validateEnv();

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://api.stripe.com https://ecf-api.yisraeltech.com https://ecf-api.yisraelschool.com; frame-src https://js.stripe.com; object-src 'none'; base-uri 'self'",
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
  experimental: {
    ppr: true,
    clientSegmentCache: true,
  },
  turbopack: {
    // Fijar el root para evitar warning de múltiples lockfiles
    root: __dirname,
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
