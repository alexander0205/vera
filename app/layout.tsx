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
import { RastreadorDeNavegacion } from '@/lib/hooks/useVolver';
import { TicketWidgetGate } from '@/components/support/ticket-widget-gate';

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
      /* `ScriptTapaLlegada` escribe `data-abriendo-modulo` aquí ANTES de que
         React hidrate —ese es justo su propósito: tapar la pantalla sin
         esperar a React—. El servidor no lo pone, así que React ve un atributo
         que no esperaba y avisa. Es el caso para el que existe esto, el mismo
         patrón que usan los temas claro/oscuro. Solo afecta a este elemento;
         no silencia nada de dentro. */
      suppressHydrationWarning
    >
      <body className="min-h-[100dvh] bg-gray-50">
        {/* Antes que nada: si se viene de otro módulo, tapa la pantalla ya,
            sin esperar a que React hidrate. */}
        <ScriptTapaLlegada />
        {/* Lleva la cuenta de las navegaciones dentro de la app para que los
            botones de volver puedan retroceder por el historial en vez de
            empujar siempre su ruta fija. No pinta nada. */}
        <RastreadorDeNavegacion />
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
              <TicketWidgetGate />
            </SWRConfig>
          </MuiProviders>
        </AppRouterCacheProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
