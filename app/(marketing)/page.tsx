/**
 * Portada del sitio público.
 *
 * Todo lo que sea una cifra del negocio —cuántos planes hay, desde cuánto
 * empieza, si alguno viene sin tope de comprobantes— se lee de
 * `lib/config/plans.ts`, que es el catálogo por el que se cobra. Escribirlas a
 * mano aquí sería prometer en la portada un precio que el checkout ya no tiene.
 */

import Link from 'next/link';
import { PLANS, ADDONS, planesDeFamilia } from '@/lib/config/plans';
import { PRUEBA } from '@/lib/config/suscripcion';
import { LazoZero } from '@/lib/marca/isotipo';
import {
  Contenedor, Flecha, Iconos, LazoDeFondo, LlamadoFinal,
} from './_piezas';
import { ComparativaIndustrias } from './_industrias';

// ─── Cifras derivadas del catálogo ───────────────────────────────────────────

const PRECIO_MINIMO = Math.min(...PLANS.map(p => p.price));
const CANTIDAD_PLANES = PLANS.length;
const HAY_SIN_TOPE = PLANS.some(p => p.limits.docs === -1);
const PRECIO_POS = ADDONS.find(a => a.key === 'pos')?.price ?? 0;
/** El tramo escolar más alto: es la promesa de techo del módulo de colegios. */
const TOPE_ESTUDIANTES = Math.max(...planesDeFamilia('colegio').map(p => p.limits.estudiantes));

const MODULOS = [
  {
    nombre: 'Facturación',
    detalle: 'e-CF ante la DGII en segundos, con notas de crédito y débito.',
    icono: Iconos.factura,
  },
  {
    nombre: 'Punto de venta',
    detalle: `Caja con turnos y cuadre al cierre. Se agrega por US$${PRECIO_POS} al mes.`,
    icono: Iconos.pos,
  },
  {
    nombre: 'Administración',
    detalle: 'Clientes, productos, inventario, compras y gastos.',
    icono: Iconos.administracion,
  },
  {
    nombre: 'Contabilidad',
    detalle: 'Libro diario, balances y reportes 606 y 607 incluidos.',
    icono: Iconos.contabilidad,
  },
  {
    nombre: 'Colegio',
    detalle: `Matrículas, cuotas, portal de padres y recordatorios. Hasta ${TOPE_ESTUDIANTES} estudiantes.`,
    icono: Iconos.colegio,
  },
  {
    nombre: 'Reportes',
    detalle: 'Tableros en vivo que cruzan facturación, cobros y matrícula.',
    icono: Iconos.reportes,
  },
];

const CAMBIOS = [
  {
    titulo: 'Aumenta los ingresos',
    detalle: 'Menos mora con recordatorios automáticos y visibilidad real de cada peso que entra.',
    icono: Iconos.crecer,
  },
  {
    titulo: 'Simplifica la operación',
    detalle: 'Una sola carga de datos: la venta cae en inventario, facturación y contabilidad.',
    icono: Iconos.engranaje,
  },
  {
    titulo: 'Decide con datos',
    detalle: 'Tableros en vivo que cruzan facturación, cobros y matrícula.',
    icono: Iconos.reportes,
  },
  {
    titulo: 'Escala sin techo',
    detalle: 'De un usuario a ocho, con facturas sin tope en los planes altos.',
    icono: Iconos.escudo,
  },
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

export default function PortadaMarketing() {
  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      {/* SIN `overflow-hidden`: el lazo de fondo mide más que esta sección, y
          recortarlo aquí le dejaba un corte recto justo encima de las tarjetas
          —una línea dura donde la textura debía desvanecerse—. El desborde
          horizontal ya lo tapa el `overflow-x-hidden` del layout, que es donde
          corresponde: en la página, no en una sección. */}
      <section className="relative bg-white">
        {/* La portada lo lleva más grande y más tenue que las otras dos: es la
            única pantalla donde el lazo compite con un titular de 5rem. */}
        <LazoDeFondo arriba={330} ancho="140vw" anchoMinimo={1600} opacidad={0.035} />
        <Contenedor className="relative pt-14 sm:pt-[74px]">
          <div className="mx-auto max-w-[900px] text-center">
            <h1 className="m-0 font-[family-name:var(--font-display)] text-[clamp(2.75rem,9vw,6rem)] font-bold leading-[.96] tracking-[-.035em] text-balance">
              <span className="block text-[#102a72]">Desde Zero</span>
              <span className="mt-1.5 flex items-center justify-center gap-3 text-zero-600 sm:gap-5">
                hasta el
                <LazoZero alto={44} titulo="infinito" className="sm:hidden" />
                <LazoZero alto={70} titulo="infinito" className="hidden sm:block" />
              </span>
            </h1>

            <div className="mx-auto mt-7 h-[3px] w-16 rounded-full bg-zero-600" />

            <p className="mx-auto mt-6 max-w-[660px] text-pretty text-base leading-relaxed text-[#3b4252] sm:text-lg">
              Empiezas con una factura y terminas con toda tu operación en un solo lugar:{' '}
              <strong className="font-semibold text-[#102a72]">
                facturación, punto de venta, administración, contabilidad y colegios
              </strong>.
            </p>
            <p className="mx-auto mt-3.5 max-w-[600px] text-pretty text-[15px] leading-relaxed text-gray-500">
              Una sola carga de datos. Cada venta cae directo en tu inventario, tu facturación y tu
              contabilidad. Desde US${PRECIO_MINIMO} al mes, sin instalación y sin contrato mínimo.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {/* La acción principal es ENTRAR, no pedir una cita. Hay prueba
                  autoservicio: quien llega aquí puede estar facturando hoy sin
                  hablar con nadie, y mandarlo a un formulario de demo era pedirle
                  que esperara por algo que no necesita esperar. La demo sigue
                  existiendo abajo, para quien la quiera. */}
              <Link
                href="/sign-up"
                className="flex h-[52px] items-center rounded-[13px] bg-zero-600 px-7 font-[family-name:var(--font-display)] text-[15px] font-semibold text-white shadow-[0_14px_30px_-10px_rgba(54,88,225,.8)] transition hover:bg-zero-700"
              >
                Empieza gratis {PRUEBA.dias} días
              </Link>
              <Link
                href="/precios"
                className="flex h-[52px] items-center gap-2.5 rounded-[13px] border-[1.5px] border-[#dce1f0] bg-white px-6 font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#102a72] transition hover:border-zero-600 hover:text-zero-600"
              >
                Ver planes y precios
                <Flecha />
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-5">
              {[
                { valor: `Desde US$${PRECIO_MINIMO}`, etiqueta: 'al mes, sin instalación' },
                { valor: 'e-CF', etiqueta: 'certificado ante la DGII' },
                { valor: '606 · 607', etiqueta: 'reportes incluidos' },
              ].map((m, i) => (
                <div key={m.valor} className="flex items-center gap-7">
                  {i > 0 && <span aria-hidden className="hidden h-8 w-px bg-[#dde1ec] sm:block" />}
                  <div>
                    <div className="font-[family-name:var(--font-display)] text-[22px] font-semibold tracking-[-.7px] text-zero-600">
                      {m.valor}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">{m.etiqueta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Contenedor>

        <Contenedor className="mt-12">
          <div className="grid grid-cols-1 divide-y divide-[#e9ebf3] rounded-2xl border border-[#e9ebf3] bg-[#fafbfe] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { valor: `${CANTIDAD_PLANES} planes`, etiqueta: `desde US$${PRECIO_MINIMO} al mes`, icono: Iconos.dinero },
              { valor: 'e-CF', etiqueta: 'emisión en segundos', icono: Iconos.reloj },
              // El «sin tope» se dibuja, no se escribe: el lazo ES el infinito
              // de la marca, y en una cifra suelta dice más que dos palabras.
              ...(HAY_SIN_TOPE
                ? [{ valor: 'Sin tope', etiqueta: 'facturas en planes altos', icono: Iconos.crecer, sinTope: true }]
                : []),
            ].map(k => (
              <div key={k.valor} className="flex items-center gap-3.5 px-6 py-6">
                <span className="grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-[#edf1fe] text-zero-600">
                  <k.icono tamano={19} />
                </span>
                <span className="min-w-0">
                  <span className="block font-[family-name:var(--font-display)] text-[22px] font-semibold tracking-[-.7px] text-zero-600">
                    {'sinTope' in k ? <LazoZero alto={20} titulo={k.valor} color="currentColor" /> : k.valor}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">{k.etiqueta}</span>
                </span>
              </div>
            ))}
          </div>
        </Contenedor>
      </section>

      {/* ── Módulos ───────────────────────────────────────────────────────── */}
      <section id="modulos" className="relative mt-16 overflow-hidden bg-zero-600 py-16 sm:mt-[72px]">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-12 opacity-[.07]">
          <LazoZero alto={180} color="#ffffff" />
        </div>
        <Contenedor className="relative">
          <div className="mx-auto max-w-[640px] text-center">
            <h2 className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.6rem,4vw,2.06rem)] font-semibold tracking-[-1px] text-white">
              Todo lo que necesitas. Una plataforma.
            </h2>
            <p className="mt-3.5 text-[14.5px] leading-relaxed text-white/[.78]">
              Zero conecta la administración y la operación diaria, para que ahorres tiempo,
              reduzcas costos y crezcas con confianza.
            </p>
          </div>

          <div className="mt-11 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {MODULOS.map(m => (
              <div key={m.nombre} className="min-w-0 border-l border-white/20 px-6 py-1 sm:border-l lg:[&:nth-child(3n+1)]:border-l-0">
                <span className="block text-white">
                  <m.icono tamano={24} />
                </span>
                <div className="mt-3.5 font-[family-name:var(--font-display)] text-[15px] font-semibold text-white">
                  {m.nombre}
                </div>
                <div className="mt-1.5 text-pretty text-[12.5px] leading-relaxed text-white/[.72]">
                  {m.detalle}
                </div>
              </div>
            ))}
          </div>
        </Contenedor>
      </section>

      {/* ── Industrias ────────────────────────────────────────────────────── */}
      <section id="industrias">
        <Contenedor className="pt-16 sm:pt-20">
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[.68fr_1.32fr] lg:gap-11">
            <div className="lg:pt-11">
              <div className="text-[11px] font-semibold uppercase tracking-[.9px] text-zero-600">
                Hecho para tu sector
              </div>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(1.6rem,4vw,2.06rem)] font-semibold leading-tight tracking-[-1.1px]">
                Una plataforma.<br />Cada industria.
              </h2>
              <p className="mt-4 text-pretty text-sm leading-relaxed text-[#5c6373]">
                Zero se adapta a tu forma de trabajar. Elige tu sector y mira cómo se compara con
                las herramientas que ya usas.
              </p>
              <Link href="/precios" className="mt-5 inline-flex items-center gap-2 text-[13.5px] font-semibold text-zero-600 hover:text-[#102a72]">
                Ver planes y precios
                <Flecha />
              </Link>
            </div>

            <ComparativaIndustrias />
          </div>
        </Contenedor>
      </section>

      {/* ── Qué cambia ────────────────────────────────────────────────────── */}
      <section>
        <Contenedor className="pt-16 sm:pt-[74px]">
          <h2 className="m-0 text-center font-[family-name:var(--font-display)] text-[clamp(1.4rem,3.5vw,1.7rem)] font-semibold tracking-[-.9px]">
            Lo que cambia cuando operas sobre Zero
          </h2>
          <div className="mt-7 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {CAMBIOS.map(s => (
              <div key={s.titulo} className="flex flex-col rounded-2xl border border-[#e9ebf3] bg-white p-5">
                <span className="grid size-9 place-items-center rounded-[10px] bg-[#edf1fe] text-zero-600">
                  <s.icono tamano={19} />
                </span>
                <span className="mt-3.5 block font-[family-name:var(--font-display)] text-[14.5px] font-semibold">
                  {s.titulo}
                </span>
                <span className="mt-1.5 block text-pretty text-[12.5px] leading-relaxed text-gray-500">
                  {s.detalle}
                </span>
              </div>
            ))}
          </div>
        </Contenedor>
      </section>

      {/* ── Migración ─────────────────────────────────────────────────────── */}
      <section id="soporte">
        <Contenedor className="pt-16 sm:pt-[72px]">
          <div className="rounded-2xl border border-[#e7ebfa] bg-[#fafbfe] p-6 sm:p-8">
            <div className="grid grid-cols-1 items-center gap-9 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <span className="inline-flex h-[26px] items-center rounded-full bg-[#edf1fe] px-3 text-[11px] font-semibold uppercase tracking-[.5px] text-[#2a48c4]">
                  Acompañamiento incluido
                </span>
                <h2 className="mt-3.5 text-pretty font-[family-name:var(--font-display)] text-[clamp(1.4rem,3.5vw,1.7rem)] font-semibold leading-tight tracking-[-1px]">
                  Soporte personalizado para tu migración
                </h2>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-[#5c6373]">
                  No importa de dónde vengas: de otro sistema, de hojas de Excel o de carpetas en
                  papel. Un especialista se sienta contigo, ordena tu información y la deja cargada
                  y cuadrada en Zero antes de que empieces a operar.
                </p>
                <Link href="/contacto" className="mt-5 inline-flex items-center gap-2 text-[13.5px] font-semibold text-zero-600 hover:text-[#102a72]">
                  Cuéntanos cómo tienes tus datos hoy
                  <Flecha />
                </Link>
              </div>

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
            </div>
          </div>
        </Contenedor>
      </section>

      {/* ── Cierre ────────────────────────────────────────────────────────── */}
      <section id="demo">
        <Contenedor className="py-16 sm:py-[74px]">
          <LlamadoFinal
            titulo="¿Listos para operar sobre Zero?"
            detalle="Agenda una demo personalizada y vemos tu operación módulo por módulo."
            accion="Solicitar demo"
            href="/contacto"
          />
        </Contenedor>
      </section>
    </>
  );
}
