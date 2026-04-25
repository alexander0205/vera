import type { NextConfig } from 'next';
import { validateEnv } from './lib/env';

validateEnv();

const nextConfig: NextConfig = {
  // Desactivar el indicador de dev para evitar conflicto con extensiones del browser
  devIndicators: false,
  experimental: {
    ppr: true,
    clientSegmentCache: true,
  },
  turbopack: {
    // Fijar el root para evitar warning de múltiples lockfiles
    root: __dirname,
  },
};

export default nextConfig;
