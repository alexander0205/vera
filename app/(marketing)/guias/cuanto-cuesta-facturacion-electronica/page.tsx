import type { Metadata } from 'next';
import { urlDelSitio } from '@/lib/config/enlaces';
import { ADDONS, limiteTexto, planesDeLinea } from '@/lib/config/plans';
import { Apartado, Dato, Enlace, Guia, Lista, Parrafo, Tabla } from '../../_guia';
import { PRUEBA } from '@/lib/config/suscripcion';

export const metadata: Metadata = {
  title: '¿Cuánto cuesta facturar electrónicamente en República Dominicana?',
  description:
    'El facturador gratuito de la DGII cuesta RD$0 y emite hasta 150 comprobantes al mes. El certificado digital ronda los RD$1,700 a RD$2,500 al año y no lo regala nadie. Lo que se paga de verdad, partida por partida.',
  keywords: [
    'cuánto cuesta facturación electrónica República Dominicana',
    'precio software facturación electrónica', 'costo certificado digital e-CF',
    'facturador gratuito DGII', 'software e-CF precio', 'cuánto cuesta un ERP dominicano',
  ],
  alternates: { canonical: '/guias/cuanto-cuesta-facturacion-electronica' },
  openGraph: {
    type: 'article',
    url: urlDelSitio('/guias/cuanto-cuesta-facturacion-electronica'),
    title: '¿Cuánto cuesta facturar electrónicamente en RD?',
    description: 'Partida por partida, incluyendo lo que casi nadie pone en la cotización.',
  },
};

const PREGUNTAS = [
  {
    pregunta: '¿Se puede facturar electrónicamente gratis?',
    respuesta: 'Sí. La DGII ofrece un facturador gratuito con tope de 150 comprobantes al mes. Lo que no es gratis es el certificado digital, que hace falta igual: sin él no se firma ningún e-CF, ni en el facturador de la DGII ni en ningún sistema.',
  },
  {
    pregunta: '¿El certificado digital viene incluido en el software?',
    respuesta: 'Normalmente no. El certificado lo emite una entidad de certificación autorizada por el INDOTEL —no la DGII y no el proveedor del software—, se compra aparte y se renueva. Conviene preguntarlo antes de firmar, porque es la partida que más veces aparece después.',
  },
  {
    pregunta: '¿Por qué unos proveedores cobran por comprobante y otros por plan?',
    respuesta: 'Son dos modelos. Por comprobante parece barato al empezar y se vuelve impredecible cuando el negocio crece; por plan se sabe lo que se paga cada mes, pero hay que elegir el tramo con holgura. Lo importante es saber cuál de los dos te están cotizando.',
  },
  {
    pregunta: '¿Hay que pagar implementación?',
    respuesta: 'Depende del proveedor y del tamaño del negocio. Un negocio que factura desde cero no suele necesitarla; uno que trae años de inventario y clientes en otro sistema sí, porque migrar esos datos es trabajo real. Se pregunta y se pone por escrito.',
  },
];

/**
 * Los precios salen del catálogo, no de un texto a mano.
 *
 * Una guía que dice «desde US$9» escrita a mano es la que sigue diciendo US$9
 * el día que el plan sube. La cifra se lee de `lib/config/plans.ts`, igual que
 * la página de precios.
 */
function filasDeZero(): readonly (readonly string[])[] {
  return planesDeLinea('erp').map(({ plan, precio }) => [
    plan.name,
    plan.limits.docs < 0 ? 'e-CF ilimitados' : `${limiteTexto(plan.limits.docs)} al mes`,
    plan.limits.users < 0 ? 'ilimitados' : limiteTexto(plan.limits.users),
    `US$${precio}/mes`,
  ]);
}

export default function GuiaCuantoCuesta() {
  const nomina = ADDONS.find(a => a.key === 'nomina');
  const pos = ADDONS.find(a => a.key === 'pos');

  return (
    <Guia
      slug="cuanto-cuesta-facturacion-electronica"
      categoria="Guía · Facturación"
      titulo="¿Cuánto cuesta facturar electrónicamente en República Dominicana?"
      bajada="Facturar en sí puede costar RD$0: la DGII tiene un facturador gratuito con tope de 150 comprobantes al mes. Lo que no es gratis, y hace falta igual, es el certificado digital: ronda los RD$1,700 a RD$2,500 al año según el proveedor."
      actualizada="2026-09-24"
      minutos={7}
      preguntas={PREGUNTAS}
      fuentes={[
        { texto: 'DGII · Facturador Gratuito', url: 'https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/facturador-gratuito.aspx' },
        { texto: 'DGII · Preguntas frecuentes del Facturador Gratuito (PDF)', url: 'https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Preguntas%20frecuentes/Generales/Preguntas-Frecuentes-Facturador-Gratuito.pdf' },
        { texto: 'INDOTEL · Entidades de certificación autorizadas', url: 'https://indotel.gob.do/firma-digital/entidades-de-certificacion/' },
      ]}
      cta={{
        titulo: 'Lo que cuesta Zero, sin cotizar',
        detalle: `Los planes están publicados con sus topes y lo que incluye cada uno. La contabilidad va dentro de todos, sin costo aparte, y la prueba es de ${PRUEBA.dias} días${PRUEBA.pideTarjeta ? '' : ' sin tarjeta'}.`,
        href: '/precios',
        accion: 'Ver los precios',
      }}
    >
      <Dato>
        <strong className="font-semibold">Empieza por lo gratis.</strong> Si facturas menos de 150
        comprobantes al mes y no necesitas inventario, cuentas por cobrar ni contabilidad, el
        facturador de la DGII te sirve y no te cuesta la licencia. Solo emite facturas: no sustituye
        a un sistema contable, y esa es la frontera por la que la gente acaba pagando software.
      </Dato>

      <Apartado titulo="Las cuatro partidas de verdad">
        <Parrafo>
          Casi toda cotización mezcla estas cuatro cosas en un solo número. Separarlas es la única
          forma de comparar dos propuestas.
        </Parrafo>
        <Lista
          puntos={[
            <><strong className="font-semibold">El certificado digital.</strong> Obligatorio, lo emite una entidad autorizada por el INDOTEL y se renueva —normalmente cada año—. Ronda los RD$1,700 a RD$2,500 anuales según el proveedor. No lo vende el software y no lo regala la DGII.</>,
            <><strong className="font-semibold">La licencia del sistema.</strong> El mes o el año de uso. Por plan con tope, o por comprobante emitido.</>,
            <><strong className="font-semibold">La implementación.</strong> Cargar tu catálogo, tus clientes, tus saldos y capacitar a quien va a facturar. Cero si arrancas de cero; real si traes años de datos.</>,
            <><strong className="font-semibold">Lo que no se cotiza.</strong> El tiempo de tu gente. Es la partida más grande y la única que no aparece en ninguna propuesta.</>,
          ]}
        />
      </Apartado>

      <Apartado titulo="Lo que cuesta Zero">
        <Parrafo>
          Lo publicamos en vez de pedir que nos escribas para saberlo. La línea de facturación va por
          tramos de comprobantes al mes, y la contabilidad completa está incluida en todos —no es un
          módulo que se paga aparte—.
        </Parrafo>
        <Tabla columnas={['Plan', 'Comprobantes', 'Usuarios', 'Precio']} filas={filasDeZero()} />
        <Parrafo>
          Por encima de eso hay dos adicionales que se suman solo si los usas:
          {pos && <> {pos.name}, +US${pos.price} al mes</>}
          {nomina && <>, y {nomina.name}, +US${nomina.price} al mes</>}. Los colegios tienen su
          propia línea, por cantidad de estudiantes, y ahí los dos vienen dentro.{' '}
          <Enlace href="/precios">Ver los planes completos</Enlace>
        </Parrafo>
      </Apartado>

      <Apartado titulo="Qué preguntar antes de firmar, a nosotros o a cualquiera">
        <Parrafo>
          Estas seis preguntas separan una cotización honesta de una sorpresa a los tres meses.
          Sirven igual si la propuesta que tienes en la mano no es la nuestra.
        </Parrafo>
        <Lista
          puntos={[
            <>¿El <strong className="font-semibold">certificado digital</strong> está incluido o lo compro yo?</>,
            <>¿Qué pasa si <strong className="font-semibold">paso el tope</strong> de comprobantes un mes bueno? ¿Se corta, se cobra aparte, se sube el plan?</>,
            <>¿Cuántos <strong className="font-semibold">usuarios</strong> entran en el precio y cuánto cuesta el siguiente?</>,
            <>¿La <strong className="font-semibold">contabilidad y los reportes 606, 607 y 608</strong> están dentro, o son módulos que se pagan?</>,
            <>Si me voy, ¿<strong className="font-semibold">me llevo mis datos</strong>? ¿En qué formato y cuánto tarda?</>,
            <>¿Hay <strong className="font-semibold">contrato mínimo</strong> o cancelo cuando quiera?</>,
          ]}
        />
      </Apartado>

      <Apartado titulo="La cuenta que conviene hacer">
        <Parrafo>
          La pregunta útil no es cuánto cuesta el software: es cuántas horas al mes se le van a
          alguien cuadrando facturas, persiguiendo cobros y armando el 606 a mano. A un sueldo
          administrativo dominicano, tres horas a la semana ya valen más que cualquiera de los
          planes de arriba. Si ese tiempo no baja, el software está de más por muy barato que
          sea.{' '}<Enlace href="/guias/reportes-606-607-608">Lo que toma armar el 606 y el 607</Enlace>
        </Parrafo>
      </Apartado>
    </Guia>
  );
}
