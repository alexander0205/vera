import type { Metadata } from 'next';
import { urlDelSitio } from '@/lib/config/enlaces';
import { TASAS_NOMINA_2026 } from '@/lib/config/nomina-tasas';
import { calcularNominaEmpleado } from '@/lib/nomina/calculo';
import { Apartado, Dato, Enlace, Guia, Lista, Parrafo, Tabla } from '../../_guia';

export const metadata: Metadata = {
  title: 'Cómo se calcula la nómina en República Dominicana: AFP, SFS, ISR e INFOTEP',
  description:
    'Al empleado se le descuentan AFP, SFS e ISR; la empresa paga además AFP, SFS, riesgos laborales e INFOTEP. Las tasas vigentes, un ejemplo con números y cuánto cuesta de verdad un sueldo.',
  keywords: [
    'cómo se calcula la nómina República Dominicana', 'descuentos de nómina TSS', 'AFP SFS ISR',
    'cuánto cuesta un empleado en RD', 'INFOTEP', 'aportes patronales',
  ],
  alternates: { canonical: '/guias/calcular-nomina' },
  openGraph: {
    type: 'article',
    url: urlDelSitio('/guias/calcular-nomina'),
    title: 'Cómo se calcula la nómina en República Dominicana',
    description: 'AFP, SFS, ISR, INFOTEP y lo que la empresa paga por encima del sueldo.',
  },
};

const t = TASAS_NOMINA_2026;

/**
 * El ejemplo sale del MOTOR, no de una cuenta escrita en la guía.
 *
 * Es la misma función que corre la nómina dentro del sistema: si cambia la
 * escala del ISR, este párrafo cambia con ella. Una guía con números a mano
 * envejece el día que sube una tasa, y nadie vuelve a revisarla.
 */
const EJEMPLO_SUELDO = 45_000;
const d = calcularNominaEmpleado({
  salarioMensualCents: EJEMPLO_SUELDO * 100,
  tasas: t,
});

const peso = (cents: number) =>
  `RD$${(cents / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toLocaleString('es-DO', { maximumFractionDigits: 2 })} %`;

const PREGUNTAS = [
  {
    pregunta: '¿El INFOTEP se le descuenta al empleado?',
    respuesta: `No. El INFOTEP (${pct(t.infotepPatronal)}) lo paga la empresa sobre la nómina, igual que su parte de AFP, SFS y riesgos laborales. Al empleado solo se le descuentan AFP, SFS e ISR.`,
  },
  {
    pregunta: '¿Sobre qué base se calcula el ISR?',
    respuesta: 'Sobre el sueldo menos lo que el empleado aportó a AFP y SFS, porque esas dos son deducibles. Por eso el ISR no se calcula sobre el bruto: se calcula sobre lo que queda después de la seguridad social.',
  },
  {
    pregunta: '¿Hay tope para cotizar?',
    respuesta: 'Sí. AFP, SFS y riesgos laborales cotizan hasta un múltiplo del salario mínimo cotizable, distinto para cada régimen. De ahí para arriba, el aporte se queda en el tope.',
  },
  {
    pregunta: '¿La regalía pascual cotiza?',
    respuesta: 'No. La regalía no paga ISR ni cotiza a la TSS, y se calcula aparte del sueldo del mes.',
  },
];

export default function GuiaNomina() {
  return (
    <Guia
      slug="calcular-nomina"
      categoria="Guía · Nómina"
      titulo="Cómo se calcula la nómina en República Dominicana"
      bajada={`Al empleado se le descuentan tres cosas: AFP (${pct(t.afpEmpleado)}), SFS (${pct(t.sfsEmpleado)}) e ISR. La empresa paga además su propia parte de AFP y SFS, riesgos laborales e INFOTEP — que en un sueldo típico suma alrededor de un 16 % por encima del salario.`}
      actualizada="2026-09-24"
      minutos={6}
      preguntas={PREGUNTAS}
      fuentes={[
        { texto: 'TSS · Tesorería de la Seguridad Social', url: 'https://www.tss.gob.do/' },
        { texto: 'DGII · Escala del ISR para asalariados', url: 'https://dgii.gov.do/herramientasConsultas/calculadoras/Paginas/calculadoraISRAsalariados.aspx' },
      ]}
      cta={{
        titulo: 'Pruébalo con tus sueldos',
        detalle: 'La calculadora de la página de Nómina usa este mismo motor: mueves el sueldo y ves las dos mitades, la del empleado y la de la empresa.',
        href: '/productos/nomina',
        accion: 'Abrir la calculadora',
      }}
    >
      <Parrafo>
        La nómina dominicana tiene dos lados que casi nunca se cuentan juntos. Uno es lo que se le
        descuenta al empleado, que es lo que él ve en su volante. El otro es lo que la empresa paga
        por encima del sueldo, que no aparece en ningún recibo y es el que descuadra el presupuesto
        de quien contrata por primera vez.
      </Parrafo>

      <Apartado titulo="Lo que se le descuenta al empleado">
        <Tabla
          columnas={['Concepto', 'Tasa']}
          filas={[
            ['AFP · fondo de pensiones', pct(t.afpEmpleado)],
            ['SFS · seguro familiar de salud', pct(t.sfsEmpleado)],
            ['ISR · impuesto sobre la renta', 'Según escala anual'],
          ]}
        />
        <Parrafo>
          El ISR no se calcula sobre el sueldo completo: primero se restan la AFP y el SFS del
          empleado, porque son deducibles, y sobre lo que queda se aplica la escala anual de la
          DGII. Quien gana por debajo del mínimo exento no paga ISR aunque sí cotice a la TSS.
        </Parrafo>
      </Apartado>

      <Apartado titulo="Lo que paga la empresa, encima del sueldo">
        <Tabla
          columnas={['Concepto', 'Tasa']}
          filas={[
            ['AFP patronal', pct(t.afpPatronal)],
            ['SFS patronal', pct(t.sfsPatronal)],
            ['Riesgos laborales (SRL)', `desde ${pct(t.srlPatronal)}`],
            ['INFOTEP', pct(t.infotepPatronal)],
          ]}
        />
        <Parrafo>
          La tasa de riesgos laborales depende del nivel de riesgo de la empresa, así que no es la
          misma para una oficina que para una constructora. AFP, SFS y SRL cotizan hasta un tope
          ligado al salario mínimo cotizable; el INFOTEP no tiene tope.
        </Parrafo>
      </Apartado>

      <Apartado titulo="Un ejemplo con números">
        <Parrafo>
          Un sueldo de {peso(EJEMPLO_SUELDO * 100)} al mes, sin otras deducciones:
        </Parrafo>
        <Tabla
          columnas={['Concepto', 'Monto']}
          filas={[
            ['Sueldo bruto', peso(d.brutoCents)],
            [`AFP del empleado (${pct(t.afpEmpleado)})`, `− ${peso(d.afpEmpleadoCents)}`],
            [`SFS del empleado (${pct(t.sfsEmpleado)})`, `− ${peso(d.sfsEmpleadoCents)}`],
            ['ISR', d.isrCents > 0 ? `− ${peso(d.isrCents)}` : 'Exento'],
            ['Neto a pagar', peso(d.netoCents)],
            ['Aportes de la empresa', `+ ${peso(d.totalPatronalCents)}`],
            ['Costo total para la empresa', peso(d.brutoCents + d.totalPatronalCents)],
          ]}
        />
        <Dato>
          Ese sueldo de {peso(EJEMPLO_SUELDO * 100)} le cuesta a la empresa{' '}
          {peso(d.brutoCents + d.totalPatronalCents)} al mes. Es la cifra con la que hay que hacer
          el presupuesto, no con el bruto.
        </Dato>
      </Apartado>

      <Apartado titulo="Lo que falta sumar al año">
        <Lista
          puntos={[
            <><strong className="font-semibold">Regalía pascual:</strong> un sueldo extra repartido, que conviene provisionar mes a mes. <Enlace href="/guias/regalia-pascual">Cómo se calcula</Enlace></>,
            <><strong className="font-semibold">Vacaciones:</strong> se acumulan con la antigüedad y se pagan cuando se toman.</>,
            <><strong className="font-semibold">Horas extra y bonos:</strong> entran al bruto del mes en que se pagan y cotizan con él.</>,
          ]}
        />
        <Parrafo>
          Provisionar la regalía y las vacaciones cada mes es la diferencia entre un diciembre
          tranquilo y uno buscando de dónde sacar el dinero.
        </Parrafo>
      </Apartado>
    </Guia>
  );
}
