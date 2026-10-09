import type { MetadataRoute } from 'next';

// Web App Manifest (PWA). Permite instalar EmiteDO como app con ícono en
// escritorio/celular. Next lo sirve en /manifest.webmanifest y auto-inyecta
// el <link rel="manifest"> en el <head>.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zero — Facturación Electrónica',
    short_name: 'Zero',
    description:
      'Emite Comprobantes Fiscales Electrónicos (e-CF) integrados con la DGII.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3658e1',
    lang: 'es',
    dir: 'ltr',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
