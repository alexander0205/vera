import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { Toaster } from 'sonner';
import { WebVitals } from './(dashboard)/dashboard/_web-vitals';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { MuiProviders } from '@/components/mui-providers';
import { ScriptTapaLlegada } from '@/components/loader-llegada';

export const metadata: Metadata = {
  title: 'Zero — Facturación Electrónica República Dominicana',
  description:
    'Emite Comprobantes Fiscales Electrónicos (e-CF) de forma rápida y segura. Integrado con la DGII. Cumple con la Ley 32-23.',
  applicationName: 'Zero',
  appleWebApp: {
    capable: true,
    title: 'Zero',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3658e1',
};

/**
 * Inter para el cuerpo: es la que aguanta tablas densas y textos largos sin
 * cansar. Sora queda para títulos y marca — le da el carácter de Zero, pero en
 * párrafo larga se lee peor.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const sora = Sora({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`bg-white dark:bg-gray-950 text-black dark:text-white antialiased ${inter.variable} ${sora.variable} ${inter.className}`}
    >
      <body className="min-h-[100dvh] bg-gray-50">
        {/* Antes que nada: si se viene de otro módulo, tapa la pantalla ya,
            sin esperar a que React hidrate. */}
        <ScriptTapaLlegada />
        <WebVitals />
        <AppRouterCacheProvider>
          <MuiProviders>
            <SWRConfig
              value={{
                // Perf (de main): evita re-fetch de todos los hooks en cada
                // alt-tab (default SWR: true) y dedup 30s.
                revalidateOnFocus: false,
                dedupingInterval: 30_000,
                fallback: {
                  // No await aquí — solo suspende quien lee estos datos.
                  '/api/user': getUser(),
                  '/api/team': getTeamForUser()
                }
              }}
            >
              {children}
            </SWRConfig>
          </MuiProviders>
        </AppRouterCacheProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
