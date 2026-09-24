/**
 * La página de colegios: la misma promesa que vendía la portada hasta que Zero
 * pasó a presentarse como el control financiero de cualquier negocio. El
 * colegio dejó de ser el titular del sitio y pasó a ser la industria con
 * página propia, que es lo que de verdad es.
 *
 * Toda cifra —los cuatro tramos, cuántos estudiantes cubre el más alto— se lee
 * de `lib/config/plans.ts`, que es el catálogo por el que se cobra, y respeta su
 * bandera: una línea «bajo cotización» no publica precio aquí tampoco.
 */

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { LazoZero } from '@/lib/marca/isotipo';
import { familiaBajoCotizacion, planesDeFamilia } from '@/lib/config/plans';
import {
  Antetitulo, BotonPrimario, BotonSecundario, Encabezado, TarjetaModulo, Titulo,
} from '../_bloques';
import { CONTACTO, Contenedor, Flecha, Iconos } from '../_piezas';
import { CicloDeCobro } from './_ciclo';
import { PreguntasProducto } from '../_producto';
import { DatosDeProducto, DatosDeRuta } from '../_datos-estructurados';
import { ResumenDePrecios } from '../_precios-resumen';

export const metadata: Metadata = {
  title: 'Software para colegios en República Dominicana — cobros, portal de padres y facturación',
  alternates: { canonical: '/colegios' },
  keywords: ['software para colegios República Dominicana', 'sistema de cobros escolar', 'portal de padres', 'facturación de mensualidades', 'gestión escolar'],
  openGraph: {
    type: 'website',
    images: [{ url: '/home/capturas/demo-colegio.png', width: 1440, height: 900, alt: 'Zero para colegios' }],
    title: 'Zero para colegios: mensualidades, mora y portal de padres',
    description: 'La mora se aplica sola, el aviso sale antes de vencer y cada mensualidad se factura con su comprobante fiscal.',
  },
  description:
    'Mensualidades, cobranza, portal de padres, contabilidad y nómina docente en un solo sistema. La gobernanza completa de tu colegio, con implementación incluida.',
};

// ─── Cifras del catálogo ──────────────────────────────────────────────────────

/** El «desde US$N» de una línea, o null si esa línea no publica precio. */
function desdeDe(familia: 'colegio' | 'ecf'): number | null {
  if (familiaBajoCotizacion(familia)) return null;
  const precios = planesDeFamilia(familia).map(p => p.price).filter(p => p > 0);
  return precios.length > 0 ? Math.min(...precios) : null;
}

const DESDE_NEGOCIO = desdeDe('ecf');
/** El tramo escolar más alto: es la promesa de techo del módulo de colegios. */
const TOPE_ESTUDIANTES = Math.max(...planesDeFamilia('colegio').map(p => p.limits.estudiantes));

/** El rango de los tramos, para declarar la oferta. Vacío si se cotizan. */
const PRECIOS_COLEGIO = familiaBajoCotizacion('colegio')
  ? []
  : planesDeFamilia('colegio').map(p => p.price).filter(p => p > 0);
const TRAMOS_DESDE = PRECIOS_COLEGIO.length > 0 ? Math.min(...PRECIOS_COLEGIO) : null;
const TRAMOS_HASTA = PRECIOS_COLEGIO.length > 0 ? Math.max(...PRECIOS_COLEGIO) : null;

// ─── Contenido ────────────────────────────────────────────────────────────────

/**
 * Los módulos que un colegio enciende con Zero. Los OCHO.
 *
 * Eran cuatro —matrícula, cobra, administra, comunica— y se quedaba corto: el
 * tramo de colegio trae la facturación e-CF, el punto de venta de la cafetería,
 * la contabilidad, la nómina del personal y el inventario, además de lo
 * escolar. Enseñar cuatro hacía parecer que el resto se compra aparte.
 */
const HERO_PILARES = [
  { nombre: 'Matrícula', icono: Iconos.colegio },
  { nombre: 'Cobros', icono: Iconos.tarjeta },
  { nombre: 'Facturación', icono: Iconos.factura },
  { nombre: 'Avisos', icono: Iconos.correo },
  { nombre: 'Contabilidad', icono: Iconos.contabilidad },
  { nombre: 'Nómina', icono: Iconos.usuarios },
  { nombre: 'Cafetería', icono: Iconos.pos },
  { nombre: 'Inventario', icono: Iconos.cuadros },
] as const;

/** Colegios que ya usan Zero. Los logos están publicados con su permiso. */
const CLIENTES = [
  { nombre: 'Colegio Andrés Bello', logo: '/home/logos/andres-bello.jpg' },
  { nombre: 'CETHA', logo: '/home/logos/cetha.png' },
  { nombre: 'CETI Yomalia', logo: '/home/logos/ceti-yomalia.png' },
  { nombre: 'Amisadai', logo: '/home/logos/amisadai.png' },
  { nombre: 'Yisrael Kids School', logo: '/home/logos/yisrael-kids-school.png' },
  { nombre: 'Mi Casita II', logo: '/home/logos/mi-casita-ii.jpg' },
] as const;

const PASOS = [
  { titulo: '1. Matricula', detalle: 'Estudiantes, cuotas, becas y descuentos en un expediente.', icono: Iconos.colegio },
  { titulo: '2. Cobra', detalle: 'Avisos, links de pago y mora que corren solos.', icono: Iconos.tarjeta },
  { titulo: '3. Administra', detalle: 'Contabilidad, nómina y compras sobre los mismos datos.', icono: Iconos.contabilidad },
  { titulo: '4. Decide', detalle: 'La dirección ve cartera, matrícula y resultados al día.', icono: Iconos.crecer },
] as const;

const MODULOS = [
  { titulo: 'Mensualidades y cobranza', detalle: 'Cuotas, mora automática y cartera por curso.', icono: Iconos.dinero },
  { titulo: 'Portal de padres', detalle: 'Estado de cuenta y pago digital sin filas en caja.', icono: Iconos.usuarios },
  { titulo: 'Contabilidad', detalle: 'Asientos automáticos y cierres al día.', icono: Iconos.contabilidad },
  { titulo: 'Nómina docente', detalle: 'TSS, regalía y vacaciones sin hojas de cálculo.', icono: Iconos.hoja },
  { titulo: 'Avisos a las familias', detalle: 'WhatsApp y correo automáticos antes de la fecha de pago.', icono: Iconos.sms },
  { titulo: 'Punto de venta', detalle: 'Cafetería, economato y uniformes con stock real.', icono: Iconos.tienda },
] as const;

const FAMILIAS = [
  { titulo: 'Estado de cuenta en vivo', detalle: 'Cuotas, becas y descuentos, siempre al día.' },
  { titulo: 'Aviso antes de la fecha', detalle: 'WhatsApp y correo automáticos, sin que nadie los envíe.' },
  { titulo: 'Pago con link', detalle: 'Tarjeta o transferencia, desde el teléfono.' },
  { titulo: 'Recibo inmediato', detalle: 'El comprobante llega solo y el saldo se actualiza al instante.' },
] as const;

const INDUSTRIAS = [
  { titulo: 'Comercio y retail', detalle: 'Tiendas, colmados y distribuidoras.', foto: '/home/fotos/31-colmado.png' },
  { titulo: 'Restaurantes y cafés', detalle: 'Controla ventas, mesas e inventario.', foto: '/home/fotos/30-restaurante.png' },
  { titulo: 'Servicios profesionales', detalle: 'Agencias, consultorías y estudios.', foto: '/home/fotos/33-agencia.png' },
  { titulo: 'Contadores y firmas', detalle: 'Varias empresas bajo un mismo cierre.', foto: '/home/fotos/35-contadora-abierto.png' },
] as const;

const EQUIPO = [
  '/home/fotos/35-contadora-abierto.png',
  '/home/fotos/33-agencia.png',
  '/home/fotos/37-abogada.png',
  '/home/fotos/13-entrenamiento.png',
] as const;

// ─── Portada ──────────────────────────────────────────────────────────────────

const PREGUNTAS = [
  {
    pregunta: '¿La mora se aplica sola?',
    respuesta: 'Sí. El colegio configura el recargo y los días una vez, y a partir de ahí entra solo cuando el cargo vence. Es lo que hoy se pierde: la mora que nadie se acordó de aplicar.',
  },
  {
    pregunta: '¿Los padres pueden pagar en línea?',
    respuesta: 'Sí. Cada familia recibe su enlace de pago por WhatsApp o correo y paga con tarjeta desde el teléfono, o sube el comprobante de su transferencia para que el colegio lo apruebe.',
  },
  {
    pregunta: '¿Cuánto cuesta el sistema para un colegio?',
    respuesta: 'Se cobra por institución según la matrícula, no por usuario: cuatro tramos desde US$135 al mes hasta 150 estudiantes, y hasta US$500 al mes hasta 800. Incluye implementación y entrenamiento.',
  },
  {
    pregunta: '¿Incluye facturación, contabilidad y nómina?',
    respuesta: 'Sí, los ocho módulos: matrícula, cobros, facturación e-CF ante la DGII, avisos a las familias, contabilidad, nómina del personal, punto de venta para la cafetería e inventario. No se compran aparte.',
  },
  {
    pregunta: '¿Los avisos salen por WhatsApp?',
    respuesta: 'Sí, y también por SMS y correo, en los tres momentos del ciclo: al emitir, al vencer y antes de que entre el recargo. Cada tramo trae su tope mensual de mensajes.',
  },
  {
    pregunta: '¿Migran la matrícula y los saldos?',
    respuesta: 'Sí. Cargamos estudiantes, responsables, cuotas y saldos pendientes, y dejamos el período escolar armado antes de que el colegio empiece a usarlo.',
  },
] as const;

export default function ColegiosPage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f4f8ff_0%,#edf3ff_42%,#ffffff_100%)]">
        <Contenedor className="relative pt-14 sm:pt-[60px]">
          <div className="relative z-[2] px-0 text-center lg:min-h-[430px] lg:px-[clamp(0px,11vw,150px)]">
            {/* Los ocho módulos flotando alrededor del titular, cuatro por
                lado. En móvil no caben sin pisar el texto: ahí van en rejilla,
                debajo. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] hidden lg:block">
              <Pilar pilar={HERO_PILARES[0]} className="left-0 top-[-6px]" />
              <Pilar pilar={HERO_PILARES[1]} className="left-[26px] top-[104px]" />
              <Pilar pilar={HERO_PILARES[2]} className="left-[26px] top-[214px]" />
              <Pilar pilar={HERO_PILARES[3]} className="left-0 top-[324px]" />
              <Pilar pilar={HERO_PILARES[4]} className="right-0 top-[-6px]" />
              <Pilar pilar={HERO_PILARES[5]} className="right-[26px] top-[104px]" />
              <Pilar pilar={HERO_PILARES[6]} className="right-[26px] top-[214px]" />
              <Pilar pilar={HERO_PILARES[7]} className="right-0 top-[324px]" />
            </div>

            <h1 className="relative z-[2] m-0 mx-auto max-w-[880px] font-[family-name:var(--font-display)] text-[clamp(2.25rem,6.2vw,3.875rem)] font-semibold leading-[1.04] tracking-[-.045em] text-balance text-[#102a72] lg:mt-9">
              La gobernanza completa de tu colegio.
            </h1>
            <p className="relative z-[2] mx-auto mt-5 max-w-[600px] text-pretty text-[17px] leading-[1.6] text-[#4a5164] sm:text-lg">
              Mensualidades, cobranza, contabilidad, nómina y comunicación con las familias en un solo sistema.
            </p>
            <div className="relative z-[2] mt-8 flex flex-wrap justify-center gap-3">
              <BotonPrimario href="/contacto">Solicita una demo</BotonPrimario>
              <BotonSecundario href="#modulos">Conoce la plataforma</BotonSecundario>
            </div>

            <ul className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-4 lg:hidden">
              {HERO_PILARES.map(p => (
                <li key={p.nombre} className="flex flex-col items-center gap-2">
                  <span className="grid size-[54px] place-items-center rounded-full border border-[#e4eaf8] bg-white text-zero-600 shadow-[0_20px_34px_-18px_rgba(16,42,114,.38)]">
                    <p.icono className="size-5" />
                  </span>
                  <span className="text-[11.5px] font-semibold text-[#3b4252]">{p.nombre}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* La pantalla del colegio de DEMOSTRACIÓN. La anterior era la ficha
              real de una estudiante, con el nombre de su responsable y su
              cédula dentro. */}
          <div className="relative mt-10 sm:mt-[52px]">
            <div className="relative mx-auto max-w-[940px]">
              <div className="rounded-t-2xl bg-[#1b2333] p-3 pb-0 shadow-[0_50px_90px_-40px_rgba(16,42,114,.55)]">
                <Image
                  src="/home/capturas/demo-colegio.png"
                  alt="Panorama del colegio en Zero: estudiantes, cartera y cobros del período"
                  width={1440}
                  height={900}
                  priority
                  className="block w-full rounded-t-lg"
                />
              </div>
              <div className="mx-auto h-[15px] max-w-[1010px] rounded-b-xl bg-[linear-gradient(180deg,#d8dee9,#aeb6c6)] shadow-[0_14px_24px_-14px_rgba(16,42,114,.45)]" />

              <figure className="absolute left-[clamp(-78px,-4vw,0px)] top-[38%] hidden w-[min(250px,30%)] rounded-2xl border border-[#e7ecf7] bg-white p-4 shadow-[0_26px_50px_-24px_rgba(16,42,114,.45)] md:block">
                <span className="grid size-[30px] place-items-center rounded-full bg-[#e6f7ee] text-[#12925a]">
                  <Iconos.dinero className="size-4" />
                </span>
                <figcaption className="mt-3 text-[11.5px] text-[#8a90a0]">Mensualidad pagada</figcaption>
                <p className="m-0 mt-0.5 font-[family-name:var(--font-display)] text-[21px] font-semibold tracking-[-.04em] text-[#102a72]">RD$8,500.00</p>
                <p className="m-0 mt-1.5 text-[11.5px] text-[#5c6373]">Familia Díaz · 4to B · hoy, 10:24</p>
              </figure>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Colegios que ya lo usan ────────────────────────────────────────── */}
      <section className="border-y border-[#eff1f7] bg-white">
        <Contenedor className="py-14 sm:py-16">
          <h2 className="m-0 text-center font-[family-name:var(--font-display)] text-[22px] font-semibold tracking-[-.035em] text-balance text-[#102a72]">
            Colegios dominicanos que ya gobiernan su operación con Zero
          </h2>
          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-8 sm:gap-x-[60px]">
            {CLIENTES.map(c => (
              <li key={c.nombre}>
                <Image
                  src={c.logo}
                  alt={c.nombre}
                  width={210}
                  height={62}
                  className="h-11 w-auto max-w-[180px] object-contain opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0 sm:h-[62px] sm:max-w-[210px]"
                />
              </li>
            ))}
          </ul>
        </Contenedor>
      </section>

      {/* ── Cómo funciona ──────────────────────────────────────────────────── */}
      <section id="como-funciona" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
            <Encabezado
              antetitulo="Cómo funciona"
              titulo="El año escolar, de principio a fin."
              detalle="De la inscripción al cierre del año, cada paso alimenta al siguiente sin volver a digitar."
              enlace={{ texto: 'Conoce el proceso', href: '#modulos' }}
            />
            <ol className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {PASOS.map((p, i) => (
                <li
                  key={p.titulo}
                  className="relative min-w-0 rounded-2xl border border-[#e9ebf3] bg-white p-5 pb-6 transition hover:-translate-y-0.5 hover:border-zero-200 hover:shadow-[0_22px_40px_-28px_rgba(16,42,114,.45)]"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-[#edf1fe] text-zero-600">
                    <p.icono className="size-[18px]" />
                  </span>
                  <h3 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[15.5px] font-semibold tracking-[-.02em] text-[#102a72]">{p.titulo}</h3>
                  <p className="m-0 mt-1.5 text-pretty text-[13px] leading-[1.58] text-[#5c6373]">{p.detalle}</p>
                  {i < PASOS.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute -right-4 top-9 z-[2] hidden size-[22px] place-items-center rounded-full border border-[#e9ebf3] bg-white text-zero-600 lg:grid"
                    >
                      <Flecha tamano={11} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </Contenedor>
      </section>

      {/* ── Módulos ────────────────────────────────────────────────────────── */}
      <section id="modulos" className="scroll-mt-20">
        <Contenedor className="mt-16">
          <div className="rounded-3xl border border-[#e7edfb] bg-[#f5f8ff] p-7 sm:p-11">
            <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
              <Encabezado
                antetitulo="Módulos"
                titulo="Una plataforma para toda la institución."
                detalle="Dirección, administración, contabilidad y familias trabajando sobre los mismos datos."
                enlace={{ texto: 'Ver la solución para colegios', href: '/contacto' }}
              />
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {MODULOS.map(m => (
                  <li
                    key={m.titulo}
                    className="flex min-w-0 gap-3.5 rounded-[15px] border border-[#e7edfb] bg-white p-5 transition hover:-translate-y-0.5 hover:border-zero-200 hover:shadow-[0_22px_40px_-28px_rgba(16,42,114,.45)]"
                  >
                    <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-[#edf1fe] text-zero-600">
                      <m.icono className="size-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-pretty font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-[#102a72]">{m.titulo}</span>
                      <span className="mt-1.5 block text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{m.detalle}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Las familias ───────────────────────────────────────────────────── */}
      <section>
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
            <div className="overflow-hidden rounded-[20px] bg-[#eef2fb] shadow-[0_34px_60px_-38px_rgba(16,42,114,.34)]">
              <Image
                src="/home/fotos/12-familia.png"
                alt="Una familia paga la mensualidad del colegio desde el teléfono"
                width={1200}
                height={990}
                className="block aspect-[4/3.3] w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <Antetitulo>Las familias, adentro</Antetitulo>
              <Titulo className="mt-3.5">Los padres ven su cuenta y pagan desde el teléfono.</Titulo>
              <p className="mt-3.5 max-w-[480px] text-pretty text-[15px] leading-[1.65] text-[#5c6373]">
                La cobranza deja de depender de llamadas: el aviso sale solo, el pago entra digital y el saldo se actualiza al instante.
              </p>
              <ul className="m-0 mt-6 grid max-w-[480px] list-none gap-3.5 p-0">
                {FAMILIAS.map(f => (
                  <li key={f.titulo} className="flex min-w-0 items-start gap-3">
                    <span className="mt-px grid size-[22px] shrink-0 place-items-center rounded-full bg-[#edf1fe] text-zero-600">
                      <Flecha tamano={11} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold text-[#102a72]">{f.titulo}</span>
                      <span className="mt-0.5 block text-pretty text-[13.5px] leading-[1.6] text-[#5c6373]">{f.detalle}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Más allá del colegio ───────────────────────────────────────────── */}
      <section id="industrias" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
            <Encabezado
              antetitulo="Más allá del colegio"
              titulo="La misma plataforma para tu negocio."
              detalle="Los módulos que gobiernan un colegio también administran un comercio, un restaurante o una oficina."
              enlace={{ texto: 'Ver todos los planes', href: '/precios' }}
            />
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
              {INDUSTRIAS.map(i => (
                <li
                  key={i.titulo}
                  className="min-w-0 overflow-hidden rounded-2xl border border-[#e9ebf3] bg-white transition hover:-translate-y-0.5 hover:border-zero-200 hover:shadow-[0_22px_40px_-28px_rgba(16,42,114,.45)]"
                >
                  <Image
                    src={i.foto}
                    alt=""
                    width={800}
                    height={600}
                    className="block aspect-[4/3] w-full bg-[#eef2fb] object-cover object-[50%_40%]"
                  />
                  <div className="p-4 pb-[18px]">
                    <h3 className="m-0 font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-[#102a72]">{i.titulo}</h3>
                    <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{i.detalle}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Contenedor>
      </section>

      {/* ── El ciclo de cobro, con sus dos finales ─────────────────────────── */}
      {/* Todo el mundo dice «cobranza automática». Aquí se camina el mes y se
          enseña qué pasa cuando la familia se atrasa, que es donde el colegio
          pierde el dinero: en la mora que nadie aplicó. */}
      <section id="ciclo" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <Encabezado
              antetitulo="El mes, por dentro"
              titulo="Qué pasa entre que se emite la mensualidad y entra el dinero."
              detalle="Elige el final: la familia que paga a tiempo y la que se atrasa. En los dos casos el colegio no persigue a nadie a mano."
            />
            <CicloDeCobro />
          </div>
        </Contenedor>
      </section>

      {/* ── Planes ─────────────────────────────────────────────────────────── */}
      <section id="planes" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          {/* Los cuatro tramos con su cifra, no un «desde». Un director
              compara contra la mensualidad que él cobra, y para eso necesita el
              tramo que le toca por matrícula, no el más barato. */}
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <div className="min-w-0">
              <Encabezado
                antetitulo="Planes de colegios"
                titulo="El tramo depende de cuántos estudiantes tienes."
                detalle={`Se cobra por institución, no por usuario —hasta ${TOPE_ESTUDIANTES.toLocaleString('es-DO')} estudiantes en el tramo más alto—, con implementación y entrenamiento incluidos.${DESDE_NEGOCIO !== null ? ` Los negocios tienen sus propios planes desde US$${DESDE_NEGOCIO}/mes.` : ''}`}
              />
              <div className="mt-6 flex flex-wrap gap-3">
                <BotonPrimario href="/contacto">Hablar con ventas</BotonPrimario>
                <BotonSecundario href="/precios">Comparar planes</BotonSecundario>
              </div>
            </div>
            <ResumenDePrecios lineas={['erp-colegio']} />
          </div>
        </Contenedor>
      </section>

      <DatosDeProducto
        nombre="Zero ERP Colegio"
        descripcion="Sistema de gestión escolar dominicano: matrícula, cargos y mensualidades con facturación e-CF ante la DGII, mora automática, avisos por WhatsApp, SMS y correo, portal de pago para los padres, contabilidad, nómina del personal y punto de venta para la cafetería."
        ruta="/colegios"
        captura="/home/capturas/demo-colegio.png"
        precioDesde={TRAMOS_DESDE}
        precioHasta={TRAMOS_HASTA}
        funciones={[
          'Matrícula y estructura académica por período',
          'Mensualidades facturadas con comprobante fiscal electrónico',
          'Mora que se aplica sola al vencer',
          'Avisos a las familias por WhatsApp, SMS y correo',
          'Portal de pago para el padre, con tarjeta o comprobante',
          'Contabilidad y nómina del personal incluidas',
          'Punto de venta para la cafetería',
        ]}
      />
      <DatosDeRuta migas={[{ nombre: 'Colegios', ruta: '/colegios' }]} />
      <PreguntasProducto preguntas={PREGUNTAS} />

      {/* ── Llamado final ──────────────────────────────────────────────────── */}
      <section>
        <Contenedor className="pb-4 pt-16 sm:pt-[82px]">
          <div className="relative overflow-hidden rounded-3xl bg-[#0b1a46] p-7 sm:p-12">
            <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-14 opacity-[.07]">
              <LazoZero alto={290} color="#ffffff" />
            </div>
            <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(280px,1.3fr)_minmax(240px,.85fr)]">
              <div className="min-w-0">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[.2em] text-white/55">Es momento de avanzar</p>
                <h2 className="m-0 mt-3.5 font-[family-name:var(--font-display)] text-[clamp(1.75rem,3.4vw,2.125rem)] font-semibold leading-[1.1] tracking-[-.045em] text-balance text-white">
                  Ordena tu colegio antes del próximo trimestre.
                </h2>
                <p className="m-0 mt-3.5 max-w-[380px] text-pretty text-[14.5px] leading-[1.65] text-white/70">
                  Una demo de 30 minutos con la cartera de tu institución. Sin compromiso y sin instalación.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-5">
                  <Link
                    href="/contacto"
                    className="flex h-12 items-center gap-2.5 rounded-xl bg-zero-600 px-6 font-[family-name:var(--font-display)] text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-zero-500"
                  >
                    Solicita una demo
                    <Flecha tamano={14} />
                  </Link>
                  <a
                    href={CONTACTO.whatsappHref}
                    className="border-b border-white/40 pb-0.5 text-[13.5px] font-semibold text-white transition hover:border-white"
                  >
                    O escríbenos por WhatsApp
                  </a>
                </div>
              </div>

              <div className="min-w-0 rounded-2xl bg-white p-5">
                <p className="m-0 font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[-.02em] text-[#102a72]">Te montamos el año escolar.</p>
                <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">
                  Un equipo dominicano carga estudiantes, cuotas y saldos por ti.
                </p>
                <div className="mt-4 flex items-center gap-2.5">
                  <span className="flex">
                    {EQUIPO.map((foto, i) => (
                      <Image
                        key={foto}
                        src={foto}
                        alt=""
                        width={68}
                        height={68}
                        className={`size-[34px] rounded-full border-2 border-white object-cover object-[50%_30%] ${i > 0 ? '-ml-2.5' : ''}`}
                      />
                    ))}
                  </span>
                  <span className="grid size-[34px] -ml-2.5 place-items-center rounded-full border-2 border-white bg-[#edf1fe] text-[11.5px] font-bold text-zero-600">+6</span>
                </div>
              </div>
            </div>
          </div>
        </Contenedor>
      </section>
    </>
  );
}

/** Uno de los cuatro pilares que flotan alrededor del titular. */
function Pilar({
  pilar, className,
}: {
  pilar: (typeof HERO_PILARES)[number];
  className: string;
}) {
  const Icono = pilar.icono;
  return (
    <div className={`absolute flex flex-col items-center gap-2.5 ${className}`}>
      <span className="grid size-[64px] place-items-center rounded-full border border-[#e4eaf8] bg-white text-zero-600 shadow-[0_20px_34px_-18px_rgba(16,42,114,.38)]">
        <Icono className="size-[23px]" />
      </span>
      <span className="text-[11.5px] font-semibold text-[#3b4252]">{pilar.nombre}</span>
    </div>
  );
}
