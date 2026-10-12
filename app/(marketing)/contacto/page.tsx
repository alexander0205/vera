/**
 * Contacto — la página que tiene que convertir.
 *
 * El formulario manda de verdad (ver `_formulario.tsx`, que postea a
 * `/api/contacto`). Al lado, siempre visibles, están las tres vías que no
 * dependen de que nuestro correo funcione: WhatsApp, teléfono y los dos buzones.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { LazoZero } from '@/lib/marca/isotipo';
import { planesDeFamilia } from '@/lib/config/plans';
import {
  CONTACTO, Contenedor, Flecha, IconoWhatsApp, Iconos, LazoDeFondo, LlamadoFinal, TarjetasContacto,
} from '../_piezas';
import { Acordeon, type Pregunta } from '../_acordeon';
import { FormularioContacto } from './_formulario';
import { EstadoAtencion } from './_estado-atencion';

export const metadata: Metadata = {
  title: 'Contacto',
  description:
    'Habla con Zero: WhatsApp 809 758 0266, teléfono 809 473 1859 o hola@zero.com.do. Demo de 30 minutos sin costo ni compromiso.',
};

/**
 * Las horas de implementación viven en el texto comercial de cada tramo de
 * colegio (`ui.marketingFeatures`), no como número suelto. Se sacan de ahí para
 * no escribir «entre 8 y 19 horas» a mano y que el día que cambie el catálogo
 * esta frase siga diciendo lo de antes.
 */
function rangoHorasImplementacion(): string | null {
  const horas = planesDeFamilia('colegio')
    .flatMap(p => p.ui.marketingFeatures)
    .map(f => /^([\d.,]+)\s*horas?\b/i.exec(f)?.[1])
    .filter((h): h is string => !!h)
    .map(h => Number(h.replace(',', '.')))
    .filter(n => Number.isFinite(n));
  if (!horas.length) return null;
  const min = Math.min(...horas);
  const max = Math.max(...horas);
  const fmt = (n: number) => n.toLocaleString('es-DO');
  return min === max ? `${fmt(min)} horas` : `entre ${fmt(min)} y ${fmt(max)} horas`;
}

const PASOS = [
  { n: '1', titulo: 'Te contactamos', detalle: 'En horario laborable respondemos el mismo día por correo o WhatsApp, como prefieras.' },
  { n: '2', titulo: 'Demo de 30 minutos', detalle: 'Recorremos tu operación módulo por módulo, con tus propios casos sobre la mesa.' },
  { n: '3', titulo: 'Propuesta por escrito', detalle: 'Te dejamos el plan recomendado, el precio final y las horas de migración de datos.' },
];

const ORIGENES = [
  {
    titulo: 'Vienes de otro sistema',
    detalle: 'Exportamos de tu software actual y mapeamos cada campo al de Zero, sin perder histórico.',
    icono: Iconos.base,
    fondo: 'bg-[#edf1fe]',
    color: 'text-[#2a48c4]',
  },
  {
    titulo: 'Todo está en Excel',
    detalle: 'Nos mandas tus hojas como estén. Las limpiamos, cuadramos saldos y las subimos por ti.',
    icono: Iconos.hoja,
    fondo: 'bg-[#e8f6ee]',
    color: 'text-[#15803d]',
  },
  {
    titulo: 'Todo está en papel',
    detalle: 'Nos pasas tus carpetas o fotos y digitamos estudiantes, clientes y saldos uno por uno.',
    icono: Iconos.papel,
    fondo: 'bg-[#eaeefb]',
    color: 'text-[#102a72]',
  },
];

const MIGRACION_PASOS = [
  { n: '1', titulo: 'Revisamos', detalle: 'Vemos qué tienes y en qué formato está.' },
  { n: '2', titulo: 'Ordenamos', detalle: 'Limpiamos duplicados y cuadramos saldos.' },
  { n: '3', titulo: 'Cargamos', detalle: 'Subimos todo a tu empresa en Zero.' },
  { n: '4', titulo: 'Validamos', detalle: 'Lo revisas con nosotros antes de operar en vivo.' },
];

const MIGRACION_PUNTOS = [
  'Estudiantes, clientes, productos, catálogo de cuentas y saldos pendientes.',
  'Un especialista asignado a tu caso, no un formulario ni un instructivo.',
  'Cuadramos los saldos con tus números antes de que emitas la primera factura.',
  'Si algo no cuadra, lo corregimos nosotros: tú solo confirmas.',
];

export default function ContactoPage() {
  const horas = rangoHorasImplementacion();

  const FAQS: Pregunta[] = [
    {
      pregunta: '¿Cuánto tardan en responder?',
      respuesta:
        'En horario de ventas (lunes a viernes de 8:00 a 17:00) respondemos el mismo día. Por WhatsApp suele ser en minutos. Si escribes fuera de horario, te contestamos a primera hora del siguiente día laborable.',
    },
    {
      pregunta: '¿La demo tiene costo o compromiso?',
      respuesta:
        'Ninguno. Son 30 minutos con un especialista y te queda la propuesta por escrito, sin obligación de contratar.',
    },
    {
      pregunta: '¿Pueden migrar mis datos actuales?',
      respuesta:
        `Sí. Pasamos tu información desde Excel u otros documentos al sistema: estudiantes, clientes, productos, catálogo de cuentas y saldos.${
          horas ? ` Los planes de colegio incluyen ${horas} de implementación según el tramo.` : ''
        }`,
    },
    {
      pregunta: 'Ya soy cliente y tengo un problema, ¿a quién escribo?',
      respuesta: `A ${CONTACTO.soporte}, que atiende todos los días de 7:00 a 24:00. Si es urgente, escribe por WhatsApp al ${CONTACTO.whatsapp}.`,
    },
    {
      pregunta: '¿Atienden fuera de República Dominicana?',
      respuesta:
        'Nuestra facturación electrónica está certificada ante la DGII, así que hoy trabajamos con operaciones dominicanas. Si tienes sedes en otros países, escríbenos y lo evaluamos.',
    },
  ];

  return (
    <>
      {/* ── Hero + vías de contacto ───────────────────────────────────────── */}
      {/* Sin `overflow-hidden`, por lo mismo que en la portada: recortaba el
          lazo de fondo con una línea recta. El desborde horizontal lo tapa el
          layout. */}
      <section className="relative bg-gradient-to-b from-[#f5f7fe] to-white to-[62%] pt-14">
        <LazoDeFondo arriba={400} />
        <Contenedor className="relative">
          <div className="mx-auto max-w-[660px] text-center">
            <div className="inline-flex h-[30px] items-center gap-2.5 rounded-full border border-[#e0e4f0] bg-white px-3.5 text-xs font-medium text-zero-600">
              <span className="size-1.5 rounded-full bg-zero-600" />
              Te contestamos el mismo día
            </div>
            <h1 className="mt-5 text-pretty font-[family-name:var(--font-display)] text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.1] tracking-[-.04em]">
              Hablemos de tu operación,<br />
              <span className="text-zero-600">empezamos desde zero</span>
            </h1>
            <p className="mx-auto mt-4 max-w-[520px] text-pretty text-[15.5px] leading-relaxed text-[#5c6373]">
              Cuéntanos cómo trabajas hoy y te mostramos cómo se vería en Zero. Sin compromiso y sin
              costo de instalación.
            </p>
          </div>

          <div className="mt-9">
            <TarjetasContacto />
          </div>
        </Contenedor>
      </section>

      {/* ── Formulario y barra lateral ────────────────────────────────────── */}
      <section>
        <Contenedor className="pt-12">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.32fr_.68fr]">
            <FormularioContacto />

            <div className="flex flex-col gap-3.5">
              <div className="relative overflow-hidden rounded-2xl bg-[#102a72] p-6 text-white">
                <div aria-hidden className="pointer-events-none absolute -bottom-6 -right-8 opacity-[.08]">
                  <LazoZero alto={100} color="#ffffff" />
                </div>
                <div className="relative">
                  <div className="font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-[-.4px]">
                    Horarios de atención
                  </div>
                  <div className="mt-4 flex flex-col gap-3.5">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="size-[7px] rounded-full bg-[#7b94f0]" />
                        <span className="text-[12.5px] font-semibold">Ventas y administración</span>
                      </div>
                      <div className="mt-1 pl-4 text-[12.5px] text-white/70">{CONTACTO.horarioVentas}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="size-[7px] rounded-full bg-[#25a366]" />
                        <span className="text-[12.5px] font-semibold">Soporte técnico</span>
                      </div>
                      <div className="mt-1 pl-4 text-[12.5px] text-white/70">{CONTACTO.horarioSoporte}</div>
                    </div>
                  </div>
                  <EstadoAtencion />
                </div>
              </div>

              <div className="rounded-2xl border border-[#e9ebf3] bg-white p-6">
                <div className="font-[family-name:var(--font-display)] text-[15.5px] font-semibold tracking-[-.3px]">
                  Qué pasa después
                </div>
                <div className="mt-4 flex flex-col gap-4">
                  {PASOS.map(p => (
                    <div key={p.n} className="flex items-start gap-3">
                      <span className="grid size-[26px] shrink-0 place-items-center rounded-lg bg-[#edf1fe] font-[family-name:var(--font-display)] text-[11.5px] font-semibold text-[#2a48c4]">
                        {p.n}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold">{p.titulo}</span>
                        <span className="mt-0.5 block text-pretty text-[11.5px] leading-relaxed text-gray-500">{p.detalle}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#e9ebf3] bg-[#fafbfe] p-6">
                <div className="font-[family-name:var(--font-display)] text-[15.5px] font-semibold tracking-[-.3px]">
                  Ya eres cliente
                </div>
                <p className="mt-2 text-pretty text-xs leading-relaxed text-gray-500">
                  Para incidencias y dudas del día a día, soporte responde de 7:00 a 24:00 todos los días.
                </p>
                <div className="mt-3.5 flex flex-col gap-2">
                  <a
                    href={`mailto:${CONTACTO.soporte}`}
                    className="flex h-[38px] items-center justify-center rounded-[10px] border border-[#e6e8f0] bg-white text-[12.5px] font-semibold text-[#102a72] transition hover:border-zero-600 hover:text-zero-600"
                  >
                    Escribir a soporte
                  </a>
                  <Link
                    href="/sign-in"
                    className="flex h-[38px] items-center justify-center rounded-[10px] border border-[#e6e8f0] bg-white text-[12.5px] font-medium text-[#4a5164] transition hover:border-zero-600 hover:text-zero-600"
                  >
                    Entrar al sistema
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Migración ─────────────────────────────────────────────────────── */}
      <section id="migracion">
        <Contenedor className="pt-14">
          <div className="rounded-2xl border border-[#e7ebfa] bg-[#fafbfe] p-6 sm:p-8">
            <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-[.78fr_1.22fr]">
              <div>
                <span className="inline-flex h-[26px] items-center rounded-full bg-[#edf1fe] px-3 text-[11px] font-semibold uppercase tracking-[.5px] text-[#2a48c4]">
                  Acompañamiento incluido
                </span>
                <h2 className="mt-3.5 text-pretty font-[family-name:var(--font-display)] text-[clamp(1.4rem,4vw,1.63rem)] font-semibold leading-tight tracking-[-.9px]">
                  Soporte personalizado para tu migración
                </h2>
                <p className="mt-3 text-pretty text-[13.5px] leading-relaxed text-[#5c6373]">
                  No importa de dónde vengas: de otro sistema, de hojas de Excel o de carpetas en
                  papel. Un especialista se sienta contigo, ordena tu información y la deja cargada y
                  cuadrada en Zero antes de que empieces a operar.
                </p>
                <div className="mt-5 flex flex-col gap-2.5">
                  {MIGRACION_PUNTOS.map(p => (
                    <div key={p} className="flex items-start gap-2.5">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3658e1" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
                        <path d="M4.5 12.5 9.5 17.5 19.5 7" />
                      </svg>
                      <span className="text-pretty text-[12.5px] leading-relaxed text-[#3b4252]">{p}</span>
                    </div>
                  ))}
                </div>
                <a
                  href={CONTACTO.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 text-[13px] font-semibold text-zero-600 hover:text-[#102a72]"
                >
                  <IconoWhatsApp tamano={14} />
                  Cuéntanos cómo tienes tus datos hoy
                  <Flecha tamano={14} />
                </a>
              </div>

              <div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {ORIGENES.map(o => (
                    <div key={o.titulo} className="rounded-[13px] border border-[#e9ebf3] bg-white p-4">
                      <span className={`grid size-8 place-items-center rounded-[10px] ${o.fondo} ${o.color}`}>
                        <o.icono tamano={16} />
                      </span>
                      <div className="mt-3 text-pretty text-[12.5px] font-semibold">{o.titulo}</div>
                      <div className="mt-1 text-pretty text-[11.5px] leading-relaxed text-gray-500">{o.detalle}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-[13px] border border-[#e9ebf3] bg-white p-5">
                  <div className="text-[12.5px] font-semibold">Cómo trabajamos tu migración</div>
                  <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {MIGRACION_PASOS.map(m => (
                      <div key={m.n}>
                        <div className="flex items-center gap-2">
                          <span className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-[#edf1fe] font-[family-name:var(--font-display)] text-[10.5px] font-semibold text-[#2a48c4]">
                            {m.n}
                          </span>
                          <span className="min-w-0 text-[11.5px] font-semibold">{m.titulo}</span>
                        </div>
                        <div className="mt-1.5 text-pretty text-xs leading-relaxed text-gray-500">{m.detalle}</div>
                      </div>
                    ))}
                  </div>
                  {horas && (
                    <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-[#f0f2f8] pt-3.5">
                      <Iconos.reloj tamano={15} className="shrink-0 text-gray-400" />
                      <span className="text-pretty text-[11.5px] text-gray-500">
                        Los planes de colegio incluyen {horas} de implementación según el tramo. Para
                        pymes la cotizamos según el volumen de datos.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Preguntas ─────────────────────────────────────────────────────── */}
      <section>
        <Contenedor className="pt-14">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[.6fr_1.4fr] lg:gap-11">
            <div>
              <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.5rem,4vw,1.75rem)] font-semibold leading-tight tracking-[-1px]">
                Antes de<br className="hidden lg:block" /> escribirnos
              </h2>
              <p className="mt-3.5 text-pretty text-[13.5px] leading-relaxed text-[#5c6373]">
                Las dudas que más nos llegan. Si la tuya no está, escríbenos y te contestamos el mismo día.
              </p>
              <Link href="/precios" className="mt-4 inline-flex items-center gap-2 text-[13.5px] font-semibold text-zero-600 hover:text-[#102a72]">
                Ver planes y precios
                <Flecha />
              </Link>
            </div>
            <Acordeon preguntas={FAQS} />
          </div>
        </Contenedor>
      </section>

      {/* ── Cierre ────────────────────────────────────────────────────────── */}
      <section>
        <Contenedor className="py-14">
          <LlamadoFinal
            titulo="¿Prefieres escribir ahora?"
            detalle={`Mándanos un WhatsApp al ${CONTACTO.whatsapp} y arrancamos por ahí.`}
            accion="Abrir WhatsApp"
            href={CONTACTO.whatsappHref}
            externo
          />
        </Contenedor>
      </section>
    </>
  );
}
