/**
 * Punto de venta — la caja de Zero, con su página.
 *
 * De la maqueta de esta landing quedaron fuera dos promesas que el sistema no
 * cumple: vender sin internet («sigue trabajando y sincroniza cuando vuelve»)
 * y la gestión de varias sucursales —`sucursal` es un texto que se le pone a
 * una secuencia y sale impreso en la factura, nada más—. Lo demás está
 * comprobado: la venta descuenta inventario (`lib/inventario/descuento.ts`),
 * abre turno, emite su e-CF y puede quedar a crédito en la cartera.
 */

import type { Metadata } from 'next';
import { ADDONS, addonBajoCotizacion } from '@/lib/config/plans';
import { urlDelSitio } from '@/lib/config/enlaces';
import { DatosDeProducto, DatosDeRuta } from '../../_datos-estructurados';
import { Contenedor, Iconos } from '../../_piezas';
import { Antetitulo, Titulo } from '../../_bloques';
import { CajaDemo } from './_caja';
import {
  CierreProducto, FranjaProducto, HeroProducto, PrecioProducto, SeccionProducto,
  PreguntasProducto, type PuntoDeProducto,
} from '../../_producto';

export const metadata: Metadata = {
  title: 'Punto de venta con facturación e-CF — caja para colmados, tiendas y restaurantes',
  description:
    'Una caja que cobra, descuenta del inventario y emite la factura con e-CF en el mismo movimiento. Con turnos de cajero, cuadre, mesas y comandas, venta a crédito y ticket por WhatsApp.',
  keywords: ['punto de venta República Dominicana', 'POS con facturación electrónica', 'caja registradora con e-CF', 'software para restaurantes', 'sistema para colmados'],
  alternates: { canonical: '/productos/punto-de-venta' },
  openGraph: {
    type: 'website',
    url: urlDelSitio('/productos/punto-de-venta'),
    images: [{ url: '/home/capturas/demo-pos.png', width: 1440, height: 900, alt: 'Caja de Zero' }],
    title: 'Punto de venta con facturación e-CF',
    description: 'Cobra, descuenta del inventario y factura ante la DGII en el mismo tiro.',
  },
};

const POS = ADDONS.find(a => a.key === 'pos');
/** La cifra sale del catálogo y respeta su bandera de cotización. */
const PRECIO_POS = POS && !addonBajoCotizacion('pos', 'ecf') ? POS.price : null;

const CAJA: PuntoDeProducto[] = [
  { titulo: 'Vende en segundos', detalle: 'Busca por nombre o código, cobra en efectivo, tarjeta o transferencia y entrega el comprobante.', icono: Iconos.pos },
  { titulo: 'La factura fiscal, en el acto', detalle: 'La venta sale con su e-CF válido ante la DGII sin pasar por otro sistema ni por otra pantalla.', icono: Iconos.factura },
  { titulo: 'El inventario baja solo', detalle: 'Cada venta descuenta del stock, y la devolución lo devuelve. Sabes qué se está acabando antes de que se acabe.', icono: Iconos.cuadros },
  { titulo: 'Turnos y cuadre', detalle: 'Apertura, ventas, retiros y diferencia por turno y por cajero, con su corte imprimible.', icono: Iconos.reloj },
  { titulo: 'Ticket impreso o por WhatsApp', detalle: 'Imprime en la térmica o mándaselo al cliente, como prefiera.', icono: Iconos.correo },
  { titulo: 'Devoluciones como manda la DGII', detalle: 'Se corrige la venta y sale su nota de crédito, con el inventario devuelto.', icono: Iconos.escudo },
];

const MOSTRADOR: PuntoDeProducto[] = [
  { titulo: 'Mesas y comandas', detalle: 'Para restaurantes: se abre la mesa, se manda la comanda y se cobra al final, con su mesero.', icono: Iconos.tienda },
  { titulo: 'Cada cajero con su PIN', detalle: 'Entra con su clave, y lo que vende y retira queda a su nombre.', icono: Iconos.usuarios },
  { titulo: 'Varias cajas a la vez', detalle: 'Cada terminal cobra por su lado y todo llega al mismo reporte.', icono: Iconos.base },
  { titulo: 'Venta a crédito', detalle: 'El fiao queda en la cuenta del cliente, con su saldo, y entra a la cartera de cobros.', icono: Iconos.dinero },
];

const PREGUNTAS = [
  {
    pregunta: '¿La venta del punto de venta sale con factura fiscal?',
    respuesta: 'Sí. Al cobrar se emite el comprobante fiscal electrónico válido ante la DGII, en el mismo acto y sin pasar por otro sistema. También puede salir como ticket sin valor fiscal si la venta no lo necesita.',
  },
  {
    pregunta: '¿El punto de venta funciona sin internet?',
    respuesta: 'No. Necesita conexión: la caja trabaja contra el mismo sistema donde están el inventario, la cartera y la contabilidad, y el comprobante fiscal se emite en línea ante la DGII.',
  },
  {
    pregunta: '¿La venta descuenta del inventario?',
    respuesta: 'Sí, artículo por artículo, y la devolución lo devuelve. Las existencias son las mismas que ve facturación: no hay dos conteos.',
  },
  {
    pregunta: '¿Cuánto cuesta el punto de venta?',
    respuesta: 'Se suma a cualquier plan de facturación por US$9 al mes. En los planes de colegio ya viene incluido, porque la cafetería es un punto de venta.',
  },
  {
    pregunta: '¿Sirve para un restaurante?',
    respuesta: 'Sí: mesas, comandas y mesero asignado, con la cuenta abierta hasta que se cobra. Y para colmados y tiendas, con listas de precios y venta a crédito que entra sola a cuentas por cobrar.',
  },
] as const;

export default function PuntoDeVentaPage() {
  return (
    <>
      <HeroProducto
        antetitulo="Punto de venta"
        titulo="Cobra rápido. Cuadra sin discusión."
        bajada="Una caja que vende, descuenta del inventario y emite la factura con su comprobante fiscal en el mismo tiro. Funciona en tableta, laptop o computadora."
        pie={PRECIO_POS !== null
          ? `+US$${PRECIO_POS} al mes sobre cualquier plan · Incluido en los planes de colegio`
          : 'Se suma a cualquier plan · Incluido en los planes de colegio'}
        captura="/home/capturas/demo-pos.png"
        alt="Pantalla de caja de Zero con el catálogo y el cobro en curso"
      />

      {/* ── La caja, tocándola ────────────────────────────────────────────── */}
      {/* El argumento de esta página no es la pantalla bonita: es que cobrar,
          facturar ante la DGII y descontar del almacén son el MISMO acto. Eso
          no se explica, se enseña: se toca un producto, se cobra y salen los
          cuatro efectos. */}
      <section id="pruebala" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.62fr)_minmax(0,1.6fr)] lg:gap-12">
            <div className="min-w-0">
              <Antetitulo>Pruébala</Antetitulo>
              <Titulo className="mt-3.5">Toca, cobra y mira qué pasó.</Titulo>
              <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.6] text-[#5c6373]">
                Arma una venta como la armaría tu cajero. Al cobrar no sale un «gracias»: sale lo que
                el sistema hace en ese mismo segundo —el comprobante fiscal, el inventario que baja,
                el asiento contable y el ticket—.
              </p>
              <p className="m-0 mt-3.5 text-pretty text-[13px] leading-[1.55] text-[#8a90a0]">
                Nada de eso es un paso aparte que alguien tenga que acordarse de dar.
              </p>
            </div>
            <CajaDemo />
          </div>
        </Contenedor>
      </section>

      <SeccionProducto
        id="caja"
        antetitulo="En la caja"
        titulo="Lo que pasa entre que el cliente llega y se va."
        detalle="Una sola pantalla: cobrar, facturar y descontar del almacén no son tres pasos, son el mismo."
        puntos={CAJA}
      />

      <SeccionProducto
        id="mostrador"
        antetitulo="Detrás del mostrador"
        titulo="Pensado para quien lo usa todo el día."
        detalle="Botones grandes, pocos pasos y nada que aprender de memoria. Un cajero nuevo empieza a vender el mismo día."
        puntos={MOSTRADOR}
        columnas={2}
      />

      <FranjaProducto
        antetitulo="Y lo de atrás sigue ahí"
        titulo="La caja no es un programa aparte."
        detalle="Lo que se vende en el mostrador es lo mismo que ve la contabilidad, el inventario y la cartera. No hay que pasar nada de un sistema a otro al final del día."
        lineas={[
          'El asiento contable de la venta entra solo al diario',
          'El corte de caja cuenta lo cobrado de verdad, sin los comprobantes anulados',
          'Las existencias son las mismas que ve facturación',
          'Lo que quedó a crédito aparece en cuentas por cobrar, con su aviso',
        ]}
      />

      <PrecioProducto
        texto={
          PRECIO_POS !== null
            ? <>Se suma a cualquier plan de facturación por <strong className="font-semibold">US${PRECIO_POS} al mes</strong>. En los planes de colegio ya viene incluido: la cafetería es un punto de venta.</>
            : <>Se suma a cualquier plan de facturación. En los planes de colegio ya viene incluido: la cafetería es un punto de venta.</>
        }
      />

      <DatosDeRuta migas={[{ nombre: 'Productos', ruta: '/productos/punto-de-venta' }, { nombre: 'Punto de venta', ruta: '/productos/punto-de-venta' }]} />
      <PreguntasProducto preguntas={PREGUNTAS} />

      <CierreProducto
        antetitulo="Punto de venta"
        titulo="Monta tu caja esta semana."
        detalle="Abre tu cuenta y prueba 15 días, o cuéntanos qué vendes y te dejamos el catálogo cargado."
        nota={{
          titulo: 'Lo que hace falta de tu lado',
          detalle: 'Una tableta o computadora, tu lista de productos y —si la vas a usar— la impresora térmica.',
        }}
      />

      <DatosDeProducto
        nombre="Zero Punto de Venta"
        descripcion="Caja que cobra en efectivo, tarjeta o transferencia, descuenta del inventario y emite la factura con comprobante fiscal electrónico ante la DGII, con turnos de cajero, cuadre, mesas y venta a crédito."
        ruta="/productos/punto-de-venta"
        precioDesde={PRECIO_POS}
        funciones={[
          'Cobro en efectivo, tarjeta o transferencia',
          'Factura con e-CF en el momento de cobrar',
          'Descuento de inventario en cada venta',
          'Turnos de cajero con cuadre y corte imprimible',
          'Mesas y comandas para restaurantes',
          'Venta a crédito que entra a cuentas por cobrar',
          'Ticket impreso o por WhatsApp',
        ]}
      />
    </>
  );
}
