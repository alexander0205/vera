/**
 * Zero ERP — la página del sistema con el que trabaja un negocio cualquiera.
 *
 * Cuatro secciones con ancla —facturación, cobros, inventario y compras,
 * contabilidad— porque son los cuatro destinos a los que apunta la rejilla de
 * módulos de la portada. Sin ancla propia, esas cuatro tarjetas llevarían las
 * cuatro al mismo sitio, que es el error que ya se arregló en el pie.
 *
 * Lo que se anuncia está comprobado en el código. De la maqueta de esta landing
 * quedaron fuera a propósito: lotes con vencimiento, conteo físico y traslados
 * entre almacenes. No existen.
 *
 * La sección de inventario iba con una captura del catálogo de un COLEGIO
 * CLIENTE —su nombre, su matrícula y sus artículos— y se quitó. Una pantalla
 * de producto no se saca de la cuenta de alguien que confió sus datos: si hace
 * falta una, se monta con datos de mentira.
 */

import type { Metadata } from 'next';
import { familiaBajoCotizacion, planesDeFamilia } from '@/lib/config/plans';
import { urlDelSitio } from '@/lib/config/enlaces';
import { DatosDeProducto, DatosDeRuta } from '../../_datos-estructurados';
import { Contenedor, Iconos } from '../../_piezas';
import { Antetitulo, Titulo } from '../../_bloques';
import { RecorridoDelDinero } from './_recorrido';
import {
  CierreProducto, FranjaProducto, HeroProducto, PrecioProducto, SeccionProducto,
  PreguntasProducto, type PuntoDeProducto,
} from '../../_producto';

export const metadata: Metadata = {
  title: 'Zero ERP — facturación electrónica, inventario y contabilidad para República Dominicana',
  description:
    'Facturación e-CF ante la DGII, cuentas por cobrar con links de pago, inventario con costo real, compras con retenciones y contabilidad con asientos automáticos y reportes 606, 607 y 608.',
  keywords: [
    'ERP República Dominicana', 'facturación electrónica e-CF', 'comprobante fiscal electrónico DGII',
    'software de contabilidad', 'control de inventario', 'reportes 606 607 608', 'cuentas por cobrar',
  ],
  alternates: { canonical: '/productos/erp' },
  openGraph: {
    type: 'website',
    url: urlDelSitio('/productos/erp'),
    images: [{ url: '/home/capturas/demo-facturacion.png', width: 1440, height: 900, alt: 'Facturación en Zero' }],
    title: 'Zero ERP — factura ante la DGII, cobra e inventaría en un solo sistema',
    description: 'e-CF, cobros, inventario con costo real, compras y contabilidad con asientos automáticos.',
  },
};

/** El «desde US$N» sale del catálogo, y se calla si la línea se cotiza. */
const PRECIOS_ECF = familiaBajoCotizacion('ecf')
  ? []
  : planesDeFamilia('ecf').map(p => p.price).filter(p => p > 0);

const DESDE = PRECIOS_ECF.length > 0 ? Math.min(...PRECIOS_ECF) : null;
/** El techo del rango, para declarar la oferta como `AggregateOffer`. */
const HASTA = PRECIOS_ECF.length > 0 ? Math.max(...PRECIOS_ECF) : null;

const FACTURACION: PuntoDeProducto[] = [
  { titulo: 'Los diez tipos de e-CF', detalle: 'Factura de crédito fiscal, consumo, notas de crédito y débito, gubernamental y las demás, emitidas y acusadas ante la DGII.', icono: Iconos.factura },
  { titulo: 'Sale al cliente sola', detalle: 'El PDF va por correo a nombre de tu empresa, con su XML, y también puede ir por WhatsApp.', icono: Iconos.correo },
  { titulo: 'Cotizaciones', detalle: 'Se envían, se aprueban y se convierten en factura sin volver a escribir nada.', icono: Iconos.papel },
  { titulo: 'Facturas que se repiten', detalle: 'Las igualas y mensualidades se emiten solas el día que toca.', icono: Iconos.reloj },
  { titulo: 'Tus secuencias, controladas', detalle: 'Cada tipo de comprobante con su rango autorizado, y la anulación de los que no se usaron.', icono: Iconos.base },
  { titulo: 'Impresoras fiscales', detalle: 'Para el que ya tiene la suya puesta en el mostrador.', icono: Iconos.pos },
];

const COBROS: PuntoDeProducto[] = [
  { titulo: 'Quién te debe y desde cuándo', detalle: 'La cartera completa, con los días vencidos de cada factura y los abonos aplicados.', icono: Iconos.dinero },
  { titulo: 'Links de pago', detalle: 'El cliente paga con tarjeta por CardNet y ves en qué va cada enlace que mandaste.', icono: Iconos.tarjeta },
  { titulo: 'El cobro con su comprobante', detalle: 'Se registra con su método, su banco y la foto del depósito adjunta.', icono: Iconos.escudo },
  { titulo: 'Caja con turnos', detalle: 'Apertura, cierre y cuadre por cajero, con su corte imprimible.', icono: Iconos.reloj },
];

const INVENTARIO: PuntoDeProducto[] = [
  { titulo: 'Existencias por almacén', detalle: 'Qué hay y dónde está, con aviso cuando un producto baja del mínimo que pusiste.', icono: Iconos.cuadros },
  { titulo: 'Costo real, no estimado', detalle: 'Cada entrada recalcula el costo promedio, así sabes cuánto ganas de verdad en cada venta.', icono: Iconos.dinero },
  { titulo: 'La venta descuenta sola', detalle: 'Emitir la factura mueve el inventario, y anularla lo devuelve.', icono: Iconos.crecer },
  { titulo: 'Compras y gastos', detalle: 'La factura del proveedor entra desde una foto, actualiza el costo y deja la cuenta por pagar.', icono: Iconos.papel },
  { titulo: 'Retenciones donde tocan', detalle: 'ITBIS e ISR retenidos al proveedor, calculados y asentados.', icono: Iconos.escudo },
  { titulo: 'Variantes y listas de precios', detalle: 'Tallas, colores y presentaciones, con precio de mostrador, mayoreo o cliente frecuente.', icono: Iconos.tienda },
];

const CONTABILIDAD: PuntoDeProducto[] = [
  { titulo: 'El asiento lo hace el sistema', detalle: 'Factura, cobro, nota de crédito, compra, gasto, depreciación y nómina entran solos al diario.', icono: Iconos.contabilidad },
  { titulo: 'Libros y balances', detalle: 'Diario, mayor, balance de comprobación, estado de resultados y balance general.', icono: Iconos.hoja },
  { titulo: '606, 607 y 608', detalle: 'Los reportes salen armados en el formato que la DGII pide.', icono: Iconos.reportes },
  { titulo: 'Activos fijos y cierre', detalle: 'La depreciación corre sola y el ejercicio se cierra sin armar nada aparte.', icono: Iconos.engranaje },
];

const PREGUNTAS = [
  {
    pregunta: '¿Zero emite comprobantes fiscales electrónicos ante la DGII?',
    respuesta: 'Sí. Emite los diez tipos de e-CF —factura de crédito fiscal, consumo, notas de crédito y débito, gubernamental, regímenes especiales y las demás—, firmados y acusados por la DGII desde el mismo sistema, sin software aparte y sin pagar a un tercero por el envío.',
  },
  {
    pregunta: '¿Cuánto cuesta un ERP con facturación electrónica en República Dominicana?',
    respuesta: `Zero ERP arranca en US$${DESDE ?? 9} al mes e incluye facturación e-CF, cuentas por cobrar, inventario, compras y contabilidad. Lo que cambia entre planes es cuántos comprobantes emites y cuántas personas lo usan. El punto de venta se suma por US$9 al mes y la nómina por US$12. Sin contrato mínimo y con 15 días de prueba.`,
  },
  {
    pregunta: '¿Incluye contabilidad o hay que comprarla aparte?',
    respuesta: 'Incluida en todos los planes, sin costo extra: cada factura, cobro, compra, gasto, nómina y depreciación deja su asiento en el diario. La mayoría de la competencia la cobra aparte o no la tiene.',
  },
  {
    pregunta: '¿Genera los reportes 606, 607 y 608?',
    respuesta: 'Sí, en el formato que la DGII pide y armados con lo que ya registraste durante el mes. No hay que volver a capturar nada para declarar.',
  },
  {
    pregunta: '¿Hay que instalar algo?',
    respuesta: 'No. Funciona en el navegador, desde cualquier computadora o tableta. Lo único que puede necesitar instalación es una impresora fiscal si ya tienes una.',
  },
  {
    pregunta: '¿Migran mis datos actuales?',
    respuesta: 'Sí. Un equipo dominicano carga tus productos, clientes y saldos pendientes, deja lista la habilitación de e-CF ante la DGII y entrena a quien va a facturar todos los días.',
  },
] as const;

export default function ErpPage() {
  return (
    <>
      <HeroProducto
        antetitulo="Zero ERP"
        titulo="Deja de perseguir lo que te deben y de armar los 606 a mano."
        bajada="Facturación electrónica, cobros, inventario, compras y contabilidad sobre los mismos datos. Se registra una vez y cae donde tiene que caer."
        pie={DESDE !== null ? `Desde US$${DESDE} al mes · 15 días de prueba · Sin instalación` : '15 días de prueba · Sin instalación'}
        captura="/home/capturas/demo-facturacion.png"
        alt="Panel de Zero con los ingresos del mes, las secuencias disponibles y la cartera"
      />

      {/* ── El recorrido, caminable ───────────────────────────────────────── */}
      {/* La portada lo cuenta en tarjetas quietas. Aquí se camina: cada paso
          dice qué hace el usuario y qué escribe el sistema por su cuenta, que
          es la diferencia entre un facturador y un ERP. */}
      <section id="recorrido" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.62fr)_minmax(0,1.7fr)] lg:gap-12">
            <div className="min-w-0">
              <Antetitulo>El recorrido del dinero</Antetitulo>
              <Titulo className="mt-3.5">Una venta, de la cotización a la declaración.</Titulo>
              <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.6] text-[#5c6373]">
                Seis pasos, y en cada uno el sistema escribe solo lo que hoy alguien copia a mano:
                el comprobante, el movimiento de inventario, el asiento contable y el reporte.
              </p>
              <p className="m-0 mt-3.5 text-pretty text-[13px] leading-[1.55] text-[#8a90a0]">
                Toca un paso para quedarte en él.
              </p>
            </div>
            <RecorridoDelDinero />
          </div>
        </Contenedor>
      </section>

      <SeccionProducto
        id="facturacion"
        antetitulo="Facturación electrónica"
        titulo="El comprobante fiscal, emitido y acusado ante la DGII."
        detalle="Sin software aparte, sin pagar a un tercero por el envío y sin copiar la factura a otro sistema."
        puntos={FACTURACION}
      />

      <SeccionProducto
        id="cobros"
        antetitulo="Cobros y cuentas por cobrar"
        titulo="Saber quién te debe deja de ser un trabajo."
        detalle="La cartera se arma sola con lo que ya facturaste, y cada cobro entra con su comprobante."
        puntos={COBROS}
        columnas={2}
        captura="/home/capturas/demo-cartera.png"
        alt="Cuentas por cobrar en Zero, con los días vencidos de cada factura"
      />

      <SeccionProducto
        id="inventario"
        antetitulo="Inventario y compras"
        titulo="La mercancía cuadra con lo que facturas."
        detalle="El mismo producto que facturas es el que sale del almacén: no hay dos conteos ni dos verdades."
        puntos={INVENTARIO}
        captura="/home/capturas/demo-inventario.png"
        alt="Catálogo de productos y servicios de Zero con existencias y precios"
      />

      <SeccionProducto
        id="contabilidad"
        antetitulo="Contabilidad"
        titulo="Cada operación deja su asiento, sin que nadie lo escriba."
        detalle="Va incluida en todos los planes: la competencia la cobra aparte o no la tiene. Tiene su propia página, con el asiento armándose en vivo."
        puntos={CONTABILIDAD}
        columnas={2}
        captura="/home/capturas/demo-contabilidad.png"
        alt="Panorama de contabilidad en Zero con sus libros y reportes"
      />

      <FranjaProducto
        antetitulo="Cómo se empieza"
        titulo="Te montamos el sistema con tus datos."
        detalle="Un equipo dominicano carga lo que ya tienes y deja la habilitación ante la DGII lista. No es un formulario y a arreglártelas."
        lineas={[
          'Cargamos tus productos, clientes y saldos pendientes',
          'Dejamos lista la habilitación de e-CF ante la DGII',
          'Entrenamos a quien va a facturar todos los días',
          'Roles y permisos: cada quien toca lo que le toca',
          'Soporte en español, de 7:00 a 24:00',
        ]}
      />

      <PrecioProducto
        texto={
          DESDE !== null
            ? <>Desde <strong className="font-semibold">US${DESDE} al mes</strong>, según cuánto factures y cuántas personas lo usen. El punto de venta y la nómina se suman aparte.</>
            : <>El precio se arma con tu volumen y tus usuarios. El punto de venta y la nómina se suman aparte.</>
        }
      />

      <DatosDeRuta migas={[{ nombre: 'Productos', ruta: '/productos/erp' }, { nombre: 'Zero ERP', ruta: '/productos/erp' }]} />
      <PreguntasProducto preguntas={PREGUNTAS} />

      <CierreProducto
        antetitulo="Zero ERP"
        titulo="Empieza a facturar esta semana."
        detalle="Abre tu cuenta y prueba 15 días, o cuéntanos cómo trabajas y te decimos con qué módulos empezar."
        nota={{
          titulo: 'Lo que hace falta de tu lado',
          detalle: 'Tu RNC, el certificado digital de la empresa y media hora para contarnos cómo facturas hoy.',
        }}
      />

      <DatosDeProducto
        nombre="Zero ERP"
        descripcion="Sistema de gestión con facturación electrónica e-CF certificada ante la DGII, cuentas por cobrar, inventario con costo promedio real, compras con retenciones y contabilidad con asientos automáticos."
        ruta="/productos/erp"
        precioDesde={DESDE}
        precioHasta={HASTA}
        funciones={[
          'Los diez tipos de comprobante fiscal electrónico ante la DGII',
          'Cotizaciones y facturas recurrentes',
          'Cuentas por cobrar con links de pago CardNet',
          'Inventario por almacén con costo promedio',
          'Compras, gastos y retenciones de ITBIS e ISR',
          'Contabilidad con asientos automáticos y estados financieros',
          'Reportes 606, 607 y 608',
        ]}
      />
    </>
  );
}
