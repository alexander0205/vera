import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { Toaster } from 'sonner';
import { WebVitals } from './(dashboard)/dashboard/_web-vitals';

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
  themeColor: '#0d9488',
};

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`bg-white dark:bg-gray-950 text-black dark:text-white antialiased ${inter.variable} ${inter.className}`}
    >
      <body className="min-h-[100dvh] bg-gray-50">
        <WebVitals />
        <SWRConfig
          value={{
            fallback: {
              // We do NOT await here
              // Only components that read this data will suspend
              '/api/user': getUser(),
              '/api/team': getTeamForUser()
            }
          }}
        >
          {children}
        </SWRConfig>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
