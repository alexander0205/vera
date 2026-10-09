import type { Metadata } from 'next';
import { urlDelSitio } from '@/lib/config/enlaces';
import { Apartado, Dato, Enlace, Guia, Lista, Parrafo, Tabla } from '../../_guia';

export const metadata: Metadata = {
  title: 'Formatos 606, 607 y 608 de la DGII: qué son y cuándo se envían',
  description:
    'El 606 reporta tus compras y gastos, el 607 tus ventas y el 608 los comprobantes anulados. Se envían por la Oficina Virtual dentro de los primeros 15 días del mes siguiente, aunque el mes haya estado en cero.',
  keywords: [
    'formato 606 DGII', 'formato 607', 'formato 608 anulados', 'cuándo se presenta el 606',
    'reportes DGII República Dominicana', 'envío de datos Oficina Virtual',
  ],
  alternates: { canonical: '/guias/reportes-606-607-608' },
  openGraph: {
    type: 'article',
    url: urlDelSitio('/guias/reportes-606-607-608'),
    title: 'Formatos 606, 607 y 608 de la DGII',
    description: 'Qué reporta cada uno, cuándo se envían y los errores que más rebotan.',
  },
};

const PREGUNTAS = [
  {
    pregunta: '¿Hay que enviarlos si no hubo operaciones?',
    respuesta: 'Sí. Si el mes no tuvo compras, ventas o anulaciones, el formato se envía en cero. No enviarlo es un incumplimiento aunque no haya nada que reportar.',
  },
  {
    pregunta: '¿Qué pasa si me equivoqué en un NCF ya enviado?',
    respuesta: 'Se corrige reenviando el formato del período con el dato correcto. Por eso conviene revisar antes de enviar: es más barato corregir la factura en tu sistema que rehacer el reporte.',
  },
  {
    pregunta: '¿El 608 lleva las notas de crédito?',
    respuesta: 'No. El 608 es para comprobantes anulados —los que se dejaron sin usar o se anularon como tales—. Una nota de crédito es un comprobante nuevo que rebaja o anula otro, y va en el 607 como cualquier emisión.',
  },
  {
    pregunta: '¿El 606 incluye los gastos menores?',
    respuesta: 'Sí, con su tipo de comprobante. Los gastos sin factura del proveedor se documentan con comprobante de gastos menores y se reportan igual, con su clasificación de bienes y servicios.',
  },
];

export default function GuiaReportes() {
  return (
    <Guia
      slug="reportes-606-607-608"
      categoria="Guía · Fiscal"
      titulo="Formatos 606, 607 y 608: qué son y cuándo se envían"
      bajada="El 606 reporta lo que compraste, el 607 lo que vendiste y el 608 los comprobantes anulados. Los tres se envían por la Oficina Virtual dentro de los primeros 15 días del mes siguiente, y se envían aunque el mes haya estado en cero."
      actualizada="2026-09-24"
      minutos={6}
      preguntas={PREGUNTAS}
      fuentes={[
        { texto: 'DGII · Formatos de envío de datos', url: 'https://dgii.gov.do/cicloContribuyente/obligacionesTributarias/remisionInformacion/Paginas/formatoEnvioDatos.aspx' },
        { texto: 'DGII · Oficina Virtual', url: 'https://www.dgii.gov.do/ofv/Pages/default.aspx' },
      ]}
      cta={{
        titulo: 'Los tres salen armados',
        detalle: 'Si las facturas y las compras están bien registradas, el reporte se genera con eso: no hay que volver a capturar nada ni cuadrarlo contra la contabilidad, porque sale de ella.',
        href: '/productos/contabilidad',
        accion: 'Ver Contabilidad',
      }}
    >
      <Dato>
        <strong className="font-semibold">La fecha:</strong> dentro de los primeros 15 días del mes
        siguiente al período que se reporta. El de septiembre se envía en los primeros 15 días de
        octubre.
      </Dato>

      <Apartado titulo="Qué reporta cada uno">
        <Tabla
          columnas={['Formato', 'Qué lleva']}
          filas={[
            ['606', 'Compras de bienes y servicios: quién te vendió, con qué comprobante, por cuánto y qué retenciones aplicaste'],
            ['607', 'Ventas: los comprobantes que emitiste, con su tipo, su monto y su ITBIS'],
            ['608', 'Comprobantes anulados, con el motivo de la anulación'],
          ]}
        />
      </Apartado>

      <Apartado titulo="Lo que lleva el 606, campo por campo">
        <Lista
          puntos={[
            'RNC o cédula del proveedor, y su tipo de identificación',
            'Tipo de bienes y servicios comprados: es una clasificación de la DGII, no texto libre',
            'NCF de la factura del proveedor, y el NCF modificado si es una nota',
            'Fecha del comprobante y fecha de pago',
            'Monto facturado, ITBIS facturado y el ITBIS que retuviste',
            'Retención de ISR cuando aplica, con su tipo',
          ]}
        />
        <Parrafo>
          La clasificación de bienes y servicios es donde más se equivoca la gente: no es una
          categoría contable interna, es la lista de la DGII, y un gasto mal clasificado cambia lo
          que el reporte dice de tu negocio.
        </Parrafo>
      </Apartado>

      <Apartado titulo="Los errores que hacen rebotar el envío">
        <Lista
          puntos={[
            <><strong className="font-semibold">NCF mal escrito.</strong> Un carácter de más o un tipo que no corresponde y la línea se rechaza.</>,
            <><strong className="font-semibold">RNC inválido.</strong> El del proveedor tiene que existir en el padrón; conviene validarlo al registrar la compra, no al declarar.</>,
            <><strong className="font-semibold">Retenciones que no cuadran.</strong> Si retuviste ITBIS o ISR, el monto declarado tiene que coincidir con lo que efectivamente retuviste y pagaste.</>,
            <><strong className="font-semibold">Períodos cruzados.</strong> Una factura de un mes registrada en otro descuadra los dos reportes.</>,
          ]}
        />
      </Apartado>

      <Apartado titulo="Por qué duele hacerlo a mano">
        <Parrafo>
          Armar estos formatos en una hoja de cálculo significa volver a capturar lo que ya está en
          las facturas, con el riesgo de que el reporte diga una cosa y la contabilidad otra. Cuando
          salen del mismo registro que emitió la factura y asentó la compra, cuadran por
          construcción.{' '}
          <Enlace href="/guias/emitir-ecf-dgii">Cómo emitir un e-CF ante la DGII</Enlace>
        </Parrafo>
      </Apartado>
    </Guia>
  );
}
