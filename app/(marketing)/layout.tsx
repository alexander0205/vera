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
import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { CabeceraMarketing } from './_cabecera';
import { PieMarketing } from './_pie';

export const metadata: Metadata = {
  title: {
    default: 'Zero — Facturación electrónica, punto de venta y colegios',
    template: '%s · Zero',
  },
  // La cifra estaba escrita a mano —«Desde US$9 al mes»— y era la única del
  // sitio que no salía del catálogo. Se retira con el resto: es lo que Google
  // enseña debajo del enlace, y prometer un precio que en la página ya no está
  // es la peor forma de recibir a nadie.
  description:
    'Facturación electrónica certificada ante la DGII, punto de venta, administración, contabilidad y gestión de colegios en una sola plataforma. Sin instalación y sin contrato mínimo.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    // `overflow-x-hidden`: varias secciones sacan el lazo de marca fuera de su
    // caja a propósito y sin esto el móvil gana una barra horizontal.
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-white text-[#0f1118]">
      <CabeceraMarketing />
      <main className="flex-1">{children}</main>
      <PieMarketing />
      <GoogleAnalytics />
    </div>
  );
}
