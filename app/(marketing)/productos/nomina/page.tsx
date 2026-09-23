/**
 * Nómina — la página del módulo que paga al personal.
 *
 * De la maqueta de esta landing quedaron fuera tres promesas que el sistema no
 * cumple hoy: el archivo de pago masivo para el banco, las liquidaciones de
 * prestaciones y el envío del volante por correo o WhatsApp —el volante existe,
 * pero se descarga en PDF (`lib/pdf/VolanteNominaPDF.tsx`)—. Lo que sí está,
 * comprobado en el código: el cálculo de AFP, SFS, ISR e INFOTEP
 * (`lib/nomina/calculo.ts`), el archivo de la TSS
 * (`app/api/nomina/corridas/[id]/tss`), las horas, los contratos y el asiento
 * contable al cerrar la corrida.
 */

import type { Metadata } from 'next';
import { ADDONS, addonBajoCotizacion } from '@/lib/config/plans';
import { urlDelSitio } from '@/lib/config/enlaces';
import { DatosDeProducto } from '../../_datos-estructurados';
import { Contenedor, Iconos } from '../../_piezas';
import { Antetitulo, Titulo } from '../../_bloques';
import { CalculadoraNomina } from './_calculadora';
import {
  CierreProducto, FranjaProducto, HeroProducto, PrecioProducto, SeccionProducto,
  type PuntoDeProducto,
} from '../../_producto';

export const metadata: Metadata = {
  title: 'Software de nómina República Dominicana — TSS, AFP, SFS, ISR e INFOTEP',
  description:
    'Sueldos, AFP, SFS, ISR e INFOTEP calculados con la ley dominicana, el archivo de la TSS listo para subir, volantes de pago, provisiones de regalía y vacaciones, y el asiento contable hecho.',
  keywords: ['software de nómina República Dominicana', 'nómina TSS', 'cálculo de ISR asalariados', 'regalía pascual', 'AFP SFS INFOTEP', 'nómina para colegios'],
  alternates: { canonical: '/productos/nomina' },
  openGraph: {
    type: 'website',
    url: urlDelSitio('/productos/nomina'),
    title: 'Nómina dominicana: TSS, ISR, regalía y vacaciones',
    description: 'La quincena se cierra sola y el asiento contable entra sin volver a digitar.',
  },
};

const NOMINA = ADDONS.find(a => a.key === 'nomina');
const PRECIO_NOMINA = NOMINA && !addonBajoCotizacion('nomina', 'ecf') ? NOMINA.price : null;

const CORRIDA: PuntoDeProducto[] = [
  { titulo: 'Cálculo con la ley de aquí', detalle: 'AFP, SFS, ISR e INFOTEP aplicados al sueldo de cada quien, en cada corrida, con los topes del año.', icono: Iconos.engranaje },
  { titulo: 'El archivo de la TSS', detalle: 'Sale de la corrida listo, con lo que cotiza cada empleado. Nadie lo arma a mano.', icono: Iconos.papel },
  { titulo: 'Volante de pago', detalle: 'Cada empleado tiene el suyo en PDF, con el desglose de lo que se le pagó y lo que se le descontó.', icono: Iconos.hoja },
  { titulo: 'Horas, bonos y descuentos', detalle: 'Extras, incentivos y préstamos aplicados por regla, no por memoria.', icono: Iconos.reloj },
  { titulo: 'Regalía y vacaciones', detalle: 'Las provisiones se acumulan mes a mes, así diciembre no es una sorpresa de caja.', icono: Iconos.dinero },
  { titulo: 'El asiento, solo', detalle: 'Al cerrar la corrida, la nómina y sus retenciones entran al diario sin volver a digitar.', icono: Iconos.contabilidad },
];

const PERSONAL: PuntoDeProducto[] = [
  { titulo: 'Expediente del empleado', detalle: 'Cargo, salario, documentos y el historial de lo que ha cambiado, en un solo sitio.', icono: Iconos.usuarios },
  { titulo: 'Contratos', detalle: 'Se arman desde el sistema y salen en PDF para firmar.', icono: Iconos.papel },
  { titulo: 'Seguros y descuentos fijos', detalle: 'Lo que se le retiene todos los meses queda configurado una vez.', icono: Iconos.escudo },
  { titulo: 'Quién ve los sueldos', detalle: 'Permisos aparte: se puede registrar asistencia sin poder ver lo que gana nadie.', icono: Iconos.base },
];

export default function NominaPage() {
  return (
    <>
      <HeroProducto
        antetitulo="Nómina"
        titulo="La quincena se cierra sola."
        bajada="Sueldos, AFP, SFS, ISR, regalía y vacaciones calculados con la ley dominicana, y asentados en tu contabilidad sin volver a digitar."
        pie={PRECIO_NOMINA !== null
          ? `+US$${PRECIO_NOMINA} al mes sobre cualquier plan · Incluida en los planes de colegio`
          : 'Se suma a cualquier plan · Incluida en los planes de colegio'}
      />

      {/* ── La calculadora ────────────────────────────────────────────────── */}
      {/* Es el ancla de la página: un dueño entiende su nómina cuando ve las
          dos mitades juntas —lo que se le descuenta al empleado y lo que le
          cuesta a él por encima del sueldo—, y esa segunda casi nadie la tiene
          en la cabeza. Corre con el MOTOR del sistema, no con una fórmula
          escrita para la web. */}
      <section id="calculadora" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <div className="min-w-0">
              <Antetitulo>Cuéntalo tú</Antetitulo>
              <Titulo className="mt-3.5">¿Cuánto cuesta de verdad un empleado?</Titulo>
              <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.6] text-[#5c6373]">
                Mueve el sueldo y mira las dos mitades: lo que se le descuenta —AFP, SFS e ISR— y lo
                que la empresa paga por encima, que es la parte que nadie tiene en la cabeza cuando
                ofrece un salario.
              </p>
              <p className="m-0 mt-3.5 text-pretty text-[13px] leading-[1.55] text-[#8a90a0]">
                Los números salen del mismo motor que corre tu nómina adentro.
              </p>
            </div>
            <CalculadoraNomina />
          </div>
        </Contenedor>
      </section>

      <SeccionProducto
        id="corrida"
        antetitulo="La corrida"
        titulo="Paga a tiempo, sin hojas de cálculo."
        detalle="Lo que hoy se arma entre una hoja, la calculadora y el portal de la TSS sale de una sola pantalla."
        puntos={CORRIDA}
      />

      <SeccionProducto
        id="personal"
        antetitulo="El personal"
        titulo="El expediente de cada quien, al día."
        detalle="Docentes por asignatura, personal por hora, administrativos: la nómina se ajusta a cómo paga tu institución, no al revés."
        puntos={PERSONAL}
        columnas={2}
      />

      <FranjaProducto
        antetitulo="Pegada a la contabilidad"
        titulo="Pagar y contabilizar dejan de ser dos trabajos."
        detalle="La nómina no es un programa aparte que después hay que pasar a mano al sistema contable: cierra la corrida y el asiento ya está hecho."
        lineas={[
          'El gasto de sueldos, las retenciones y el neto a pagar, cada uno en su cuenta',
          'Las provisiones de regalía y vacaciones se asientan cuando se acumulan',
          'Las cuentas las configuras una vez y se respetan en cada corrida',
          'Queda el registro de quién corrió la nómina y cuándo',
        ]}
      />

      <PrecioProducto
        texto={
          PRECIO_NOMINA !== null
            ? <>Se suma a cualquier plan por <strong className="font-semibold">US${PRECIO_NOMINA} al mes</strong>. En los planes de colegio viene incluida: un colegio siempre tiene personal.</>
            : <>Se suma a cualquier plan. En los planes de colegio viene incluida: un colegio siempre tiene personal.</>
        }
      />

      <CierreProducto
        antetitulo="Nómina"
        titulo="Que la próxima quincena te tome una hora."
        detalle="Cuéntanos cómo pagas hoy y te dejamos cargados los empleados, sus sueldos y sus descuentos fijos."
        nota={{
          titulo: 'Lo que hace falta de tu lado',
          detalle: 'La lista de tu personal con sus sueldos, y quién va a correr la nómina cada quincena.',
        }}
      />

      <DatosDeProducto
        nombre="Zero Nómina"
        descripcion="Nómina dominicana con AFP, SFS, ISR e INFOTEP calculados por la ley, archivo de la TSS, volantes de pago, provisiones de regalía y vacaciones, y asiento contable automático."
        ruta="/productos/nomina"
        precioDesde={PRECIO_NOMINA}
        funciones={[
          'Cálculo de AFP, SFS, ISR e INFOTEP con los topes del año',
          'Archivo de la TSS listo para subir',
          'Volante de pago en PDF por empleado',
          'Horas extra, bonos y descuentos por regla',
          'Provisiones de regalía y vacaciones',
          'Asiento contable al cerrar la corrida',
          'Expediente y contratos del personal',
        ]}
      />
    </>
  );
}
