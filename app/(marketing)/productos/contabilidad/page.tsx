/**
 * Contabilidad — página propia.
 *
 * Tiene la misma idea que la del CRM —larga, por secciones, con pantallas y
 * algo que se toca— pero su propio carácter: aquí lo que engancha no es una
 * conversación, es ver el asiento armándose solo con debe y haber cuadrados
 * (`_asientos.tsx`). De ahí que el bloque fuerte sea una tabla y no un chat.
 *
 * Todo lo que se anuncia está en el sistema: los asientos automáticos salen de
 * `lib/contabilidad/asientos.ts` y los reportes fiscales de
 * `app/api/reportes/{606,607,608}`. Lo que NO existe —presupuestos, centros de
 * costo, consolidación de varias empresas— no aparece.
 */

import type { Metadata } from 'next';
import { urlDelSitio } from '@/lib/config/enlaces';
import { DatosDeProducto } from '../../_datos-estructurados';
import { Iconos } from '../../_piezas';
import { Encabezado, Titulo, Antetitulo } from '../../_bloques';
import { Contenedor } from '../../_piezas';
import {
  CierreProducto, FranjaProducto, HeroProducto, SeccionConImagen, SeccionProducto,
  type PuntoDeProducto,
} from '../../_producto';
import { AsientosEnVivo } from './_asientos';

export const metadata: Metadata = {
  title: 'Contabilidad — asientos automáticos, estados financieros y reportes 606, 607 y 608',
  description:
    'La contabilidad de tu empresa se escribe sola: cada factura, cobro, compra, gasto, nómina y depreciación deja su asiento cuadrado, con libro diario, mayor, balances y los reportes que pide la DGII.',
  keywords: [
    'software de contabilidad República Dominicana', 'asientos automáticos', 'libro diario y mayor',
    'estados financieros', 'reportes 606 607 608', 'contabilidad para pymes', 'activos fijos y depreciación',
  ],
  alternates: { canonical: '/productos/contabilidad' },
  openGraph: {
    type: 'website',
    url: urlDelSitio('/productos/contabilidad'),
    title: 'Contabilidad que se escribe sola',
    description: 'Cada operación deja su asiento cuadrado. Los 606, 607 y 608 salen armados.',
    images: [{ url: '/home/capturas/demo-contabilidad.png', width: 1440, height: 900, alt: 'Contabilidad en Zero' }],
  },
};

const AUTOMATICO: PuntoDeProducto[] = [
  { titulo: 'Cada operación deja su asiento', detalle: 'Factura, cobro, nota de crédito, anulación, compra, gasto, depreciación y nómina entran solos al diario.', icono: Iconos.contabilidad },
  { titulo: 'Nunca se guarda descuadrado', detalle: 'El sistema compara debe y haber antes de escribir. Si no cuadra, no entra: no hay asientos a medias.', icono: Iconos.escudo },
  { titulo: 'La cuenta la decides una vez', detalle: 'Se configura por categoría de gasto o por producto, y se puede cambiar al registrar sin tocar la configuración.', icono: Iconos.engranaje },
  { titulo: 'Con su origen a la vista', detalle: 'Cada asiento dice de qué documento salió, así que se audita hacia atrás sin adivinar.', icono: Iconos.papel },
  { titulo: 'Los manuales, cuando hacen falta', detalle: 'Ajustes y reclasificaciones se escriben a mano, con la misma validación de cuadre.', icono: Iconos.hoja },
  { titulo: 'Incluida en todos los planes', detalle: 'No es un módulo aparte que se cobra: viene con el sistema. La competencia la vende por separado.', icono: Iconos.dinero },
];

const LIBROS: PuntoDeProducto[] = [
  { titulo: 'Libro diario', detalle: 'Todos los asientos por fecha, con su documento de origen y quién lo registró.', icono: Iconos.hoja },
  { titulo: 'Mayor general', detalle: 'El movimiento de cada cuenta, con su saldo al día.', icono: Iconos.base },
  { titulo: 'Balance de comprobación', detalle: 'Para revisar antes de cerrar, sin armarlo aparte.', icono: Iconos.reportes },
  { titulo: 'Estado de resultados', detalle: 'Qué se ganó y en qué se fue, del período que elijas.', icono: Iconos.crecer },
  { titulo: 'Balance general', detalle: 'Activo, pasivo y capital cuadrados a la fecha.', icono: Iconos.cuadros },
  { titulo: 'Catálogo de cuentas', detalle: 'Viene armado para República Dominicana y se ajusta a cómo trabaja tu contador.', icono: Iconos.papel },
];

const FISCAL: PuntoDeProducto[] = [
  { titulo: '606 · Compras y gastos', detalle: 'Con sus tipos de bienes y servicios y las retenciones de ITBIS e ISR aplicadas.', icono: Iconos.factura },
  { titulo: '607 · Ventas', detalle: 'Armado desde los comprobantes emitidos, sin volver a capturar nada.', icono: Iconos.papel },
  { titulo: '608 · Anulados', detalle: 'Los comprobantes anulados con su motivo, en el formato que la DGII pide.', icono: Iconos.escudo },
  { titulo: 'Activos fijos', detalle: 'Registro, vida útil y depreciación que corre sola cada mes con su asiento.', icono: Iconos.engranaje },
  { titulo: 'Cierre de ejercicio', detalle: 'Cierra el año, arrastra resultados y deja el período anterior bloqueado.', icono: Iconos.reloj },
  { titulo: 'Permisos del contador', detalle: 'Tu contador externo entra a lo suyo sin ver la nómina ni tocar facturas.', icono: Iconos.usuarios },
];

export default function ContabilidadPage() {
  return (
    <>
      <HeroProducto
        antetitulo="Contabilidad"
        titulo="La contabilidad se escribe sola, y cuadra."
        bajada="Cada factura, cobro, compra, gasto, nómina y depreciación deja su asiento en el diario. Tu contador deja de digitar y se pone a revisar."
        pie="Incluida en todos los planes · Sin costo aparte"
        captura="/home/capturas/demo-contabilidad.png"
        alt="Panorama de contabilidad en Zero con sus libros, reportes y cierre"
      />

      {/* ── El asiento, armándose ──────────────────────────────────────────── */}
      <section id="asientos" className="scroll-mt-20">
        <Contenedor className="pt-16 sm:pt-[82px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.5fr)] lg:gap-12">
            <div className="min-w-0">
              <Antetitulo>Míralo cuadrar</Antetitulo>
              <Titulo className="mt-3.5">Elige qué pasó y mira el asiento.</Titulo>
              <p className="m-0 mt-3.5 text-pretty text-[15px] leading-[1.6] text-[#5c6373]">
                Estos son los asientos que el sistema escribe de verdad, con las cuentas del
                catálogo dominicano. Mueve el monto y mira cómo se recalculan: el ITBIS, la
                retención, el neto de la nómina.
              </p>
              <p className="m-0 mt-3.5 text-pretty text-[13px] leading-[1.55] text-[#8a90a0]">
                Nadie teclea nada de esto.
              </p>
            </div>
            <AsientosEnVivo />
          </div>
        </Contenedor>
      </section>

      <SeccionProducto
        id="automatico"
        antetitulo="Lo automático"
        titulo="Tu operación ya es tu contabilidad."
        detalle="No hay que pasar nada de un sistema a otro al final del mes: lo que se factura, se cobra y se paga ya está asentado."
        puntos={AUTOMATICO}
      />

      <SeccionConImagen
        id="libros"
        antetitulo="Los libros"
        titulo="Diario, mayor y balances, sin armarlos."
        detalle="Los mismos libros que te pide el contador, con el detalle de dónde salió cada línea."
        lineas={[
          'Cada asiento enlaza con el documento que lo generó',
          'Filtros por cuenta, por fecha y por origen',
          'Exportable a Excel para el que trabaja así',
          'El período cerrado queda bloqueado',
        ]}
        captura="/home/capturas/demo-libro-diario.png"
        alt="Libro diario de Zero con los asientos del período"
      />

      <SeccionProducto
        id="libros-detalle"
        antetitulo="Qué hay dentro"
        titulo="Los seis libros que de verdad se usan."
        puntos={LIBROS}
      />

      <SeccionProducto
        id="fiscal"
        antetitulo="Lo fiscal"
        titulo="Lo que la DGII pide, armado."
        detalle="Los reportes salen de lo que ya está registrado: si la factura está bien, el 607 está bien."
        puntos={FISCAL}
      />

      <FranjaProducto
        antetitulo="Para tu contador"
        titulo="Deja de mandar Excel por WhatsApp."
        detalle="Tu contador entra al sistema con su usuario y ve lo que necesita, cuando lo necesita. Sin exportar, sin pasar archivos y sin esperar a que alguien se los mande."
        lineas={[
          'Usuario propio con permisos de contabilidad, sin ver nómina ni facturar',
          'El libro diario con el documento de origen de cada asiento',
          'Los 606, 607 y 608 listos para subir a la OVTT',
          'Cierre de ejercicio con arrastre de resultados',
          'Todo queda registrado: quién asentó qué y cuándo',
        ]}
      />

      <CierreProducto
        antetitulo="Contabilidad"
        titulo="Que el mes cierre sin correr."
        detalle="Abre tu cuenta y prueba 15 días, o cuéntanos cómo llevas la contabilidad hoy y te decimos qué se automatiza."
        nota={{
          titulo: 'Lo que hace falta de tu lado',
          detalle: 'Tu catálogo de cuentas si ya tienes uno —o usas el nuestro— y los saldos con los que arrancas.',
        }}
      />

      <DatosDeProducto
        nombre="Zero Contabilidad"
        descripcion="Contabilidad con asientos automáticos por cada factura, cobro, compra, gasto, nómina y depreciación, con libro diario, mayor, balances, activos fijos, cierre de ejercicio y los reportes 606, 607 y 608 de la DGII."
        ruta="/productos/contabilidad"
        captura="/home/capturas/demo-contabilidad.png"
        funciones={[
          'Asientos automáticos que nunca se guardan descuadrados',
          'Libro diario y mayor general con su documento de origen',
          'Balance de comprobación, estado de resultados y balance general',
          'Catálogo de cuentas dominicano, ajustable',
          'Reportes 606, 607 y 608 para la DGII',
          'Activos fijos con depreciación automática',
          'Cierre de ejercicio con arrastre de resultados',
          'Permisos para el contador externo',
        ]}
      />
    </>
  );
}
