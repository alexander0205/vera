import type { Metadata } from 'next';
import { urlDelSitio } from '@/lib/config/enlaces';
import { Apartado, Dato, Enlace, Guia, Lista, Parrafo, Tabla } from '../../_guia';

export const metadata: Metadata = {
  title: 'ITBIS y formulario IT-1: cómo se calcula y cuándo se declara',
  description:
    'El ITBIS general es 18 %. Se declara con el formulario IT-1 dentro de los primeros 20 días del mes siguiente, aunque el mes haya estado en cero. Cómo se calcula lo que se paga y qué pasa si se presenta tarde.',
  keywords: [
    'ITBIS República Dominicana', 'formulario IT-1', 'cuándo se declara el ITBIS',
    'cómo se calcula el ITBIS', 'ITBIS 18 por ciento', 'mora ITBIS DGII',
  ],
  alternates: { canonical: '/guias/itbis-it1' },
  openGraph: {
    type: 'article',
    url: urlDelSitio('/guias/itbis-it1'),
    title: 'ITBIS y formulario IT-1',
    description: 'La tasa, la cuenta, la fecha y lo que cuesta llegar tarde.',
  },
};

const PREGUNTAS = [
  {
    pregunta: '¿Hay que declarar si no vendí nada?',
    respuesta: 'Sí. Todo contribuyente registrado presenta su IT-1 cada mes, aunque sea en cero. No presentarla es un incumplimiento por sí mismo, independientemente de que no hubiera impuesto que pagar.',
  },
  {
    pregunta: '¿Qué pasa si presento tarde?',
    respuesta: 'Corre un recargo por mora por cada mes o fracción de mes de atraso, más un interés indemnizatorio que la DGII fija cada año. Con la Ley 30-26, vigente desde junio de 2026, ese recargo bajó del 10 % al 3 % mensual, con tope del 100 % del impuesto adeudado.',
  },
  {
    pregunta: '¿Todo lo que vendo lleva ITBIS?',
    respuesta: 'No. Hay bienes y servicios exentos y algunos con tasa reducida. Lo que sí es obligatorio es que cada línea de tu factura diga qué tasa lleva, porque de ahí sale el reporte y la declaración.',
  },
  {
    pregunta: '¿El ITBIS que pago a mis proveedores se recupera?',
    respuesta: 'Se compensa: el ITBIS que te cobraron en compras vinculadas a tu actividad se resta del que cobraste en ventas. Por eso las compras hay que registrarlas bien y a tiempo, no solo las ventas.',
  },
];

export default function GuiaItbis() {
  return (
    <Guia
      slug="itbis-it1"
      categoria="Guía · Fiscal"
      titulo="ITBIS y formulario IT-1: la cuenta y la fecha"
      bajada="La tasa general del ITBIS es 18 %. Cada mes se declara con el formulario IT-1 dentro de los primeros 20 días del mes siguiente —el de enero, antes del 20 de febrero—, y se presenta aunque el mes haya estado en cero."
      actualizada="2026-09-24"
      minutos={5}
      preguntas={PREGUNTAS}
      fuentes={[
        { texto: 'DGII · ITBIS', url: 'https://dgii.gov.do/cicloContribuyente/obligacionesTributarias/principalesImpuestos/Paginas/Itbis.aspx' },
        { texto: 'DGII · Infografía del ITBIS (PDF)', url: 'https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/Infografias/Infografia-ITBIS.pdf' },
      ]}
      cta={{
        titulo: 'El IT-1 sale de lo que ya facturaste',
        detalle: 'Si cada factura lleva su tasa y cada compra su ITBIS adelantado, la declaración no se arma: se lee. Y los reportes 606 y 607 cuadran con ella porque salen del mismo registro.',
        href: '/productos/contabilidad',
        accion: 'Ver Contabilidad',
      }}
    >
      <Dato>
        <strong className="font-semibold">Lo que se paga</strong> no es el 18 % de lo que vendiste:
        es el ITBIS que cobraste menos el que pagaste en tus compras del mes. Por eso registrar las
        compras a tiempo es tan importante como facturar bien.
      </Dato>

      <Apartado titulo="La cuenta, con un ejemplo">
        <Tabla
          columnas={['Concepto', 'Monto']}
          filas={[
            ['Ventas del mes, sin ITBIS', 'RD$500,000.00'],
            ['ITBIS cobrado a tus clientes (18 %)', 'RD$90,000.00'],
            ['Compras del mes, sin ITBIS', 'RD$200,000.00'],
            ['ITBIS pagado a tus proveedores (18 %)', 'RD$36,000.00'],
            ['ITBIS a pagar a la DGII', 'RD$54,000.00'],
          ]}
        />
        <Parrafo>
          Si el ITBIS de tus compras supera al de tus ventas —un mes de mucho inventario, por
          ejemplo— queda un saldo a favor que se arrastra al mes siguiente.
        </Parrafo>
      </Apartado>

      <Apartado titulo="Las fechas que importan">
        <Tabla
          columnas={['Obligación', 'Cuándo']}
          filas={[
            ['Formatos 606, 607 y 608', 'Primeros 15 días del mes siguiente'],
            ['Declaración y pago del IT-1', 'Primeros 20 días del mes siguiente'],
          ]}
        />
        <Parrafo>
          El orden no es casualidad: los reportes van primero porque son la materia prima de la
          declaración. Quien los deja para el día 19 termina declarando a ciegas.{' '}
          <Enlace href="/guias/reportes-606-607-608">Cómo funcionan el 606, el 607 y el 608</Enlace>
        </Parrafo>
      </Apartado>

      <Apartado titulo="Lo que cuesta llegar tarde">
        <Parrafo>
          Presentar fuera de plazo genera un recargo por cada mes o fracción de mes de atraso, más
          un interés indemnizatorio. La <strong className="font-semibold">Ley 30-26</strong>,
          vigente desde junio de 2026, bajó ese recargo del 10 % al 3 % mensual, con tope del 100 %
          del impuesto adeudado. Es menos castigo que antes, pero sigue creciendo mes a mes.
        </Parrafo>
      </Apartado>

      <Apartado titulo="Los errores que se pagan caro">
        <Lista
          puntos={[
            <><strong className="font-semibold">Facturar sin separar la tasa.</strong> Si la línea no dice si lleva 18 %, tasa reducida o exento, el reporte sale mal y la declaración detrás.</>,
            <><strong className="font-semibold">Registrar las compras tarde.</strong> El ITBIS que no registraste a tiempo no te lo compensas ese mes: pagas de más y lo arrastras.</>,
            <><strong className="font-semibold">No declarar en cero.</strong> Un mes sin ventas sigue necesitando su IT-1.</>,
            <><strong className="font-semibold">Declarar sin cuadrar contra los libros.</strong> Si el IT-1 no cuadra con el 607, la diferencia aparece tarde o temprano.</>,
          ]}
        />
      </Apartado>
    </Guia>
  );
}
