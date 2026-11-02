/**
 * Lo que se navega del sitio: los módulos, las secciones de la portada y lo que
 * se vende aparte.
 *
 * Vive fuera de la portada porque lo usan dos: la rejilla de módulos de `/` y
 * el desplegable de «Producto» de la cabecera. Con una copia en cada sitio, el
 * día que entre un módulo nuevo el menú se queda con seis.
 *
 * Cada entrada lleva su DESTINO, y ninguno se repite. Es la diferencia entre un
 * menú y una lista de adornos: el pie tenía cinco líneas distintas que llevaban
 * las cinco a `/#modulos`, y un menú que siempre te deja en el mismo sitio
 * enseña a no usarlo.
 */

import { PAGINAS_CRM, RUTA_CRM, type ClaveCrm } from '@/lib/agentes/crm-rutas';
import { Iconos } from './_piezas';

export type EntradaMenu = {
  /** A dónde lleva. Página propia, o sección con ancla dentro de una. */
  href: string;
  titulo: string;
  detalle: string;
  icono: (p: { className?: string }) => React.ReactElement;
};

/**
 * Los módulos que existen hoy (ver lib/config/modules.ts), cada uno con su
 * destino REAL.
 *
 * Los cuatro del ERP llevan a su sección dentro de `/erp`; el punto de venta y
 * la nómina tienen página propia. Ninguno repite destino: un menú donde seis
 * líneas distintas caen en el mismo sitio enseña a no usarlo, que es lo que
 * pasaba en el pie con `/#modulos`.
 */
export const MODULOS: EntradaMenu[] = [
  { href: '/productos/erp#facturacion', titulo: 'Facturación electrónica', detalle: 'Los diez tipos de e-CF ante la DGII, con su PDF al cliente.', icono: Iconos.factura },
  { href: '/productos/erp#cobros', titulo: 'Cobros y cuentas por cobrar', detalle: 'Quién te debe, cuánto y desde cuándo, con sus recordatorios por correo.', icono: Iconos.tarjeta },
  { href: '/productos/contabilidad', titulo: 'Contabilidad', detalle: 'Asientos automáticos, estados financieros y los 606, 607 y 608 armados.', icono: Iconos.contabilidad },
  { href: '/productos/erp#inventario', titulo: 'Inventario, compras y gastos', detalle: 'Stock por almacén, costo real y la factura del proveedor desde una foto.', icono: Iconos.cuadros },
  { href: '/productos/punto-de-venta', titulo: 'Punto de venta y restaurante', detalle: 'Caja con turnos, mesas y cuadre al cierre.', icono: Iconos.pos },
  { href: '/productos/nomina', titulo: 'Nómina', detalle: 'TSS, ISR, regalía y vacaciones, con su asiento contable.', icono: Iconos.usuarios },
];

/** El sistema completo, que es donde viven cuatro de esos seis módulos. */
export const ENLACE_ERP = '/productos/erp';

export const ENLACE_CRM = RUTA_CRM;

const ICONO_CRM: Record<ClaveCrm, EntradaMenu['icono']> = {
  'chatbot-whatsapp': Iconos.soporte,
  'chat-web': Iconos.correo,
  documentos: Iconos.papel,
  bandeja: Iconos.usuarios,
  supervision: Iconos.reportes,
  integraciones: Iconos.engranaje,
  seguridad: Iconos.escudo,
  disponibilidad: Iconos.reloj,
  preguntas: Iconos.hoja,
};

/** Las partes del CRM, cada una con su página. Salen de `lib/agentes/crm-rutas.ts`. */
export const ENTRADAS_CRM: EntradaMenu[] = PAGINAS_CRM.map(p => ({
  href: p.ruta,
  titulo: p.menu,
  detalle: p.resumen,
  icono: ICONO_CRM[p.clave],
}));

/**
 * Las secciones de la portada a las que tiene sentido saltar desde el menú.
 *
 * `/#modulos` no está: el que abre «Producto» ya tiene los seis módulos
 * delante, y repetir la sección entera como una séptima línea solo agrega una
 * decisión más.
 */
export const SECCIONES = [
  { href: '/#recorrido', titulo: 'El recorrido del dinero', detalle: 'Una venta, de la cotización al asiento contable.' },
  { href: '/#industrias', titulo: 'Para quién es', detalle: 'Restaurantes, comercios, distribuidoras, servicios y más.' },
] as const;
