import type { Metadata } from 'next';
import { urlDelSitio } from '@/lib/config/enlaces';
import { Apartado, Dato, Enlace, Guia, Lista, Parrafo, Tabla } from '../../_guia';

export const metadata: Metadata = {
  title: 'Regalía pascual: cómo se calcula y cuándo se paga en República Dominicana',
  description:
    'La regalía es la doceava parte del salario ordinario que el trabajador ganó en el año calendario, y se paga entre el 9 y el 20 de diciembre. No paga ISR ni cotiza a la TSS. Con ejemplos y los casos que confunden.',
  keywords: [
    'regalía pascual', 'doble sueldo República Dominicana', 'salario de Navidad',
    'cómo se calcula la regalía', 'cuándo se paga la regalía pascual', 'artículo 219 Código de Trabajo',
  ],
  alternates: { canonical: '/guias/regalia-pascual' },
  openGraph: {
    type: 'article',
    url: urlDelSitio('/guias/regalia-pascual'),
    title: 'Regalía pascual: cómo se calcula y cuándo se paga',
    description: 'La doceava parte del salario ordinario del año, antes del 20 de diciembre.',
  },
};

const PREGUNTAS = [
  {
    pregunta: '¿Entran las horas extra y las comisiones?',
    respuesta: 'La regalía se calcula sobre el salario ordinario. Las horas extra no entran. Con las comisiones depende de cómo esté pactada la remuneración: cuando son parte del salario ordinario del trabajador, entran en la base. Ante la duda, conviene consultarlo con un laboralista antes de diciembre, no después.',
  },
  {
    pregunta: '¿Y si el empleado entró a mitad de año?',
    respuesta: 'Cobra la parte que le toca: se suman los salarios ordinarios que ganó desde que entró y se divide entre doce. No se prorratea por meses trabajados, se divide el total ganado entre doce.',
  },
  {
    pregunta: '¿Se le paga a quien ya salió de la empresa?',
    respuesta: 'Sí, por el tiempo que trabajó en ese año. Es un derecho que se gana mes a mes, no un bono por estar presente en diciembre.',
  },
  {
    pregunta: '¿Paga impuestos?',
    respuesta: 'No paga ISR ni cotiza a la TSS. Al empleado le llega completa, y para la empresa es gasto deducible.',
  },
];

export default function GuiaRegalia() {
  return (
    <Guia
      slug="regalia-pascual"
      categoria="Guía · Nómina"
      titulo="Regalía pascual: cómo se calcula y cuándo se paga"
      bajada="Es la doceava parte de lo que el trabajador ganó de salario ordinario durante el año calendario, y se paga entre el 9 y el 20 de diciembre. No se le descuenta ISR ni TSS: le llega completa."
      actualizada="2026-09-24"
      minutos={5}
      preguntas={PREGUNTAS}
      fuentes={[
        { texto: 'Ministerio de Trabajo · Código de Trabajo', url: 'https://mt.gob.do/' },
        { texto: 'DGII · Impuesto sobre la renta de asalariados', url: 'https://dgii.gov.do/cicloContribuyente/obligacionesTributarias/principalesImpuestos/Paginas/impuestoSobreLaRenta.aspx' },
      ]}
      cta={{
        titulo: 'Zero la provisiona mes a mes',
        detalle: 'Cada corrida acumula la parte que toca, con su asiento contable. En diciembre no hay que buscar de dónde sacar el dinero: ya estaba apartado.',
        href: '/productos/nomina',
        accion: 'Ver Nómina',
      }}
    >
      <Dato>
        <strong className="font-semibold">La cuenta:</strong> suma todo el salario ordinario que el
        trabajador ganó del 1 de enero al 31 de diciembre y divide entre 12. Eso es la regalía.
      </Dato>

      <Apartado titulo="Un ejemplo">
        <Parrafo>
          Un empleado que ganó RD$45,000 al mes todo el año recibe un sueldo completo: doce meses de
          salario ordinario divididos entre doce.
        </Parrafo>
        <Tabla
          columnas={['Caso', 'Cuenta', 'Regalía']}
          filas={[
            ['Todo el año a RD$45,000', '540,000 ÷ 12', 'RD$45,000.00'],
            ['Entró en julio, RD$45,000', '270,000 ÷ 12', 'RD$22,500.00'],
            ['Subió de 30,000 a 45,000 en julio', '(180,000 + 270,000) ÷ 12', 'RD$37,500.00'],
          ]}
        />
        <Parrafo>
          Por eso el que entró a mitad de año no cobra medio sueldo exacto ni el que tuvo aumento
          cobra el último salario: la base es lo que de verdad ganó, no lo que gana hoy.
        </Parrafo>
      </Apartado>

      <Apartado titulo="Qué entra en la base y qué no">
        <Lista
          puntos={[
            <><strong className="font-semibold">Entra:</strong> el salario ordinario de cada mes.</>,
            <><strong className="font-semibold">No entran:</strong> las horas extra.</>,
            <><strong className="font-semibold">Depende:</strong> las comisiones, según cómo esté pactada la remuneración.</>,
          ]}
        />
      </Apartado>

      <Apartado titulo="La fecha, que es la parte que se olvida">
        <Parrafo>
          El pago va entre el 9 y el 20 de diciembre. No es «antes de fin de año»: pagarla el 23 ya
          es tarde, y es de las cosas que un inspector revisa sin que nadie se lo pida.
        </Parrafo>
      </Apartado>

      <Apartado titulo="Por qué conviene provisionarla">
        <Parrafo>
          La regalía no es un gasto de diciembre: es un gasto de todo el año que se paga en
          diciembre. Apartar cada mes la doceava parte —y asentarla— reparte el golpe y deja el
          estado de resultados diciendo la verdad mes a mes. Lo mismo vale para las vacaciones.{' '}
          <Enlace href="/guias/calcular-nomina">Cómo se calcula la nómina completa</Enlace>
        </Parrafo>
      </Apartado>
    </Guia>
  );
}
