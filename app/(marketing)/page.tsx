/**
 * Portada del sitio público — Zero como el control financiero del negocio.
 *
 * La portada entraba por el colegio y dejaba fuera a todo el que no lo es. El
 * colegio se mudó a `/colegios`, que es lo que siempre fue —una industria con
 * página propia—, y aquí entra la promesa que sirve para cualquier negocio:
 * se registra UNA vez y cae solo en la factura, el inventario, la cartera, la
 * caja y la contabilidad.
 *
 * Dos reglas de esta página:
 *
 *  - Los módulos que se anuncian son los que existen (`lib/config/modules.ts`):
 *    facturación, administración, punto de venta, contabilidad, nómina y
 *    escolar. El CRM de Zero es otra aplicación y se nombra como tal, no como
 *    un módulo de estos planes.
 *  - Ninguna cifra del negocio se escribe a mano: sale de `lib/config/plans.ts`
 *    y respeta su bandera «bajo cotización», que hoy tapa el precio.
 */

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { LazoZero } from '@/lib/marca/isotipo';
import { familiaBajoCotizacion, planesDeFamilia } from '@/lib/config/plans';
import { CONTACTO, Contenedor, Flecha, Iconos } from './_piezas';
import {
  Antetitulo, BotonPrimario, BotonSecundario, Encabezado, TarjetaModulo, Titulo,
} from './_bloques';

export const metadata: Metadata = {
  title: { absolute: 'Zero — El control financiero de tu negocio' },
  description:
    'Facturación e-CF ante la DGII, cobros, inventario, punto de venta, contabilidad y nómina en un solo sistema. Se registra una vez y cae en todos lados.',
};

// ─── Cifras del catálogo ──────────────────────────────────────────────────────

/** El «desde US$N» de una línea, o null si esa línea no publica precio. */
function desdeDe(familia: 'colegio' | 'ecf'): number | null {
  if (familiaBajoCotizacion(familia)) return null;
  const precios = planesDeFamilia(familia).map(p => p.price).filter(p => p > 0);
  return precios.length > 0 ? Math.min(...precios) : null;
}

const DESDE_NEGOCIO = desdeDe('ecf');

// ─── Contenido ────────────────────────────────────────────────────────────────

/** Lo que dice el dueño del negocio antes de conocernos. */
const FRASES = [
  'Tengo cuatro programas y ninguno habla con el otro.',
  'La nómina me la hace alguien afuera, en una hoja de cálculo.',
  'Vendo y después descubro que ese producto ya no estaba.',
  'Mando las facturas por correo, una por una.',
  'No sé quién me debe sin ponerme a sumar.',
  'El 606 y el 607 los armo a mano cada mes.',
] as const;

/** El recorrido del dinero: una venta, de principio a fin, sin cambiar de programa. */
const RECORRIDO = [
  { paso: 'Cotización', detalle: 'Se envía por correo y se convierte en factura con un clic.' },
  { paso: 'Factura e-CF', detalle: 'Firmada, enviada y validada ante la DGII desde Zero.' },
  { paso: 'PDF al cliente', detalle: 'Sale solo por correo, a nombre de tu empresa.' },
  { paso: 'Link de pago', detalle: 'El cliente paga con tarjeta y ves en qué va cada enlace.' },
  { paso: 'Cobro registrado', detalle: 'Con su comprobante adjunto y su método de pago.' },
  { paso: 'Asiento contable', detalle: 'Entra solo a la contabilidad. Nadie lo escribe.' },
] as const;

const ASIENTOS = 'Factura · Cobro · Nota de crédito · Anulación · Compra · Gasto · Depreciación · Nómina · Pago de nómina';

/** Los módulos que existen hoy en el sistema. Ver lib/config/modules.ts. */
const MODULOS = [
  { titulo: 'Facturación electrónica', detalle: 'Los diez tipos de e-CF ante la DGII, con su PDF al cliente.', icono: Iconos.factura },
  { titulo: 'Cobros y cuentas por cobrar', detalle: 'Quién te debe, cuánto y desde cuándo, con links de pago.', icono: Iconos.tarjeta },
  { titulo: 'Contabilidad', detalle: 'Asientos automáticos, estados financieros y los 606 y 607 armados.', icono: Iconos.contabilidad },
  { titulo: 'Inventario, compras y gastos', detalle: 'Stock por almacén, costo real y la factura del proveedor desde una foto.', icono: Iconos.cuadros },
  { titulo: 'Punto de venta y restaurante', detalle: 'Caja con turnos, mesas y cuadre al cierre.', icono: Iconos.pos },
  { titulo: 'Nómina', detalle: 'TSS, ISR, regalía y vacaciones, con su asiento contable.', icono: Iconos.usuarios },
] as const;

const INDUSTRIAS = [
  { titulo: 'Restaurantes y cafeterías', detalle: 'La comanda va en papel y la factura se hace después.', foto: '/home/fotos/30-restaurante.png', href: '/precios' },
  { titulo: 'Tiendas, colmados y comercios', detalle: 'Vendes rápido y el inventario se queda atrás.', foto: '/home/fotos/31-colmado.png', href: '/precios' },
  { titulo: 'Distribuidoras y mayoristas', detalle: 'Vendes a crédito y cobrar se vuelve otro trabajo.', foto: '/home/fotos/32-distribuidora.png', href: '/precios' },
  { titulo: 'Servicios y agencias', detalle: 'Igualas mensuales que se facturan a mano y cobros que se olvidan.', foto: '/home/fotos/33-agencia.png', href: '/precios' },
  { titulo: 'Contadores y firmas', detalle: 'Llevas varias empresas, cada una en un sistema distinto.', foto: '/home/fotos/35-contadora-abierto.png', href: '/precios' },
  { titulo: 'Colegios', detalle: 'Mensualidades, portal de padres y cobranza que corre sola.', foto: '/home/fotos/12-familia.png', href: '/colegios' },
] as const;

/** Clientes que ya operan sobre Zero. Los logos se publican con su permiso. */
const CLIENTES = [
  { nombre: 'Colegio Andrés Bello', logo: '/home/logos/andres-bello.jpg' },
  { nombre: 'CETHA', logo: '/home/logos/cetha.png' },
  { nombre: 'CETI Yomalia', logo: '/home/logos/ceti-yomalia.png' },
  { nombre: 'Amisadai', logo: '/home/logos/amisadai.png' },
  { nombre: 'Yisrael Kids School', logo: '/home/logos/yisrael-kids-school.png' },
  { nombre: 'Mi Casita II', logo: '/home/logos/mi-casita-ii.jpg' },
] as const;

// ─── Portada ──────────────────────────────────────────────────────────────────

export default function PortadaPage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f4f8ff_0%,#edf3ff_42%,#ffffff_100%)]">
        <Contenedor className="relative pt-14 sm:pt-[60px]">
          <div className="text-center">
            <h1 className="m-0 mx-auto max-w-[900px] font-[family-name:var(--font-display)] text-[clamp(2.25rem,6vw,3.75rem)] font-semibold leading-[1.05] tracking-[-.045em] text-balance text-[#102a72]">
              El control financiero de tu negocio, de punta a punta.
            </h1>
            <p className="mx-auto mt-5 max-w-[640px] text-pretty text-[17px] leading-[1.6] text-[#4a5164] sm:text-lg">
              Zero no es un sistema de facturación. Se registra una vez y cae donde tiene que caer: en la factura, el inventario, la cartera, la caja y la contabilidad. Al mismo tiempo.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <BotonPrimario href="/sign-up">Empieza gratis</BotonPrimario>
              <BotonSecundario href="/contacto">Habla con ventas</BotonSecundario>
            </div>
            <p className="mt-4 text-[13px] text-[#8a90a0]">
              Certificados ante la DGII · Sin instalación · Sin contrato mínimo
            </p>
          </div>

          <div className="relative mt-10 sm:mt-[52px]">
            <div className="relative mx-auto max-w-[940px]">
              <div className="rounded-t-2xl bg-[#1b2333] p-3 pb-0 shadow-[0_50px_90px_-40px_rgba(16,42,114,.55)]">
                <Image
                  src="/home/capturas/zero-facturacion.png"
                  alt="Factura electrónica emitida en Zero, con su e-NCF y el estado de la DGII"
                  width={1722}
                  height={860}
                  priority
                  className="block w-full rounded-t-lg"
                />
              </div>
              <div className="mx-auto h-[15px] max-w-[1010px] rounded-b-xl bg-[linear-gradient(180deg,#d8dee9,#aeb6c6)] shadow-[0_14px_24px_-14px_rgba(16,42,114,.45)]" />

              {/* Dos momentos del producto, no dos promesas: lo que pasa solo
                  cuando emites y cuando cobras. */}
              <figure className="absolute left-[clamp(-78px,-4vw,0px)] top-[36%] hidden w-[min(252px,30%)] rounded-2xl border border-[#e7ecf7] bg-white p-4 shadow-[0_26px_50px_-24px_rgba(16,42,114,.45)] md:block">
                <span className="grid size-[30px] place-items-center rounded-full bg-[#e6f7ee] text-[#12925a]">
                  <Iconos.escudo className="size-4" />
                </span>
                <figcaption className="mt-3 text-[11.5px] text-[#8a90a0]">Aceptado por la DGII</figcaption>
                <p className="m-0 mt-0.5 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.03em] text-[#102a72]">e-CF enviado al cliente</p>
                <p className="m-0 mt-1.5 text-[11.5px] text-[#5c6373]">Con su PDF, a nombre de tu empresa.</p>
              </figure>

              <figure className="absolute right-[clamp(-72px,-4vw,0px)] top-[14%] hidden w-[min(238px,29%)] rounded-2xl border border-[#e7ecf7] bg-white p-4 shadow-[0_26px_50px_-24px_rgba(16,42,114,.45)] md:block">
                <span className="grid size-[30px] place-items-center rounded-[9px] bg-[#edf1fe] text-zero-600">
                  <Iconos.contabilidad className="size-4" />
                </span>
                <figcaption className="mt-3 text-[11.5px] text-[#8a90a0]">Al registrar el cobro</figcaption>
                <p className="m-0 mt-0.5 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.03em] text-[#102a72]">Asiento contable creado</p>
                <p className="m-0 mt-1.5 text-[11.5px] text-[#5c6373]">Nadie lo escribe a mano.</p>
              </figure>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Quién ya lo usa ────────────────────────────────────────────────── */}
      <section className="border-y border-[#eff1f7] bg-white">
        <Contenedor className="py-12 sm:py-14">
          <h2 className="m-0 text-center font-[family-name:var(--font-display)] text-[20px] font-semibold tracking-[-.03em] text-balance text-[#102a72]">
            Empresas y colegios dominicanos ya operan sobre Zero
          </h2>
          <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-10 gap-y-8 sm:gap-x-[56px]">
            {CLIENTES.map(c => (
              <li key={c.nombre}>
                <Image
                  src={c.logo}
                  alt={c.nombre}
                  width={210}
                  height={62}
                  className="h-10 w-auto max-w-[170px] object-contain opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0 sm:h-[54px] sm:max-w-[190px]"
                />
              </li>
            ))}
          </ul>
        </Contenedor>
      </section>

      {/* ── El problema, en palabras del dueño ─────────────────────────────── */}
      <section id="problema" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
            <Encabezado
              antetitulo="Antes de Zero"
              titulo="¿Cuáles de estas frases dijiste este mes?"
              detalle="Si son dos o más, el problema no es la factura: es que el dinero de tu negocio está repartido en pedazos que no se hablan."
            />
            <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2">
              {FRASES.map(f => (
                <li
                  key={f}
                  className="min-w-0 rounded-2xl border border-[#e9ebf3] bg-white px-5 py-4 text-pretty text-[14px] leading-[1.55] text-[#3b4252]"
                >
                  «{f}»
                </li>
              ))}
            </ul>
          </div>
        </Contenedor>
      </section>

      {/* ── El recorrido del dinero ────────────────────────────────────────── */}
      <section id="recorrido" className="scroll-mt-20">
        <Contenedor className="mt-16">
          <div className="rounded-3xl border border-[#e7edfb] bg-[#f5f8ff] p-7 sm:p-11">
            <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
              <Encabezado
                antetitulo="El recorrido del dinero"
                titulo="Una venta, de principio a fin, sin cambiar de programa."
                detalle="Cada paso alimenta al siguiente. Nadie vuelve a digitar lo mismo en otro sitio."
                enlace={{ texto: 'Ver los planes', href: '/precios' }}
              />
              <div className="min-w-0">
                <ol className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2 xl:grid-cols-3">
                  {RECORRIDO.map((r, i) => (
                    <li key={r.paso} className="min-w-0 rounded-[15px] border border-[#e7edfb] bg-white p-5">
                      <span className="font-[family-name:var(--font-display)] text-[13px] font-semibold tabular-nums text-zero-600">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <h3 className="m-0 mt-2 font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-[#102a72]">{r.paso}</h3>
                      <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{r.detalle}</p>
                    </li>
                  ))}
                </ol>
                <p className="m-0 mt-5 text-pretty text-[13px] leading-[1.6] text-[#5c6373]">
                  <span className="font-semibold text-[#102a72]">Cada operación deja su asiento:</span> {ASIENTOS}.
                </p>
              </div>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Módulos ────────────────────────────────────────────────────────── */}
      <section id="modulos" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
            <Encabezado
              antetitulo="Lo que hay adentro"
              titulo="Seis módulos. Una sola base de datos."
              detalle="Se arma con los módulos que tu operación usa, y todos escriben sobre los mismos datos."
              enlace={{ texto: 'Ver qué incluye cada plan', href: '/precios' }}
            />
            <div className="min-w-0">
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {MODULOS.map(m => (
                  <TarjetaModulo key={m.titulo} icono={m.icono} titulo={m.titulo} detalle={m.detalle} />
                ))}
              </ul>
              {/* El CRM es de Zero, pero es otra aplicación: se nombra aquí para
                  que nadie lo busque dentro del sistema ni lo crea incluido. */}
              <p className="m-0 mt-4 text-pretty text-[13px] leading-[1.6] text-[#5c6373]">
                Zero también tiene su <span className="font-semibold text-[#102a72]">CRM con WhatsApp</span>, para atender y dar seguimiento a lo que llega por mensaje. Va por su cuenta, fuera de estos planes.
              </p>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Para quién es ──────────────────────────────────────────────────── */}
      <section id="industrias" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
            <Encabezado
              antetitulo="Para quién es"
              titulo="Para negocios que venden, cobran y pagan gente todos los días."
              detalle="El mismo sistema, armado distinto según lo que hagas."
            />
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-3">
              {INDUSTRIAS.map(i => (
                <li key={i.titulo} className="min-w-0">
                  <Link
                    href={i.href}
                    className="block h-full overflow-hidden rounded-2xl border border-[#e9ebf3] bg-white transition hover:-translate-y-0.5 hover:border-zero-200 hover:shadow-[0_22px_40px_-28px_rgba(16,42,114,.45)]"
                  >
                    <Image
                      src={i.foto}
                      alt=""
                      width={800}
                      height={600}
                      className="block aspect-[4/3] w-full bg-[#eef2fb] object-cover object-[50%_40%]"
                    />
                    <span className="block p-4 pb-[18px]">
                      <span className="block font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-[#102a72]">{i.titulo}</span>
                      <span className="mt-1.5 block text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">{i.detalle}</span>
                    </span>
                  </Link>
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
              <Antetitulo>Planes</Antetitulo>
              {DESDE_NEGOCIO === null ? (
                <Titulo className="mt-3.5">Todos los planes traen el sistema completo.</Titulo>
              ) : (
                <p className="m-0 mt-3.5 flex flex-wrap items-baseline gap-2">
                  <span className="text-[15px] text-[#5c6373]">Desde</span>
                  <span className="font-[family-name:var(--font-display)] text-[46px] font-semibold tracking-[-.048em] text-[#102a72]">US${DESDE_NEGOCIO}</span>
                  <span className="text-[15px] text-[#8a90a0]">/mes</span>
                </p>
              )}
              <p className="m-0 mt-3 max-w-[470px] text-pretty text-[15px] leading-[1.6] text-[#5c6373]">
                Lo único que cambia es cuánto facturas y cuántas personas lo usan. Implementación y acompañamiento incluidos.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <BotonPrimario href="/precios">Ver precios</BotonPrimario>
              <BotonSecundario href="/contacto">Habla con ventas</BotonSecundario>
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
                  Empieza desde Zero.
                </h2>
                <p className="m-0 mt-3.5 max-w-[400px] text-pretty text-[14.5px] leading-[1.65] text-white/70">
                  Abre tu cuenta y emite hoy, o cuéntanos cómo trabajas y te decimos con qué módulos empezar.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-5">
                  <Link
                    href="/sign-up"
                    className="flex h-12 items-center gap-2.5 rounded-xl bg-zero-600 px-6 font-[family-name:var(--font-display)] text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-zero-500"
                  >
                    Empieza gratis
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
                <p className="m-0 font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[-.02em] text-[#102a72]">Te montamos el sistema.</p>
                <p className="m-0 mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-[#5c6373]">
                  Un equipo dominicano carga tus productos, clientes y saldos, y deja la habilitación de la DGII lista.
                </p>
                <div className="mt-4 grid gap-1.5 text-[12.5px] text-[#5c6373]">
                  <a href={`mailto:${CONTACTO.ventas}`} className="transition hover:text-zero-600">{CONTACTO.ventas}</a>
                  <a href={CONTACTO.telefonoHref} className="tabular-nums transition hover:text-zero-600">{CONTACTO.telefono}</a>
                </div>
              </div>
            </div>
          </div>
        </Contenedor>
      </section>
    </>
  );
}
