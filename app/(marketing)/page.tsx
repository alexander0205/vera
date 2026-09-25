/**
 * Portada del sitio público — Zero como el control financiero del negocio.
 *
 * La portada entraba por el colegio y dejaba fuera a todo el que no lo es. El
 * colegio se mudó a `/colegios`, que es lo que siempre fue —una industria con
 * página propia—, y aquí entra la promesa que sirve para cualquier negocio:
 * se registra UNA vez y cae solo en la factura, el inventario, la cartera, la
 * caja y la contabilidad.
 *
 * Reglas de esta página:
 *
 *  - Los módulos que se anuncian son los que existen (`lib/config/modules.ts`).
 *    El CRM de Zero es otra aplicación y se nombra como tal, no como un módulo
 *    de estos planes.
 *  - Ninguna cifra se escribe a mano: los precios salen de `lib/config/plans.ts`
 *    a través de `ResumenDePrecios`, con su bandera «bajo cotización».
 *  - Nada de clientes reales en las imágenes. Todo sale de las empresas de
 *    demostración del sandbox (`scripts/seed-demo-negocio.ts` y
 *    `scripts/capturas-demo.mjs`). Los logos de clientes van con su permiso y
 *    con un título que dice lo que son: colegios.
 *  - El ritmo cambia de una sección a la siguiente. Eran cinco bloques
 *    seguidos con la misma forma —título estrecho a la izquierda, rejilla de
 *    tarjetas a la derecha— y al bajar parecía el mismo bloque repetido.
 */

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { LazoZero } from '@/lib/marca/isotipo';
import { TEXTO_BAJO_COTIZACION, getProductoAparte } from '@/lib/config/plans';
import { CONTACTO, Cheque, Contenedor, Flecha, Iconos } from './_piezas';
import { Antetitulo, BotonPrimario, BotonSecundario, Encabezado, TarjetaModulo, Titulo } from './_bloques';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { DatosDelSitio } from './_datos-estructurados';
import { ResumenDePrecios } from './_precios-resumen';
import { ENLACE_CRM, ENLACE_ERP, MODULOS } from './_menu';
import { AlVer } from './_al-ver';
import { PantallaDelHero } from './_pantalla-hero';
import { FrasesDelDueno } from './_frases';
import { ParaQuien } from './_para-quien';
import { ConversacionCrm } from './_conversacion-crm';
import { RecorridoDelDinero } from './productos/erp/_recorrido';

export const metadata: Metadata = {
  title: { absolute: 'Zero — ERP, CRM con inteligencia artificial y facturación electrónica en República Dominicana' },
  description:
    'Facturación e-CF ante la DGII, cobros, inventario, punto de venta, contabilidad y nómina en un solo sistema, con un CRM de agentes de inteligencia artificial que atienden por WhatsApp, web y teléfono.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITIO_PUBLICO,
    images: [{ url: '/home/capturas/demo-facturacion.png', width: 1440, height: 900, alt: 'Panel de Zero de una distribuidora' }],
    title: 'Zero — El control financiero de tu negocio, de punta a punta',
    description:
      'ERP con facturación electrónica certificada ante la DGII, punto de venta, nómina, contabilidad y un CRM con agentes de IA. Hecho en República Dominicana.',
  },
};

// ─── Lo que sale del catálogo ─────────────────────────────────────────────────

/**
 * El CRM, que es de Zero pero no es uno de estos planes.
 *
 * Los precios de los planes no se leen aquí: los pinta `ResumenDePrecios`
 * directo del catálogo, con su regla de cotización incluida.
 */
const CRM = getProductoAparte('crm');

const PRECIO_CRM = CRM && !CRM.bajoCotizacion && CRM.precio !== null
  ? `US$${CRM.precio}/mes`
  : TEXTO_BAJO_COTIZACION;

// ─── Contenido ────────────────────────────────────────────────────────────────

/** Lo que respalda la promesa, en cuatro líneas. Va donde antes iban los logos. */
const GARANTIAS = [
  { titulo: 'Certificados ante la DGII', detalle: 'Cada e-CF sale firmado, enviado y con su acuse.', icono: Iconos.escudo },
  { titulo: 'Los diez tipos de e-CF', detalle: 'Crédito fiscal, consumo, notas y los regímenes especiales.', icono: Iconos.factura },
  { titulo: '606, 607 y 608', detalle: 'Salen de lo que ya registraste, sin armarlos a mano.', icono: Iconos.hoja },
  { titulo: 'Soporte dominicano', detalle: `En español. ${CONTACTO.horarioSoporte}.`, icono: Iconos.soporte },
] as const;

const ASIENTOS = 'Factura · Cobro · Nota de crédito · Anulación · Compra · Gasto · Depreciación · Nómina · Pago de nómina';

/**
 * Clientes que ya operan sobre Zero. Los logos se publican con su permiso.
 *
 * Son todos colegios, y el título lo dice. Antes decía «empresas y colegios»
 * encima de seis escudos escolares, y el dueño de un restaurante no se veía en
 * ninguno: la prueba social que no se parece a quien la mira no prueba nada.
 */
const COLEGIOS = [
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
            {/* Antes abría con lo que Zero NO es y con un «se registra» sin
                sujeto. Ahora dice quién hace qué. */}
            <p className="mx-auto mt-5 max-w-[640px] text-pretty text-[17px] leading-[1.6] text-[#4a5164] sm:text-lg">
              Registras una venta una vez y cae sola donde tiene que caer: en la factura, el inventario, la cartera, la caja y la contabilidad. Al mismo tiempo.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <BotonPrimario href="/sign-up">Empieza gratis</BotonPrimario>
              <BotonSecundario href="/contacto">Habla con ventas</BotonSecundario>
            </div>
            {/* Cada promesa en un bloque que no se parte: en el teléfono
                «mínimo» se quedaba solo en una línea. */}
            <ul className="m-0 mx-auto mt-4 flex max-w-[640px] list-none flex-wrap justify-center gap-x-4 gap-y-1.5 p-0 text-[13px] text-[#5c6373]">
              {['Certificados ante la DGII', 'Sin instalación', 'Sin contrato mínimo'].map(t => (
                <li key={t} className="flex items-center gap-1.5 whitespace-nowrap">
                  <Cheque tamano={11} color="#12925a" grosor={3.4} />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <PantallaDelHero />
        </Contenedor>
      </section>

      {/* ── Lo que respalda la promesa ─────────────────────────────────────── */}
      <section className="border-y border-[#eff1f7] bg-white">
        <Contenedor className="py-10 sm:py-12">
          <ul className="m-0 grid list-none grid-cols-2 gap-x-5 gap-y-6 p-0 sm:gap-x-8 lg:grid-cols-4">
            {GARANTIAS.map(({ titulo, detalle, icono: Icono }, i) => (
              <AlVer key={titulo} como="li" retraso={i * 70} className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf1fe] text-zero-600">
                  <Icono className="size-[19px]" />
                </span>
                <span className="min-w-0">
                  <span className="block font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[-.02em] text-[#102a72]">{titulo}</span>
                  <span className="mt-1 block text-pretty text-[13px] leading-[1.5] text-[#5c6373]">{detalle}</span>
                </span>
              </AlVer>
            ))}
          </ul>
        </Contenedor>
      </section>

      {/* ── El problema, en palabras del dueño — y se contesta ─────────────── */}
      <section id="problema" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <AlVer className="mx-auto max-w-[680px] text-center">
            <Antetitulo>Antes de Zero</Antetitulo>
            <Titulo className="mt-3.5">¿Cuáles de estas frases dijiste este mes?</Titulo>
            <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.65] text-[#5c6373]">
              Toca las que te suenen: debajo de cada una sale la parte de Zero que se encarga de ella.
            </p>
          </AlVer>
          <AlVer retraso={90} className="mt-9">
            <FrasesDelDueno />
          </AlVer>
        </Contenedor>
      </section>

      {/* ── El recorrido del dinero: una banda entera, y se camina ─────────── */}
      <section id="recorrido" className="mt-16 scroll-mt-20 border-y border-[#e7edfb] bg-[#f5f8ff] sm:mt-[82px]">
        <Contenedor className="py-14 sm:py-[72px]">
          <AlVer className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
            <div className="max-w-[560px]">
              <Antetitulo>El recorrido del dinero</Antetitulo>
              <Titulo className="mt-3.5">Una venta, de principio a fin, sin cambiar de programa.</Titulo>
              <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.65] text-[#5c6373]">
                Toca un paso para ver qué haces tú y qué escribe el sistema solo.
              </p>
            </div>
            <Link
              href={ENLACE_ERP}
              className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-zero-600 transition hover:text-[#102a72]"
            >
              Ver el ERP paso a paso
              <Flecha tamano={14} />
            </Link>
          </AlVer>
          <AlVer retraso={90} className="mt-9">
            <RecorridoDelDinero />
          </AlVer>
          <p className="m-0 mt-6 text-pretty text-[13px] leading-[1.6] text-[#5c6373]">
            <span className="font-semibold text-[#102a72]">Cada operación deja su asiento:</span> {ASIENTOS}.
          </p>
        </Contenedor>
      </section>

      {/* ── Módulos ────────────────────────────────────────────────────────── */}
      <section id="modulos" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
            <AlVer>
              <Encabezado
                antetitulo="Lo que hay adentro"
                titulo="Seis módulos. Una sola base de datos."
                detalle="Se arma con los módulos que tu operación usa, y todos escriben sobre los mismos datos."
                enlace={{ texto: 'Ver Zero ERP completo', href: ENLACE_ERP }}
              />
            </AlVer>
            <div className="min-w-0">
              {/* En el teléfono ruedan de lado: seis tarjetas apiladas eran casi
                  una pantalla entera de lo mismo. */}
              <ul className="-mx-4 m-0 flex snap-x list-none gap-3 overflow-x-auto p-0 px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3">
                {MODULOS.map(m => (
                  <TarjetaModulo
                    key={m.href}
                    href={m.href}
                    icono={m.icono}
                    titulo={m.titulo}
                    detalle={m.detalle}
                    className="w-[78%] shrink-0 snap-start sm:w-auto"
                  />
                ))}
              </ul>
              {/* El CRM se nombra aquí y se cuenta en su página: es otro
                  sistema —con su panel, su pipeline, su bandeja y su agenda—.
                  La tarjeta entera es el enlace. El texto sale de
                  PRODUCTOS_APARTE. */}
              {CRM && (
                <AlVer retraso={60} className="mt-3">
                  <Link href={ENLACE_CRM} className="grid items-center gap-5 rounded-[15px] border border-[#e7edfb] bg-[#f9fbff] p-5 transition hover:-translate-y-0.5 hover:border-zero-200 hover:shadow-[0_22px_40px_-28px_rgba(16,42,114,.45)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-[#edf1fe] text-zero-600">
                          <Iconos.soporte className="size-[18px]" />
                        </span>
                        <span className="font-[family-name:var(--font-display)] text-[14.5px] font-semibold tracking-[-.015em] text-[#102a72]">
                          {CRM.nombre}
                        </span>
                        <span className="ml-auto text-[11.5px] font-semibold text-zero-600">{PRECIO_CRM}</span>
                      </div>
                      <p className="m-0 mt-3 text-pretty text-[12.5px] leading-[1.55] text-[#5c6373]">
                        {CRM.descripcion} Se contrata aparte de estos planes y trabaja pegado al
                        sistema: por ahí salen los avisos de cobro a tus clientes.
                      </p>
                      <span className="mt-3 inline-flex items-center gap-2 text-[12.5px] font-semibold text-zero-600">
                        Ver qué hace {CRM.nombre}
                        <Flecha tamano={13} />
                      </span>
                      <ul className="m-0 mt-3 hidden list-none flex-col gap-1.5 p-0 sm:flex">
                        {CRM.hace.map(linea => (
                          <li key={linea} className="flex min-w-0 items-start gap-2 text-[12.5px] leading-[1.5] text-[#3b4252]">
                            <Cheque tamano={11} color="#3658e1" grosor={3.4} />
                            <span className="min-w-0">{linea}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <ConversacionCrm />
                  </Link>
                </AlVer>
              )}
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Para quién es: de una industria a la vez ───────────────────────── */}
      <section id="industrias" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <AlVer className="max-w-[640px]">
            <Antetitulo>Para quién es</Antetitulo>
            <Titulo className="mt-3.5">Para negocios que venden, cobran y pagan gente todos los días.</Titulo>
            <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.65] text-[#5c6373]">
              El mismo sistema, armado distinto según lo que hagas. Elige el tuyo.
            </p>
          </AlVer>
          <AlVer retraso={90} className="mt-8">
            <ParaQuien />
          </AlVer>
        </Contenedor>
      </section>

      {/* ── Quién ya lo usa: colegios, y así se dice ───────────────────────── */}
      <section>
        <Contenedor className="pt-12 sm:pt-14">
          <AlVer className="flex flex-col items-center gap-7 rounded-3xl border border-[#eef1f8] px-6 py-8 lg:flex-row lg:justify-between lg:px-10">
            <p className="m-0 max-w-[260px] text-center font-[family-name:var(--font-display)] text-[16px] font-semibold leading-[1.35] tracking-[-.02em] text-balance text-[#102a72] lg:text-left">
              Colegios dominicanos que ya operan sobre Zero
            </p>
            <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-x-9 gap-y-6 p-0 lg:justify-end">
              {COLEGIOS.map(c => (
                <li key={c.nombre}>
                  <Image
                    src={c.logo}
                    alt={c.nombre}
                    width={210}
                    height={62}
                    sizes="190px"
                    className="h-10 w-auto max-w-[150px] object-contain sm:h-12 sm:max-w-[170px]"
                  />
                </li>
              ))}
            </ul>
          </AlVer>
        </Contenedor>
      </section>

      {/* ── Planes ─────────────────────────────────────────────────────────── */}
      {/* La lista completa, no un «desde». El colegio va en una línea: tiene su
          propia página, y media sección de precios de colegio en la portada de
          un negocio es media sección que no le habla a nadie aquí. */}
      <section id="planes" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,2fr)] lg:gap-12">
            <AlVer className="min-w-0">
              <Encabezado
                antetitulo="Planes"
                titulo="Todos los precios, con lo que cambia entre uno y otro."
                detalle="Lo único que cambia es cuánto facturas y cuántas personas lo usan. El sistema es el mismo en todos, con implementación y acompañamiento incluidos."
              />
              <div className="mt-6 flex flex-wrap gap-3">
                <BotonPrimario href="/sign-up">Empieza gratis</BotonPrimario>
                <BotonSecundario href="/contacto">Habla con ventas</BotonSecundario>
              </div>
            </AlVer>
            <AlVer retraso={90}>
              <ResumenDePrecios lineas={['erp']} mencionar={['erp-colegio']} />
            </AlVer>
          </div>
        </Contenedor>
      </section>

      {/* ── Llamado final ──────────────────────────────────────────────────── */}
      <section>
        <Contenedor className="pb-4 pt-16 sm:pt-[82px]">
          <AlVer className="sobre-oscuro relative overflow-hidden rounded-3xl bg-[#0b1a46] p-7 sm:p-12">
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

              {/* La tarjeta blanca vuelve a fondo claro: su foco va en azul. */}
              <div className="sobre-claro min-w-0 rounded-2xl bg-white p-5">
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
          </AlVer>
        </Contenedor>
      </section>

      {/* Quiénes somos y qué es este sitio, para buscadores y asistentes. */}
      <DatosDelSitio />
    </>
  );
}
