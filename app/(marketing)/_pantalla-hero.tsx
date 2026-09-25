/**
 * La pantalla del hero: el panel de la empresa de demostración y, encima, la
 * frase del H1 hecha de verdad.
 *
 * El H1 dice que una venta «se registra una vez y cae donde tiene que caer».
 * Antes eso lo decían dos tarjetas quietas; ahora entra una venta y se ve caer
 * en la factura, el inventario, la cartera y la contabilidad, y al final sale
 * su asiento. La animación es CSS puro (ver `globals.css`, «La tesis de la
 * portada»): corre sin JavaScript, no espera a la hidratación y con «menos
 * movimiento» sale quieta.
 *
 * Las cifras son las de la captura: el Supermercado Los Pinos es el primer
 * cliente del panel y el saco de arroz cuesta lo que dice el catálogo de la
 * demo (`scripts/seed-demo-negocio.ts`). Veinte sacos exentos de ITBIS: el
 * asiento cuadra a la vista, sin impuesto que explicar.
 *
 * En el teléfono va un recorte —ingresos del mes y tendencia— en vez del panel
 * entero: encogido a 340 px, el panel quedaba con letra de tres píxeles. Es un
 * solo `<picture>`, así que el teléfono no descarga la imagen de escritorio.
 */

import { getImageProps } from 'next/image';
import { Cheque, Iconos } from './_piezas';

const ALT = 'Panel de Zero de una distribuidora: ingresos del mes, tendencia de seis meses y cuentas por cobrar';

const VENTA = { cliente: 'Supermercado Los Pinos', detalle: '20 sacos de arroz selecto', total: 'RD$99,000.00' };

/** Dónde cae la venta. En orden: es el orden en que el sistema lo escribe. */
const DESTINOS = [
  { donde: 'Factura e-CF', que: 'aceptada por la DGII' },
  { donde: 'Inventario', que: '−20 sacos' },
  // «Cartera» y no «Cuentas por cobrar»: es la palabra del H1, y la larga se
  // partía en dos líneas dentro de la tarjeta.
  { donde: 'Cartera', que: 'vence en 30 días' },
  { donde: 'Contabilidad', que: 'asiento creado' },
] as const;

/** Milisegundos desde que pinta la página. */
const RITMO = { venta: 450, destino: 850, entreDestinos: 260, asiento: 2050, lineas: 2300, sello: 2700 };

const retraso = (ms: number) => ({ '--retraso': `${ms}ms` }) as React.CSSProperties;

function Venta({ animada }: { animada: boolean }) {
  return (
    <>
      <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[.16em] text-zero-600">Una venta, registrada una vez</p>
      <p className="m-0 mt-2 font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[-.02em] text-[#102a72]">
        {VENTA.cliente}
      </p>
      <p className="m-0 mt-0.5 text-[12px] text-[#5c6373]">
        {VENTA.detalle} · <span className="font-semibold tabular-nums text-[#102a72]">{VENTA.total}</span>
      </p>
      <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 border-t border-[#eef1f8] p-0 pt-3">
        {DESTINOS.map((d, i) => (
          <li
            key={d.donde}
            className={`flex items-center gap-2 text-[12px] ${animada ? 'hero-aparece' : ''}`}
            style={animada ? retraso(RITMO.destino + i * RITMO.entreDestinos) : undefined}
          >
            <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-[#e6f7ee]">
              <Cheque tamano={10} color="#12925a" grosor={3.6} />
            </span>
            <span className="font-semibold text-[#102a72]">{d.donde}</span>
            <span className="ml-auto text-[11.5px] text-[#5c6373]">{d.que}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function PantallaDelHero() {
  const comun = { alt: ALT, sizes: '(min-width: 1024px) 940px, 100vw' };
  const {
    props: { srcSet: escritorio },
  } = getImageProps({ ...comun, src: '/home/capturas/demo-facturacion.png', width: 1440, height: 900, priority: true });
  const { props: movil } = getImageProps({
    ...comun, src: '/home/capturas/demo-facturacion-recorte.png', width: 678, height: 453, priority: true,
  });

  return (
    <div className="relative mt-10 sm:mt-[52px]">
      <div className="relative mx-auto max-w-[940px]">
        {/* En escritorio, una pantalla con su marco; en el teléfono, una tarjeta. */}
        <div className="overflow-hidden rounded-2xl border border-[#e2e8f7] bg-white shadow-[0_30px_60px_-34px_rgba(16,42,114,.5)] md:rounded-b-none md:border-0 md:bg-[#1b2333] md:p-3 md:pb-0 md:shadow-[0_50px_90px_-40px_rgba(16,42,114,.55)]">
          <picture>
            <source media="(min-width: 768px)" srcSet={escritorio} sizes={comun.sizes} />
            {/* Dirección de arte con `getImageProps`: `<Image>` no sabe cambiar de
                archivo según el ancho, y dos `<Image>` escondidos con CSS
                descargarían los dos. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              {...movil}
              className="block aspect-[678/453] h-auto w-full object-cover md:aspect-[1440/900] md:rounded-t-lg"
            />
          </picture>
        </div>
        <div className="mx-auto hidden h-[15px] max-w-[1010px] rounded-b-xl bg-[linear-gradient(180deg,#d8dee9,#aeb6c6)] shadow-[0_14px_24px_-14px_rgba(16,42,114,.45)] md:block" />

        {/* La venta entra por la izquierda y cae en sus cuatro sitios. */}
        <figure
          className="hero-entra-izquierda absolute left-[clamp(-84px,-4.5vw,0px)] top-[57%] m-0 hidden w-[min(292px,32%)] rounded-2xl border border-[#e7ecf7] bg-white p-4 shadow-[0_26px_50px_-24px_rgba(16,42,114,.45)] md:block"
          style={retraso(RITMO.venta)}
        >
          <Venta animada />
        </figure>

        {/* Y sale su asiento, que nadie escribió. */}
        <figure
          className="hero-entra-derecha absolute right-[clamp(-78px,-4vw,0px)] top-[9%] m-0 hidden w-[min(300px,32%)] rounded-2xl border border-[#e7ecf7] bg-white p-4 shadow-[0_26px_50px_-24px_rgba(16,42,114,.45)] md:block"
          style={retraso(RITMO.asiento)}
        >
          <div className="flex items-center gap-2">
            <span className="grid size-[28px] place-items-center rounded-[9px] bg-[#edf1fe] text-zero-600">
              <Iconos.contabilidad className="size-4" />
            </span>
            <figcaption className="font-[family-name:var(--font-display)] text-[14px] font-semibold tracking-[-.02em] text-[#102a72]">
              Asiento contable
            </figcaption>
            <span
              className="hero-sella ml-auto rounded-full bg-[#e6f7ee] px-2 py-0.5 text-[10.5px] font-semibold text-[#0f7a4b]"
              style={retraso(RITMO.sello)}
            >
              Cuadra
            </span>
          </div>
          <table className="mt-3 w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-[.12em] text-[#666d80]">
                <th className="pb-1 text-left font-semibold">Cuenta</th>
                <th className="pb-1 text-right font-semibold">Debe</th>
                <th className="pb-1 pl-2 text-right font-semibold">Haber</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Cuentas por cobrar', '99,000.00', ''],
                ['Ventas', '', '99,000.00'],
              ].map(([cuenta, debe, haber], i) => (
                <tr key={cuenta} className="hero-aparece border-t border-[#eef1f8]" style={retraso(RITMO.lineas + i * 180)}>
                  <td className={`whitespace-nowrap py-1.5 ${haber ? 'pl-3' : ''} text-[#102a72]`}>{cuenta}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#3b4252]">{debe}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-[#3b4252]">{haber}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 mt-2 text-[11.5px] text-[#5c6373]">Nadie lo escribió a mano.</p>
        </figure>
      </div>

      {/* En el teléfono la venta va debajo, sin animar: cuando se llega a ella
          con el dedo, una animación que corrió al cargar ya terminó. */}
      <div className="mx-auto mt-4 max-w-[460px] rounded-2xl border border-[#e7ecf7] bg-white p-4 shadow-[0_20px_40px_-28px_rgba(16,42,114,.45)] md:hidden">
        <Venta animada={false} />
      </div>
    </div>
  );
}
