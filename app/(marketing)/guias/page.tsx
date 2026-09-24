/**
 * El índice de guías.
 *
 * La lista vive aquí y la usa también el sitemap, para que una guía nueva entre
 * a los dos sitios a la vez. Con dos listas, la guía que se escribe un martes se
 * queda fuera del sitemap hasta que alguien se acuerde.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { urlDelSitio } from '@/lib/config/enlaces';
import { Contenedor, Flecha } from '../_piezas';
import { Antetitulo } from '../_bloques';
import { DatosDeRuta } from '../_datos-estructurados';

export const metadata: Metadata = {
  title: 'Guías: facturación electrónica, ITBIS, reportes de la DGII y nómina dominicana',
  description:
    'Cómo emitir un e-CF y cuánto cuesta, cuándo se declara el ITBIS, cuándo se envían el 606, el 607 y el 608, cómo se calcula la nómina con AFP, SFS e ISR y cómo se saca la regalía pascual. Explicado en corto y sin vender nada.',
  keywords: [
    'guías fiscales República Dominicana', 'cómo facturar electrónicamente', 'reportes DGII',
    'nómina dominicana', 'regalía pascual', 'ITBIS', 'formulario IT-1',
    'cuánto cuesta facturación electrónica',
  ],
  alternates: { canonical: '/guias' },
  openGraph: {
    type: 'website',
    url: urlDelSitio('/guias'),
    title: 'Guías de Zero: DGII, facturación y nómina',
    description: 'Los trámites que todo negocio dominicano tiene que hacer, explicados en corto y con sus fuentes.',
  },
};

export type Guia = {
  slug: string;
  categoria: string;
  titulo: string;
  resumen: string;
  minutos: number;
};

export const GUIAS: Guia[] = [
  {
    slug: 'emitir-ecf-dgii',
    categoria: 'Facturación',
    titulo: 'Cómo emitir un e-CF ante la DGII',
    resumen: 'Los cuatro requisitos, la postulación, el set de pruebas y las secuencias. El trámite entero, con los errores que más tiempo cuestan.',
    minutos: 7,
  },
  {
    slug: 'reportes-606-607-608',
    categoria: 'Fiscal',
    titulo: 'Formatos 606, 607 y 608: qué son y cuándo se envían',
    resumen: 'Qué reporta cada uno, qué lleva campo por campo y por qué rebotan los envíos. Se mandan dentro de los primeros 15 días del mes siguiente.',
    minutos: 6,
  },
  {
    slug: 'cuanto-cuesta-facturacion-electronica',
    categoria: 'Facturación',
    titulo: '¿Cuánto cuesta facturar electrónicamente en República Dominicana?',
    resumen: 'El facturador de la DGII es gratis hasta 150 comprobantes al mes; el certificado digital no lo regala nadie. Las cuatro partidas y las seis preguntas que hacerle a cualquier proveedor.',
    minutos: 7,
  },
  {
    slug: 'itbis-it1',
    categoria: 'Fiscal',
    titulo: 'ITBIS y formulario IT-1: la cuenta y la fecha',
    resumen: 'La tasa general es 18 % y la declaración va antes del día 20 del mes siguiente, aunque el mes haya estado en cero. Con un ejemplo de la cuenta y lo que cuesta llegar tarde.',
    minutos: 5,
  },
  {
    slug: 'calcular-nomina',
    categoria: 'Nómina',
    titulo: 'Cómo se calcula la nómina en República Dominicana',
    resumen: 'AFP, SFS e ISR del empleado, y lo que la empresa paga por encima del sueldo. Con un ejemplo de cuánto cuesta de verdad contratar.',
    minutos: 6,
  },
  {
    slug: 'regalia-pascual',
    categoria: 'Nómina',
    titulo: 'Regalía pascual: cómo se calcula y cuándo se paga',
    resumen: 'La doceava parte del salario ordinario del año, entre el 9 y el 20 de diciembre. Qué entra en la base, qué no, y por qué conviene provisionarla.',
    minutos: 5,
  },
];

export default function GuiasPage() {
  return (
    <>
      <section className="bg-[linear-gradient(180deg,#f4f8ff_0%,#ffffff_100%)]">
        <Contenedor className="pt-14 sm:pt-[60px]">
          <div className="mx-auto max-w-[760px]">
            <Antetitulo>Guías</Antetitulo>
            <h1 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[clamp(2rem,5vw,3rem)] font-semibold leading-[1.06] tracking-[-.045em] text-balance text-[#102a72]">
              Los trámites que hay que hacer sí o sí, explicados en corto.
            </h1>
            <p className="m-0 mt-5 text-pretty text-[17px] leading-[1.6] text-[#4a5164]">
              Facturación electrónica, ITBIS, reportes de la DGII y nómina dominicana. Sirven aunque no uses
              Zero: la respuesta está en el primer párrafo y el producto aparece al final, si acaso.
            </p>
          </div>
        </Contenedor>
      </section>

      <Contenedor className="pb-4 pt-10">
        <ul className="m-0 mx-auto grid max-w-[900px] list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-2">
          {GUIAS.map(g => (
            <li key={g.slug} className="min-w-0">
              <Link
                href={`/guias/${g.slug}`}
                className="flex h-full min-w-0 flex-col rounded-2xl border border-[#e7edfb] bg-white p-6 transition hover:-translate-y-0.5 hover:border-zero-200 hover:shadow-[0_22px_40px_-28px_rgba(16,42,114,.45)]"
              >
                <span className="text-[10.5px] font-semibold uppercase tracking-[.16em] text-zero-600">
                  {g.categoria}
                </span>
                <span className="mt-3 block text-pretty font-[family-name:var(--font-display)] text-[17px] font-semibold leading-[1.25] tracking-[-.025em] text-[#102a72]">
                  {g.titulo}
                </span>
                <span className="mt-2.5 block text-pretty text-[13.5px] leading-[1.6] text-[#5c6373]">
                  {g.resumen}
                </span>
                <span className="mt-4 flex items-center gap-2 text-[12.5px] font-semibold text-zero-600">
                  Leer · {g.minutos} min
                  <Flecha tamano={13} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Contenedor>

      <DatosDeRuta migas={[{ nombre: 'Guías', ruta: '/guias' }]} />
    </>
  );
}
