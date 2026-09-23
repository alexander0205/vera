/**
 * Portada del sitio público — maqueta «Zero Home v3».
 *
 * La portada entra por el colegio: es la línea que hoy se vende, y la que tiene
 * una promesa que se entiende sin explicar el producto —mensualidades, cobranza
 * y familias en un solo sistema—. El resto de industrias va después, para que
 * un comercio o un restaurante siga viendo que esto también es para él.
 *
 * Toda cifra del negocio —desde cuánto empieza un plan, cuántos estudiantes
 * cubre el tramo más alto— se lee de `lib/config/plans.ts`, que es el catálogo
 * por el que se cobra. Y se respeta su bandera: las líneas marcadas «bajo
 * cotización» NO publican precio aquí. Escribir «US$135» a mano sería prometer
 * en la portada un número que el catálogo decidió no enseñar.
 */

import Image from 'next/image';
import Link from 'next/link';
import { LazoZero } from '@/lib/marca/isotipo';
import {
  familiaBajoCotizacion, planesDeFamilia,
} from '@/lib/config/plans';
import { CONTACTO, Contenedor, Flecha, Iconos } from './_piezas';

// ─── Cifras del catálogo ──────────────────────────────────────────────────────

/** El «desde US$N» de una línea, o null si esa línea no publica precio. */
function desdeDe(familia: 'colegio' | 'ecf'): number | null {
  if (familiaBajoCotizacion(familia)) return null;
  const precios = planesDeFamilia(familia).map(p => p.price).filter(p => p > 0);
  return precios.length > 0 ? Math.min(...precios) : null;
}

const DESDE_COLEGIO = desdeDe('colegio');
const DESDE_NEGOCIO = desdeDe('ecf');
/** El tramo escolar más alto: es la promesa de techo del módulo de colegios. */
const TOPE_ESTUDIANTES = Math.max(...planesDeFamilia('colegio').map(p => p.limits.estudiantes));

// ─── Contenido ────────────────────────────────────────────────────────────────

const HERO_PILARES = [
  { nombre: 'Matrícula', icono: Iconos.colegio },
  { nombre: 'Cobra', icono: Iconos.tarjeta },
  { nombre: 'Administra', icono: Iconos.contabilidad },
  { nombre: 'Comunica', icono: Iconos.correo },
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
  { titulo: 'CRM y WhatsApp', detalle: 'Admisiones atendidas y seguidas hasta la matrícula.', icono: Iconos.sms },
  { titulo: 'Punto de venta', detalle: 'Cafetería, economato y uniformes con stock real.', icono: Iconos.tienda },
] as const;

const FAMILIAS = [
  { titulo: 'Estado de cuenta en vivo', detalle: 'Cuotas, becas y descuentos, siempre al día.' },
  { titulo: 'Aviso antes de la fecha', detalle: 'WhatsApp y correo automáticos, sin que nadie los envíe.' },
  { titulo: 'Pago con link', detalle: 'Tarjeta o transferencia, desde el teléfono.' },
  { titulo: 'Recibo inmediato', detalle: 'El comprobante llega solo y el saldo se actualiza al instante.' },
] as const;

const CIFRAS = [
  { valor: '92%', texto: 'Cartera al día en el primer año' },
  { valor: '+14,000', texto: 'Mensualidades procesadas al mes' },
  { valor: '< 1 semana', texto: 'Para montar el año escolar' },
  { valor: '4.9/5', texto: 'Satisfacción de las direcciones' },
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

// ─── Piezas de esta portada ───────────────────────────────────────────────────

function Antetitulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 text-[11px] font-semibold uppercase tracking-[.2em] text-zero-600">{children}</p>
  );
}

function Titulo({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`m-0 font-[family-name:var(--font-display)] text-[clamp(1.75rem,3.4vw,2.125rem)] font-semibold leading-[1.12] tracking-[-.04em] text-balance text-[#102a72] ${className}`}>
      {children}
    </h2>
  );
}

/** La columna izquierda que encabeza casi todas las secciones. */
function Encabezado({
  antetitulo, titulo, detalle, enlace,
}: {
  antetitulo: string;
  titulo: string;
  detalle?: string;
  enlace?: { texto: string; href: string };
}) {
  return (
    <div className="min-w-0">
      <Antetitulo>{antetitulo}</Antetitulo>
      <Titulo className="mt-3.5">{titulo}</Titulo>
      {detalle && <p className="mt-3.5 text-pretty text-[14.5px] leading-[1.65] text-[#5c6373]">{detalle}</p>}
      {enlace && (
        <Link
          href={enlace.href}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-zero-600 transition hover:text-[#102a72]"
        >
          {enlace.texto}
          <Flecha tamano={14} />
        </Link>
      )}
    </div>
  );
}

function BotonPrimario({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-[52px] items-center gap-2.5 rounded-xl bg-zero-600 px-7 font-[family-name:var(--font-display)] text-[15px] font-semibold text-white shadow-[0_18px_34px_-18px_rgba(54,88,225,.75)] transition hover:-translate-y-0.5 hover:bg-zero-700"
    >
      {children}
      <Flecha tamano={15} />
    </Link>
  );
}

function BotonSecundario({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-[52px] items-center rounded-xl border border-[#dce3f2] bg-white px-[26px] font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#102a72] transition hover:-translate-y-0.5 hover:border-zero-300"
    >
      {children}
    </Link>
  );
}

// ─── Portada ──────────────────────────────────────────────────────────────────

export default function PortadaPage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f4f8ff_0%,#edf3ff_42%,#ffffff_100%)]">
        <Contenedor className="relative pt-14 sm:pt-[60px]">
          <div className="relative z-[2] px-0 text-center lg:px-[clamp(0px,9vw,118px)]">
            {/* Los cuatro pilares flotando alrededor del titular. En móvil no
                caben sin pisar el texto: ahí van en fila, debajo. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] hidden lg:block">
              <Pilar pilar={HERO_PILARES[0]} className="left-0 top-[26px]" />
              <Pilar pilar={HERO_PILARES[1]} className="bottom-0 left-[38px]" />
              <Pilar pilar={HERO_PILARES[2]} className="right-0 top-[18px]" />
              <Pilar pilar={HERO_PILARES[3]} className="bottom-1 right-[34px]" />
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

          {/* La pantalla del sistema, con dos recortes del día a día encima. */}
          <div className="relative mt-10 sm:mt-[52px]">
            <div className="relative mx-auto max-w-[940px]">
              <div className="rounded-t-2xl bg-[#1b2333] p-3 pb-0 shadow-[0_50px_90px_-40px_rgba(16,42,114,.55)]">
                <Image
                  src="/home/capturas/zero-colegio.png"
                  alt="Panel de gobernanza escolar de Zero con cartera, cobros y matrícula"
                  width={1722}
                  height={860}
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

              <figure className="absolute right-[clamp(-72px,-4vw,0px)] top-[14%] hidden w-[min(236px,29%)] rounded-2xl border border-[#e7ecf7] bg-white p-4 shadow-[0_26px_50px_-24px_rgba(16,42,114,.45)] md:block">
                <span className="grid size-[30px] place-items-center rounded-[9px] bg-[#edf1fe] text-zero-600">
                  <Iconos.reportes className="size-4" />
                </span>
                <figcaption className="mt-3 text-[11.5px] text-[#8a90a0]">Cartera al día</figcaption>
                <p className="m-0 mt-0.5 font-[family-name:var(--font-display)] text-[21px] font-semibold tracking-[-.04em] text-[#102a72]">92%</p>
                <p className="m-0 mt-1.5 text-[11.5px] font-semibold text-[#12925a]">+11 pts vs. el año pasado</p>
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

      {/* ── Resultados ─────────────────────────────────────────────────────── */}
      <section>
        <Contenedor className="mt-16">
          <div className="rounded-3xl border border-[#e7edfb] bg-[#f5f8ff] p-7 sm:p-11">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
              <div className="min-w-0">
                <Antetitulo>Resultados reales</Antetitulo>
                <Titulo className="mt-3.5">Colegios que cobran mejor con Zero.</Titulo>
              </div>
              <dl className="m-0 grid grid-cols-2 gap-7 lg:grid-cols-4">
                {CIFRAS.map(c => (
                  <div key={c.texto} className="min-w-0">
                    <dt className="m-0 font-[family-name:var(--font-display)] text-[28px] font-semibold leading-[1.1] tracking-[-.045em] text-[#102a72]">{c.valor}</dt>
                    <dd className="m-0 mt-1.5 text-pretty text-[13px] text-[#5c6373]">{c.texto}</dd>
                  </div>
                ))}
              </dl>
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

      {/* ── Planes ─────────────────────────────────────────────────────────── */}
      <section id="planes" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="flex flex-wrap items-center justify-between gap-8 rounded-3xl border border-[#e7edfb] bg-[#f5f8ff] p-7 sm:p-11">
            <div className="min-w-0 flex-[1_1_380px]">
              <Antetitulo>Planes de colegios</Antetitulo>
              {DESDE_COLEGIO === null ? (
                <p className="m-0 mt-3.5 font-[family-name:var(--font-display)] text-[clamp(1.5rem,3vw,1.875rem)] font-semibold tracking-[-.04em] text-[#102a72]">
                  El tramo se acuerda con la dirección.
                </p>
              ) : (
                <p className="m-0 mt-3.5 flex flex-wrap items-baseline gap-2">
                  <span className="text-[15px] text-[#5c6373]">Desde</span>
                  <span className="font-[family-name:var(--font-display)] text-[46px] font-semibold tracking-[-.048em] text-[#102a72]">US${DESDE_COLEGIO}</span>
                  <span className="text-[15px] text-[#8a90a0]">/mes</span>
                </p>
              )}
              <p className="m-0 mt-3 max-w-[470px] text-pretty text-[15px] leading-[1.6] text-[#5c6373]">
                Por institución, según cantidad de estudiantes —hasta {TOPE_ESTUDIANTES.toLocaleString('es-DO')} en el tramo más alto—. Implementación y entrenamiento incluidos.
                {DESDE_NEGOCIO !== null && ` Los negocios tienen sus propios planes desde US$${DESDE_NEGOCIO}/mes.`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <BotonPrimario href="/precios">Ver precios</BotonPrimario>
              <BotonSecundario href="/contacto">Hablar con ventas</BotonSecundario>
            </div>
          </div>
        </Contenedor>
      </section>

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
      <span className="grid size-[74px] place-items-center rounded-full border border-[#e4eaf8] bg-white text-zero-600 shadow-[0_20px_34px_-18px_rgba(16,42,114,.38)]">
        <Icono className="size-[26px]" />
      </span>
      <span className="text-[11.5px] font-semibold text-[#3b4252]">{pilar.nombre}</span>
    </div>
  );
}
