/**
 * Piezas compartidas del sitio público.
 *
 * Sin `'use client'` a propósito: casi todo aquí es marcado estático y así
 * puede renderizarse en el servidor. Lo que necesita estado —el menú del móvil,
 * el acordeón, el comparador— vive en sus propios archivos con la directiva.
 *
 * Los colores van como valores literales y no como tokens de Tailwind porque el
 * sitio público tiene su propia paleta: el azul de marca sí es `zero-600`, pero
 * el marino de los bloques oscuros (#102A72) y los grises de los bordes no
 * existen en la escala de la aplicación y meterlos allí los ataría a decisiones
 * de producto que no son suyas.
 */

import Link from 'next/link';
import { LazoZero } from '@/lib/marca/isotipo';

// ─── Datos de contacto reales ────────────────────────────────────────────────
// Un solo sitio: estos números salen en la cabecera, en el pie, en las tarjetas
// y en tres llamados a la acción. Escritos a mano en cada uno, el día que
// cambie el WhatsApp quedarían cuatro viejos y uno nuevo.

export const CONTACTO = {
  ventas: 'hola@zero.com.do',
  soporte: 'soporte@zero.com.do',
  telefono: '809 473 1859',
  telefonoHref: 'tel:+18094731859',
  whatsapp: '809 758 0266',
  whatsappHref: 'https://wa.me/18097580266',
  horarioVentas: 'Lunes a viernes, 8:00 a 17:00',
  horarioSoporte: 'Todos los días, 7:00 a 24:00',
} as const;

// ─── Estructura ──────────────────────────────────────────────────────────────

/** El ancho de columna del sitio. La maqueta está pensada a 1180 px. */
export function Contenedor({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1180px] px-5 sm:px-8 ${className}`}>{children}</div>
  );
}

/**
 * El lazo gigantesco de fondo, la textura que sostiene las tres portadas.
 *
 * Se mide POR ANCHO, no por alto, y es la diferencia entre que se vea o no.
 * La maqueta lo pone en `width:140vw; min-width:1600px`: más ancho que la
 * ventana, para que el lazo se salga por los dos lados y se lea como una
 * marca de agua enorme detrás del titular. Atado a un alto fijo daba ~1.000px
 * y quedaba como un adorno centrado — que es justo lo que no es.
 *
 * `140vw` crece con la pantalla; `min-width` es el suelo, para que en un
 * portátil estrecho no se encoja hasta desaparecer. `max-width: none` porque
 * cualquier regla heredada de contenedor lo volvería a encoger.
 *
 * `aria-hidden` y `pointer-events-none`: es textura, no información. Se ancla
 * al centro y se sale del contenedor a propósito, por eso la sección que lo
 * usa necesita `overflow-hidden`.
 */
export function LazoDeFondo({
  arriba = 360,
  ancho = '132vw',
  anchoMinimo = 1500,
  opacidad = 0.055,
}: {
  arriba?: number;
  ancho?: string;
  anchoMinimo?: number;
  opacidad?: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block"
      style={{ top: arriba, width: ancho, minWidth: anchoMinimo, maxWidth: 'none', opacity: opacidad }}
    >
      {/* El `alto` que recibe es irrelevante: `w-full h-auto` pisa los
          atributos del SVG y manda el ancho del contenedor. Va un valor
          cualquiera porque la prop es obligatoria por firma, no por efecto. */}
      <LazoZero alto={1} className="h-auto w-full" />
    </div>
  );
}

// ─── Iconografía ─────────────────────────────────────────────────────────────
// Trazos propios en vez de lucide-react: la maqueta dibuja el recibo, el carrito
// y el birrete con un grosor de 1.9 que ningún set genérico reproduce, y en una
// portada el icono es marca, no adorno funcional.

type PropsIcono = { tamano?: number; className?: string; grosor?: number };

function Trazo({
  d,
  tamano = 18,
  className,
  grosor = 1.9,
}: PropsIcono & { d: React.ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {d}
    </svg>
  );
}

export const Iconos = {
  factura: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M6 2.8h8.5L19 7.4V21H6z" /><path d="M14 2.8v5h5" /><path d="M9 12.5h7M9 16.5h5" /></>} />
  ),
  pos: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M2.5 3.5h2.2l2.6 11.3h10.4" /><path d="M6.4 6.6h14L18.4 12H7.6" /><circle cx="9" cy="19.5" r="1.6" /><circle cx="17" cy="19.5" r="1.6" /></>} />
  ),
  administracion: (p: PropsIcono) => (
    <Trazo {...p} d={<><circle cx="9.5" cy="8" r="3.4" /><path d="M3.5 20c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6" /><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M18 14.9c1.7.7 2.9 2.3 2.9 4.4" /></>} />
  ),
  contabilidad: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M5 3.5h14v17H5z" /><path d="M8.5 8h7M8.5 12h3M8.5 16h3M14.5 12v4M12.5 14h4" /></>} />
  ),
  colegio: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M2.5 8.6 12 4.2l9.5 4.4L12 13z" /><path d="M6.2 10.8v5.4c0 1.6 2.6 2.9 5.8 2.9s5.8-1.3 5.8-2.9v-5.4" /><path d="M21.5 8.6v5.6" /></>} />
  ),
  reportes: (p: PropsIcono) => (
    <Trazo {...p} d={<path d="M4 20V9M10 20V4M16 20v-7M22 20H2" />} />
  ),
  dinero: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M12 3v18" /><path d="M16.5 7.2c-.9-1.4-2.5-2.2-4.5-2.2-2.5 0-4.2 1.3-4.2 3.2 0 2 1.7 2.9 4.5 3.5 3 .7 4.6 1.6 4.6 3.6 0 2.1-1.9 3.4-4.7 3.4-2.3 0-4.1-.9-5-2.5" /></>} />
  ),
  reloj: (p: PropsIcono) => (
    <Trazo {...p} d={<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>} />
  ),
  crecer: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M3.5 16.5 9 11l4 4 7.5-7.5" /><path d="M15 7.5h5.5V13" /></>} />
  ),
  engranaje: (p: PropsIcono) => (
    <Trazo {...p} d={<><circle cx="12" cy="12" r="3.1" /><path d="M12 2.6v2.6M12 18.8v2.6M4.6 12H2M22 12h-2.6M6.4 6.4 4.6 4.6M19.4 19.4l-1.8-1.8M17.6 6.4l1.8-1.8M4.6 19.4l1.8-1.8" /></>} />
  ),
  escudo: (p: PropsIcono) => (
    <Trazo {...p} d={<path d="M12 2.8 4.5 5.6v6.1c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V5.6z" />} />
  ),
  correo: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M3.5 6h17v12h-17z" /><path d="m3.5 6.6 8.5 6.4L20.5 6.6" /></>} />
  ),
  soporte: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M4.5 13.5v-1.5a7.5 7.5 0 0 1 15 0v1.5" /><path d="M3.5 13.5h3V18h-3zM17.5 13.5h3V18h-3z" /><path d="M20.5 18c0 1.9-1.9 3-4 3" /></>} />
  ),
  telefono: (p: PropsIcono) => (
    <Trazo {...p} d={<path d="M6.5 3.5h3l1.5 4-2 1.5c.8 2.4 2.6 4.2 5 5l1.5-2 4 1.5v3c0 1.1-.9 2-2 2C11 22.5 2.5 14 2.5 5.5c0-1.1.9-2 2-2z" />} />
  ),
  sms: (p: PropsIcono) => (
    <Trazo {...p} grosor={2} d={<><path d="M4 5.5h16v11H9l-5 4z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></>} />
  ),
  base: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M12 3.5c4 0 7 1.2 7 2.7S16 8.9 12 8.9 5 7.7 5 6.2s3-2.7 7-2.7z" /><path d="M5 6.2v11.6c0 1.5 3 2.7 7 2.7s7-1.2 7-2.7V6.2" /></>} />
  ),
  hoja: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M4.5 4h15v16h-15z" /><path d="M4.5 9h15M4.5 14.5h15M10 4v16M15 4v16" /></>} />
  ),
  papel: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M6 2.8h8.5L19 7.4V21H6z" /><path d="M14 2.8v5h5" /><path d="M9 12.5h6M9 16.5h4" /></>} />
  ),
  tienda: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M3.5 9.5 5 4.5h14l1.5 5" /><path d="M4.5 9.5h15V20h-15z" /><path d="M9.5 20v-5.5h5V20" /></>} />
  ),
  cuadros: (p: PropsIcono) => (
    <Trazo {...p} d={<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />} />
  ),
  tarjeta: (p: PropsIcono) => (
    <Trazo {...p} d={<><path d="M2.5 7.5h19v10h-19z" /><path d="M2.5 11h19" /><path d="M6 14.5h3" /></>} />
  ),
  usuarios: (p: PropsIcono) => (
    <Trazo {...p} d={<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3.2 2.5-5.3 5.5-5.3s5.5 2.1 5.5 5.3" /><path d="M17 4.5v5M14.5 7h5" /></>} />
  ),
};

export function Flecha({ tamano = 15, className }: { tamano?: number; className?: string }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ''}`}
      aria-hidden
    >
      <path d="M4.5 12h14" />
      <path d="m13 6.5 5.5 5.5L13 17.5" />
    </svg>
  );
}

export function Cheque({
  tamano = 14,
  color = 'currentColor',
  grosor = 2.8,
  className,
}: {
  tamano?: number;
  color?: string;
  grosor?: number;
  className?: string;
}) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ''}`}
      aria-hidden
    >
      <path d="M4.5 12.5 9.5 17.5 19.5 7" />
    </svg>
  );
}

export function IconoWhatsApp({ tamano = 15, className }: { tamano?: number; className?: string }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${className ?? ''}`} aria-hidden>
      <path d="M12 2.8a9.1 9.1 0 0 0-7.8 13.8L3 21.5l5-1.3A9.1 9.1 0 1 0 12 2.8zm4.6 12.6c-.2.6-1.2 1.1-1.7 1.1-.5 0-1.9-.2-3.9-1.7-2-1.5-2.8-3.3-2.9-3.6-.1-.3-.5-1.4.1-2.2.3-.4.7-.6.9-.6h.6c.2 0 .3.3.4.5l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3-.1.5.2.4.7 1.1 1.3 1.6.7.6 1.4.9 1.7 1 .2.1.4 0 .5-.1l.6-.7c.1-.2.3-.2.5-.1l1.4.7c.2.1.3.2.3.4.1.3 0 .6-.1.8z" />
    </svg>
  );
}

// ─── Bloques reutilizados entre páginas ──────────────────────────────────────

/**
 * Las cuatro vías de contacto. Todas son enlaces que funcionan de verdad
 * (`mailto:`, `tel:`, `wa.me`); ninguna abre un formulario que no existe.
 */
export function TarjetasContacto() {
  const base =
    'block rounded-2xl border bg-white p-5 transition hover:shadow-[0_14px_30px_-20px_rgba(16,42,114,.26)]';
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <a href={`mailto:${CONTACTO.ventas}`} className={`${base} border-[#e9ebf3] hover:border-zero-600`}>
        <span className="grid size-8 place-items-center rounded-[9px] bg-[#edf1fe] text-[#2a48c4]">
          <Iconos.correo tamano={15} />
        </span>
        <span className="mt-3 block text-[11px] font-semibold uppercase tracking-[.5px] text-gray-500">Ventas</span>
        <span className="mt-1 block font-[family-name:var(--font-display)] text-[13.5px] font-semibold text-[#0f1118]">{CONTACTO.ventas}</span>
        <span className="mt-1.5 block text-[11.5px] text-gray-500">{CONTACTO.horarioVentas}</span>
      </a>

      <a href={`mailto:${CONTACTO.soporte}`} className={`${base} border-[#e9ebf3] hover:border-zero-600`}>
        <span className="grid size-8 place-items-center rounded-[9px] bg-[#edf1fe] text-[#2a48c4]">
          <Iconos.soporte tamano={15} />
        </span>
        <span className="mt-3 block text-[11px] font-semibold uppercase tracking-[.5px] text-gray-500">Soporte</span>
        <span className="mt-1 block font-[family-name:var(--font-display)] text-[13.5px] font-semibold text-[#0f1118]">{CONTACTO.soporte}</span>
        <span className="mt-1.5 block text-[11.5px] text-gray-500">{CONTACTO.horarioSoporte}</span>
      </a>

      <a href={CONTACTO.telefonoHref} className={`${base} border-[#e9ebf3] hover:border-zero-600`}>
        <span className="grid size-8 place-items-center rounded-[9px] bg-[#edf1fe] text-[#2a48c4]">
          <Iconos.telefono tamano={15} />
        </span>
        <span className="mt-3 block text-[11px] font-semibold uppercase tracking-[.5px] text-gray-500">Teléfono</span>
        <span className="mt-1 block font-[family-name:var(--font-display)] text-[13.5px] font-semibold tabular-nums text-[#0f1118]">{CONTACTO.telefono}</span>
        <span className="mt-1.5 block text-[11.5px] text-gray-500">Oficina, lunes a viernes</span>
      </a>

      <a
        href={CONTACTO.whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} border-[#dceee2] hover:border-[#25a366]`}
      >
        <span className="grid size-8 place-items-center rounded-[9px] bg-[#e8f6ee] text-[#25a366]">
          <IconoWhatsApp />
        </span>
        <span className="mt-3 block text-[11px] font-semibold uppercase tracking-[.5px] text-gray-500">WhatsApp</span>
        <span className="mt-1 block font-[family-name:var(--font-display)] text-[13.5px] font-semibold tabular-nums text-[#0f1118]">{CONTACTO.whatsapp}</span>
        <span className="mt-1.5 block text-[11.5px] text-gray-500">Respuesta más rápida</span>
      </a>
    </div>
  );
}

/** El bloque azul de cierre. Cambia el texto y el destino, no la forma. */
export function LlamadoFinal({
  titulo,
  detalle,
  accion,
  href,
  externo = false,
}: {
  titulo: string;
  detalle: string;
  accion: string;
  href: string;
  externo?: boolean;
}) {
  const boton = (
    <span className="flex h-11 shrink-0 items-center rounded-xl bg-white px-6 font-[family-name:var(--font-display)] text-sm font-semibold text-[#102a72] transition hover:-translate-y-0.5">
      {accion}
    </span>
  );
  return (
    <div className="relative flex flex-col items-start gap-5 overflow-hidden rounded-2xl bg-zero-600 p-7 sm:flex-row sm:items-center sm:gap-6">
      <div aria-hidden className="pointer-events-none absolute -bottom-14 left-[40%] opacity-[.09]">
        <LazoZero alto={120} color="#ffffff" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marca/zero-app-blanco.svg"
        alt=""
        aria-hidden
        className="relative size-14 shrink-0 rounded-2xl"
      />
      <div className="relative min-w-0 flex-1">
        <p className="font-[family-name:var(--font-display)] text-[22px] font-semibold leading-tight tracking-[-.7px] text-white">
          {titulo}
        </p>
        <p className="mt-1.5 text-[13.5px] text-white/80">{detalle}</p>
      </div>
      <div className="relative">
        {externo ? (
          <a href={href} target="_blank" rel="noopener noreferrer">{boton}</a>
        ) : (
          <Link href={href}>{boton}</Link>
        )}
      </div>
    </div>
  );
}
