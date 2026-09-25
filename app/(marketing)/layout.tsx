/**
 * Sitio público de Zero — la raíz del dominio (zero.com.do).
 *
 * Grupo de rutas aparte de `(dashboard)` porque aquí NO hay sesión: ninguna de
 * estas páginas puede llamar a `getUser()` ni consultar la base de datos por
 * petición. Quien entra es alguien que todavía no es cliente.
 *
 * El reparto por host lo hace `proxy.ts` y está escrito en
 * `docs/despliegue-subdominios.md`: los subdominios de la aplicación
 * (`app.`, `facturacion.`, `pos.`, `colegio.`) sacan la raíz de aquí antes de
 * llegar; lo que queda en `/` es esto.
 */

import type { Metadata } from 'next';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { CabeceraMarketing } from './_cabecera';
import { PieMarketing } from './_pie';

export const metadata: Metadata = {
  /**
   * La base de todo enlace absoluto que Next escriba en los metadatos.
   *
   * Sin ella, `canonical: '/precios'` sale relativo y Google lo resuelve
   * contra el host por el que entró el robot —que aquí son siete alias del
   * mismo despliegue— y termina indexando la misma página varias veces.
   */
  metadataBase: new URL(SITIO_PUBLICO),
  title: {
    default: 'Zero — ERP, CRM con inteligencia artificial y facturación electrónica en República Dominicana',
    template: '%s · Zero',
  },
  description:
    'Plataforma dominicana: ERP con facturación electrónica certificada ante la DGII, CRM con agentes de inteligencia artificial que atienden por WhatsApp y teléfono, punto de venta, nómina y gestión de colegios.',
  applicationName: 'Zero',
  // Las palabras no son un ranking —Google las ignora hace años— pero sí las
  // leen los asistentes de IA cuando resumen de qué va un sitio, y es lo que
  // hoy trae gente que pregunta «CRM con IA en República Dominicana».
  keywords: [
    'ERP República Dominicana', 'facturación electrónica e-CF', 'DGII comprobante fiscal electrónico',
    'CRM con inteligencia artificial', 'agentes de IA WhatsApp', 'chatbot con IA para empresas',
    'punto de venta', 'software de nómina TSS', 'sistema para colegios', 'sistema de tickets',
    'sistema de turnos', 'software dominicano',
  ],
  authors: [{ name: 'Zero' }],
  creator: 'Zero',
  publisher: 'Zero',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Zero',
    locale: 'es_DO',
    url: SITIO_PUBLICO,
    title: 'Zero — ERP, CRM con inteligencia artificial y facturación electrónica',
    description:
      'Facturación e-CF ante la DGII, cobros, inventario, contabilidad, punto de venta, nómina y un CRM con agentes de IA que contestan por WhatsApp, correo, web y teléfono.',
    images: [{ url: '/home/capturas/demo-facturacion.png', width: 1440, height: 900, alt: 'Panel de Zero' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zero — ERP, CRM con IA y facturación electrónica',
    description: 'La plataforma dominicana para facturar, cobrar, vender, pagar nómina y atender clientes con inteligencia artificial.',
    images: ['/home/capturas/demo-facturacion.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  category: 'technology',
  /**
   * La verificación de Search Console y Bing, por variable de entorno.
   *
   * Se hace así y no con el archivo HTML que ofrece Google porque el código
   * cambia si alguien rehace la propiedad, y con esto no hay que tocar el
   * repositorio: se pone `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` en Vercel y
   * sale la etiqueta. Sin la variable no se pinta nada —una etiqueta de
   * verificación vacía es peor que ninguna—.
   *
   * La otra vía, sin código, es un TXT en el DNS de midominio.do; sirve igual y
   * cubre todos los subdominios de una vez.
   */
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } }
      : {}),
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    // `overflow-x-hidden`: varias secciones sacan el lazo de marca fuera de su
    // caja a propósito y sin esto el móvil gana una barra horizontal.
    // `sitio-publico` acota los estilos de foco y de aparición de globals.css a
    // estas páginas: la aplicación tiene los suyos.
    <div className="sitio-publico flex min-h-[100dvh] flex-col overflow-x-hidden bg-white text-[#0f1118]">
      <CabeceraMarketing />
      <main className="flex-1">{children}</main>
      <PieMarketing />
      <GoogleAnalytics />
    </div>
  );
}
