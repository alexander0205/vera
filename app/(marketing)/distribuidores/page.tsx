/**
 * Distribuidores autorizados — quién más vende Zero en República Dominicana.
 *
 * Solo lo que consta del distribuidor: razón social, RNC, RPE, dirección,
 * teléfonos y correo. Nada de «desde <año>», clientes, cifras ni logos suyos:
 * esta página la lee quien quiere comprobar que el distribuidor es de verdad, y
 * un dato que no podemos respaldar es justo lo que la vuelve dudosa.
 *
 * Los datos van en una lista y no escritos en el marcado: el siguiente
 * distribuidor es una entrada más, con la misma tarjeta.
 */

import type { Metadata } from 'next';
import { CONTACTO, Contenedor, LazoDeFondo, LlamadoFinal } from '../_piezas';
import { DatosDeRuta } from '../_datos-estructurados';

export const metadata: Metadata = {
  title: 'Distribuidores autorizados',
  description:
    'S J & T Vision Multiservices, S.R.L. es distribuidor autorizado de Zero en República Dominicana: vende la plataforma, la implementa y da el soporte local.',
  alternates: { canonical: '/distribuidores' },
};

type Distribuidor = {
  razonSocial: string;
  rnc: string;
  rpe: string;
  direccion: string;
  telefonos: readonly { texto: string; href: string }[];
  correo: string;
};

const DISTRIBUIDORES: readonly Distribuidor[] = [
  {
    razonSocial: 'S J & T Vision Multiservices, S.R.L.',
    rnc: '131-02569-2',
    rpe: '118609',
    direccion: 'Calle Principal No. 5, Belleza de los Altos, Santo Domingo Este',
    telefonos: [
      { texto: '809 217 4906', href: 'tel:+18092174906' },
      { texto: '829 512 6376', href: 'tel:+18295126376' },
    ],
    correo: 'tecnologia@sjtmultiservices.com',
  },
];

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[.5px] text-gray-500">{etiqueta}</dt>
      <dd className="m-0 mt-1 text-pretty text-[13.5px] leading-relaxed text-[#0f1118]">{children}</dd>
    </div>
  );
}

function TarjetaDistribuidor({ d }: { d: Distribuidor }) {
  const enlace = 'transition hover:text-zero-600';
  return (
    <article className="rounded-2xl border border-[#e9ebf3] bg-white p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[.9fr_1.1fr]">
        <div className="min-w-0">
          <span className="inline-flex h-[26px] items-center rounded-full bg-[#edf1fe] px-3 text-[11px] font-semibold uppercase tracking-[.5px] text-[#2a48c4]">
            Distribuidor autorizado
          </span>
          <h2 className="mt-3.5 text-pretty font-[family-name:var(--font-display)] text-[clamp(1.3rem,4vw,1.6rem)] font-semibold leading-tight tracking-[-.8px] text-[#102a72]">
            {d.razonSocial}
          </h2>
          <p className="mt-3 text-pretty text-[13.5px] leading-relaxed text-[#5c6373]">
            Vende Zero, lo implementa y da el soporte local en República Dominicana.
          </p>
          <dl className="m-0 mt-5 grid grid-cols-2 gap-4">
            <Dato etiqueta="RNC"><span className="tabular-nums">{d.rnc}</span></Dato>
            <Dato etiqueta="RPE"><span className="tabular-nums">{d.rpe}</span></Dato>
          </dl>
        </div>

        <dl className="m-0 flex flex-col gap-4 border-t border-[#f0f2f8] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <Dato etiqueta="Dirección">{d.direccion}</Dato>
          <Dato etiqueta="Teléfonos">
            {d.telefonos.map((t, i) => (
              <span key={t.href}>
                {i > 0 && ' · '}
                <a href={t.href} className={`tabular-nums ${enlace}`}>{t.texto}</a>
              </span>
            ))}
          </Dato>
          <Dato etiqueta="Correo">
            <a href={`mailto:${d.correo}`} className={`break-all ${enlace}`}>{d.correo}</a>
          </Dato>
        </dl>
      </div>
    </article>
  );
}

export default function DistribuidoresPage() {
  return (
    <>
      <DatosDeRuta migas={[{ nombre: 'Distribuidores autorizados', ruta: '/distribuidores' }]} />

      {/* Sin `overflow-hidden`, como en contacto: recortaba el lazo de fondo
          con una línea recta. El desborde horizontal lo tapa el layout. */}
      <section className="relative bg-gradient-to-b from-[#f5f7fe] to-white to-[62%] pt-14">
        <LazoDeFondo arriba={400} />
        <Contenedor className="relative">
          <div className="mx-auto max-w-[660px] text-center">
            <div className="inline-flex h-[30px] items-center gap-2.5 rounded-full border border-[#e0e4f0] bg-white px-3.5 text-xs font-medium text-zero-600">
              <span className="size-1.5 rounded-full bg-zero-600" />
              Distribuidores autorizados
            </div>
            <h1 className="mt-5 text-pretty font-[family-name:var(--font-display)] text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.1] tracking-[-.04em]">
              Distribuidores autorizados <span className="text-zero-600">de Zero</span>
            </h1>
            <p className="mx-auto mt-4 max-w-[520px] text-pretty text-[15.5px] leading-relaxed text-[#5c6373]">
              Zero es la plataforma de Yisrael Technology LLC. Nuestros distribuidores autorizados la
              venden, la implementan y dan el soporte local en República Dominicana.
            </p>
          </div>

          <div className="mx-auto mt-10 flex max-w-[960px] flex-col gap-4">
            {DISTRIBUIDORES.map(d => <TarjetaDistribuidor key={d.rnc} d={d} />)}
          </div>
        </Contenedor>
      </section>

      <section>
        <Contenedor className="py-14">
          <LlamadoFinal
            titulo="¿Prefieres hablar directo con Zero?"
            detalle={`Ventas atiende ${CONTACTO.horarioVentas.toLowerCase()}.`}
            accion="Ir a contacto"
            href="/contacto"
          />
        </Contenedor>
      </section>
    </>
  );
}
