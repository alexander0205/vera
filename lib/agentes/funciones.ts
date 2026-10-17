/**
 * Todo lo que hace Zero, módulo por módulo, dicho para que lo lea un modelo.
 *
 * De aquí salen `/funciones` y `/funciones.md`. Es la página que un asistente
 * consulta cuando le preguntan «¿Zero hace nómina?» o «¿sirve para un
 * colegio?», y lo que conteste lo va a repetir como un hecho. Por eso:
 *
 *  - **Cada línea existe en el sistema.** El catálogo se levantó desde el
 *    código —menús, rutas y configuración— el 14 de octubre de 2026, no desde
 *    los textos de venta. Lo que está construido pero apagado en producción no
 *    aparece.
 *  - **Lo que no hace, se dice.** Un asistente que promete lo que no hay le
 *    cuesta a Zero un cliente molesto. `noHace` no es un adorno.
 *  - **Lo que tiene interruptor, lo avisa.** Varias funciones las enciende cada
 *    empresa en su configuración; van con su `nota`.
 *  - **Precios, topes, tipos de comprobante y días de prueba NO se escriben
 *    aquí:** se leen del catálogo de planes y de `TIPOS_ECF`, que es lo que usa
 *    el sistema. Un número a mano es el que se queda viejo.
 *
 * Al añadir una función al sistema, se añade aquí. Al quitarla, se quita.
 */

import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { ADDONS, LINEAS_PRODUCTO, PRODUCTOS_APARTE, lineaBajoCotizacion, limiteTexto, planesDeLinea } from '@/lib/config/plans';
import { MORA, SOLO_LECTURA } from '@/lib/config/suscripcion';
import { TIPOS_ECF } from '@/lib/ecf/types';
import { RUTA_AGENTES_MD, textoDeLaPrueba } from './contenido';

/** ISO. Fecha en que se revisó el catálogo contra el sistema. */
export const FUNCIONES_ACTUALIZADA = '2026-10-14';

export const RUTA_FUNCIONES = '/funciones';

export type Modulo = {
  /** Para anclas y claves. */
  id: string;
  nombre: string;
  /** Una frase: qué resuelve. */
  resumen: string;
  hace: readonly string[];
  noHace?: readonly string[];
  /** Condiciones: lo que enciende cada empresa, o de qué depende. */
  nota?: string;
  /** En qué producto viene. */
  viene: string;
};

const addon = (key: string) => ADDONS.find((a) => a.key === key);
const usd = (n: number) => `US$${n}`;

function vieneComoAdicional(key: string): string {
  const a = addon(key);
  if (!a) return 'Consultar disponibilidad.';
  return `Adicional de ${usd(a.price)} al mes sobre Zero ERP; incluido en los planes de colegio.`;
}

const BASE = 'En todos los planes.';

export const MODULOS: readonly Modulo[] = [
  {
    id: 'facturacion',
    nombre: 'Facturación electrónica (e-CF)',
    resumen: 'Emite comprobantes fiscales electrónicos ante la DGII, firmados y enviados desde el sistema.',
    hace: [
      `Emite los ${Object.keys(TIPOS_ECF).length} tipos de e-CF, con firma, envío a la DGII y número de comprobante.`,
      'Factura sin comprobante fiscal, con numeración propia, para lo que no va a la DGII.',
      'Guarda borradores y los emite después.',
      'ITBIS por línea (18 %, 16 %, 0 % o exento) y retenciones.',
      'Notas de crédito y de débito ligadas al comprobante que modifican.',
      'Consulta el estado de cada comprobante en la DGII y permite reintentar uno rechazado.',
      'Anula con motivo, y anula ante la DGII los rangos de numeración no usados.',
      'PDF tamaño carta y tirilla térmica; descarga del XML firmado.',
      'Envía la factura por correo con su PDF, a nombre de la empresa.',
      'Secuencias de comprobantes con rango y vencimiento.',
      'Certificado digital: se sube al sistema y se ve cuándo vence.',
      'Asistente paso a paso para la habilitación ante la DGII.',
      'Recibe los e-CF de proveedores y registra la aprobación comercial.',
      'Exporta el listado a CSV e importa facturas históricas.',
      'Descuenta el inventario al facturar y lo repone al anular.',
    ],
    noHace: [
      'No emite ante la DGII hasta que la empresa completa su habilitación. Mientras tanto factura sin comprobante fiscal.',
      'No gestiona sucursales como entidades separadas.',
    ],
    viene: BASE,
  },
  {
    id: 'cotizaciones',
    nombre: 'Cotizaciones',
    resumen: 'Presupuestos que se envían al cliente y se convierten en factura.',
    hace: [
      'Crea, edita y elimina cotizaciones con fecha de vigencia.',
      'Las envía por correo en PDF.',
      'Lleva su estado: pendiente, enviada, aceptada, rechazada o vencida.',
      'Convierte la cotización en factura sin volver a escribirla.',
    ],
    viene: BASE,
  },
  {
    id: 'cobros',
    nombre: 'Cuentas por cobrar y cobros',
    resumen: 'Quién debe, cuánto, desde cuándo, y el registro de cada cobro.',
    hace: [
      'Cartera de facturas a crédito con vencimiento, días de atraso y antigüedad del saldo.',
      'Abonos parciales y un mismo cobro repartido entre varios métodos.',
      'Métodos: efectivo, transferencia, tarjeta, cheque, depósito y otros.',
      'Adjunta el comprobante del pago (imagen o PDF).',
      'Saldo a favor del cliente, que se puede usar para pagar otra factura.',
      'Gestión de cobro: notas internas, contactos y promesas de pago.',
      'Recordatorios de pago por correo, con vista previa.',
      'Recargo por mora automático: monto fijo o porcentaje, con días de gracia.',
      'Registra saldos anteriores al sistema como cuentas históricas.',
      'Exporta la cartera a Excel y los cobros a CSV.',
    ],
    nota: 'El recargo por mora lo enciende cada empresa en su configuración.',
    viene: BASE,
  },
  {
    id: 'caja',
    nombre: 'Caja',
    resumen: 'Control del efectivo por turno y por cajero.',
    hace: [
      'Turnos por cajero, con apertura y cierre.',
      'Entradas, salidas, gastos y retiros de efectivo.',
      'Cierre con conteo: el sistema calcula lo esperado y muestra la diferencia.',
      'Un descuadre exige justificación y aprobación de un supervisor.',
      'Hoja de cuadre imprimible.',
    ],
    nota: 'La caja la enciende cada empresa. Encendida, nadie factura ni cobra sin un turno abierto.',
    viene: BASE,
  },
  {
    id: 'recurrentes',
    nombre: 'Facturación recurrente',
    resumen: 'Lo que se cobra cada cierto tiempo se factura solo.',
    hace: [
      'Planes semanales, quincenales, mensuales, trimestrales o anuales, con su día de cobro.',
      'Genera las facturas cada día, según les toque.',
      'Se pausan, se reanudan y se finalizan.',
      'Permite generar a mano la de un período concreto y ver todas las generadas.',
    ],
    noHace: [
      'La factura generada nace como borrador: el comprobante fiscal se asigna cuando un usuario la emite.',
    ],
    viene: BASE,
  },
  {
    id: 'clientes',
    nombre: 'Clientes',
    resumen: 'La ficha de cada cliente, con sus datos fiscales.',
    hace: [
      'Busca la empresa en el padrón de RNC de la DGII, por número o por nombre.',
      'Trae el nombre de una persona por su cédula.',
      'Beneficiarios por cliente (por ejemplo, los hijos de un padre).',
      'Importa contactos desde CSV, con vista previa y sin duplicar.',
      'Buscador general del sistema.',
    ],
    viene: BASE,
  },
  {
    id: 'inventario',
    nombre: 'Productos e inventario',
    resumen: 'Qué se vende, cuánto hay y cuánto costó.',
    hace: [
      'Productos y servicios con referencia, código de barras, imagen y costo.',
      'Variantes, como talla y color, con precio y existencia propios.',
      'Existencia por almacén y varios almacenes.',
      'Aviso de existencia bajo el mínimo, también al facturar.',
      'Costo promedio ponderado en cada compra.',
      'Listas de precios, por valor o por porcentaje.',
      'Categorías, vendedores y listas de atributos propias.',
      'Entradas y ajustes manuales de existencia.',
      'Historial de compras y de ventas por producto.',
      'Importa productos desde CSV.',
    ],
    noHace: [
      'No maneja lotes con fecha de vencimiento.',
      'No tiene conteo físico de inventario.',
      'No hace traslados entre almacenes.',
    ],
    viene: BASE,
  },
  {
    id: 'compras',
    nombre: 'Compras y gastos',
    resumen: 'Lo que la empresa compra y gasta, listo para el reporte fiscal.',
    hace: [
      'Registra la compra con el comprobante del proveedor: sube el inventario, alimenta el 606 y crea el asiento.',
      'Compras a proveedores informales, gastos menores y pagos al exterior, con su comprobante electrónico.',
      'Retenciones de ITBIS e ISR.',
      'Gastos sin comprobante, avisando que no van al 606.',
      'Lee una factura desde una foto o un PDF: toma los datos del código QR del e-CF y, con inteligencia artificial, el proveedor, los impuestos y las líneas.',
      'Lo leído queda en una bandeja por revisar; nada se registra sin que una persona lo confirme.',
      'Enlace para que un tercero, sin cuenta, envíe la foto de una factura.',
      'Cuentas por pagar con el registro de los pagos a proveedores.',
    ],
    viene: BASE,
  },
  {
    id: 'contabilidad',
    nombre: 'Contabilidad',
    resumen: 'Los libros se llenan solos a partir de lo que se factura, se cobra y se compra.',
    hace: [
      'Asientos automáticos de facturas, notas de crédito, cobros, compras, pagos a proveedores, gastos y nómina.',
      'Asientos manuales, que no se guardan si no cuadran.',
      'Catálogo de cuentas con la numeración dominicana; se importa y se exporta en Excel.',
      'Libro diario, mayor, balance de comprobación, estado de resultados y balance general, exportables a Excel.',
      'Activos fijos con depreciación mensual automática.',
      'Cierre del ejercicio y reapertura.',
    ],
    noHace: [
      'No tiene presupuestos ni centros de costo.',
      'No consolida varias empresas.',
    ],
    nota: 'La generación automática de asientos la enciende cada empresa en la configuración contable.',
    viene: BASE,
  },
  {
    id: 'reportes',
    nombre: 'Reportes',
    resumen: 'Los formatos de la DGII y los números del negocio.',
    hace: [
      'Formatos 606, 607, 608 y 609 por mes, descargables en el archivo que pide la DGII.',
      'Panel financiero con los indicadores del mes.',
      'Ingresos por producto, por cliente y por tipo de comprobante.',
      'Antigüedad de saldos de la cartera.',
      'Ventas y cobros por usuario.',
      'Exportación a Excel y a CSV.',
    ],
    viene: BASE,
  },
  {
    id: 'pos',
    nombre: 'Punto de venta',
    resumen: 'La caja registradora para tiendas, cafeterías y restaurantes.',
    hace: [
      'Venta rápida con buscador y lector de código de barras.',
      'Cobro en efectivo, tarjeta o transferencia, pago dividido y propina.',
      'Venta a crédito, que entra a las cuentas por cobrar.',
      'Entrega ticket sin comprobante fiscal, factura de consumo o de crédito fiscal.',
      'Varias terminales, cada una con su almacén, impresora y lista de precios.',
      'Restaurante: mesas, comandas y meseros con PIN.',
      'Tipo de orden: comer aquí, para llevar, a domicilio o mostrador.',
      'Historial de recibos y corte de caja por turno.',
      'Recibo imprimible en 80 mm.',
      'Monedero prepago del estudiante, con recarga y límite diario, para la cafetería de un colegio.',
    ],
    noHace: [
      'No funciona sin conexión a internet.',
      'No hace devoluciones desde el punto de venta: se resuelven con una nota de crédito en Facturación.',
    ],
    nota: 'El modo restaurante se enciende por terminal y el monedero del estudiante, por colegio.',
    viene: `Incluido en Zero POS + ERP y en los planes de colegio. ${vieneComoAdicional('pos')}`,
  },
  {
    id: 'nomina',
    nombre: 'Nómina',
    resumen: 'El pago al personal con los descuentos de ley dominicanos.',
    hace: [
      'Calcula AFP, SFS e ISR del empleado, y AFP, SFS, riesgos laborales e INFOTEP del empleador.',
      'Corridas mensuales, quincenales y semanales, con prorrateo por días trabajados.',
      'Pago por horas: extras al 35 % y al 100 %, nocturnidad y feriados.',
      'Enlace para que el empleado por hora registre sus horas, que se aprueban antes de pagar.',
      'Volante de pago en PDF por empleado.',
      'Provisiones de regalía, vacaciones y cesantía.',
      'Control de lo que se debe a la TSS y a la DGII por retenciones.',
      'Dependientes del empleado en el seguro de salud.',
      'Contratos desde plantillas, en PDF, firmados por el empleado desde un enlace.',
      'Expediente de documentos por empleado.',
      'Lleva la nómina a la contabilidad con sus asientos.',
    ],
    noHace: [
      'No presenta ni paga la TSS: la empresa lo hace en el portal de la TSS.',
      'No calcula liquidaciones de prestaciones laborales.',
    ],
    viene: vieneComoAdicional('nomina'),
  },
  {
    id: 'colegios',
    nombre: 'Colegios',
    resumen: 'La administración de un colegio: matrícula, mensualidades, cobro a las familias y avisos.',
    hace: [
      'Estructura del colegio: años escolares, servicios, grados y secciones.',
      'Conceptos de cobro: inscripción, colegiatura, uniformes, actividades y otros.',
      'Tarifas por servicio, grado o sección, y precio propio por alumno.',
      'Becas por porcentaje o por monto.',
      'Matrícula de un alumno, o de una sección completa de una vez.',
      'Las mensualidades se crean solas cuando llega su fecha.',
      'Un mismo cargo a varios alumnos (excursión, día de cine), con revisión antes de crearlo.',
      'Factura a las familias, una por responsable, de forma automática si el colegio lo activa.',
      'Recargo por mora sobre lo vencido.',
      'Enlace de pago por familia: el padre ve la deuda de todos sus hijos sin crear cuenta y sube su comprobante de transferencia.',
      'El colegio aprueba o rechaza cada comprobante; al aprobarlo queda registrado el cobro.',
      'Avisos de cobro por correo, WhatsApp y SMS: al emitir, al vencer y antes del recargo.',
      'Panel de avisos: qué sale hoy, qué salió y a quién no le va a llegar.',
      'Documentos requeridos por alumno, con seguimiento de lo que falta y enlace para que la familia los suba.',
      'Formularios propios con enlace público.',
      'Ficha del alumno y de la familia, con su estado de cuenta y su récord financiero imprimible.',
      'Panorama de la cartera del colegio por antigüedad.',
      'Importa grados, secciones y estudiantes desde SIGERD, el sistema del Ministerio de Educación.',
    ],
    noHace: [
      'El comprobante que sube el padre no baja la deuda hasta que el colegio lo aprueba.',
      'La conexión con SIGERD solo lee: no escribe en el sistema del Ministerio.',
    ],
    nota: 'WhatsApp y SMS tienen una cuota mensual según el plan; el correo no tiene tope.',
    viene: 'En los planes Zero ERP Colegio, que además traen punto de venta y nómina.',
  },
  {
    id: 'usuarios',
    nombre: 'Usuarios, roles y seguridad',
    resumen: 'Quién entra, qué puede hacer y qué hizo.',
    hace: [
      'Roles de fábrica: propietario, administrador, vendedor, auditor, cajero y personal del colegio.',
      'Permisos editables por empresa y roles a la medida.',
      'Invitación de usuarios por correo.',
      'Un usuario puede tener varias empresas y cambiar de una a otra.',
      'Acceso con correo y contraseña o con Google.',
      'Verificación en dos pasos con aplicación autenticadora.',
      'Registro de actividad e historial de cambios por documento.',
    ],
    viene: BASE,
  },
  {
    id: 'integraciones',
    nombre: 'Integraciones y acceso para agentes de IA',
    resumen: 'Cómo se conecta Zero con lo de fuera.',
    hace: [
      'DGII: emisión, consulta de estado, padrón de RNC y formatos de envío.',
      `Conector MCP de solo lectura para asistentes de IA, con una llave por empresa. Detalle en ${SITIO_PUBLICO}${RUTA_AGENTES_MD}`,
      'Las mismas consultas por HTTP, también de solo lectura.',
      'Correo, WhatsApp y SMS para los avisos de cobro de los colegios.',
      'SIGERD, para los colegios.',
    ],
    noHace: [
      'Por la llave no se puede crear ni cambiar nada: solo consultar.',
    ],
    viene: BASE,
  },
  {
    id: 'soporte',
    nombre: 'Soporte',
    resumen: 'Ayuda dentro del sistema, con personas.',
    hace: [
      'Chat de soporte dentro del sistema, con tickets, adjuntos y capturas de pantalla.',
      'Llamada con video y pantalla compartida desde el mismo ticket.',
      'Aviso de novedades al entrar, con el historial de mejoras.',
    ],
    viene: BASE,
  },
];

/** Los comprobantes que se emiten, del mismo mapa que usa el sistema. */
export function tiposDeComprobante(): readonly (readonly [string, string])[] {
  return Object.entries(TIPOS_ECF);
}

export type FilaDePlan = {
  linea: string;
  plan: string;
  precio: string;
  comprobantes: string;
  usuarios: string;
  estudiantes: string;
};

/** Los planes con sus topes, leídos del catálogo. Una línea bajo cotización no publica cifra. */
export function filasDePlanes(): readonly FilaDePlan[] {
  return LINEAS_PRODUCTO.flatMap((l) => {
    if (lineaBajoCotizacion(l.key)) {
      return [{ linea: l.nombre, plan: '—', precio: 'Bajo cotización', comprobantes: '—', usuarios: '—', estudiantes: '—' }];
    }
    return planesDeLinea(l.key).map(({ plan, precio }) => ({
      linea: l.nombre,
      plan: plan.name,
      precio: `${usd(precio)} al mes`,
      comprobantes: plan.limits.docs < 0 ? 'Ilimitados' : `${limiteTexto(plan.limits.docs)} al mes`,
      usuarios: plan.limits.users < 0 ? 'Ilimitados' : limiteTexto(plan.limits.users),
      estudiantes: plan.limits.estudiantes < 0 ? 'No aplica' : `Hasta ${limiteTexto(plan.limits.estudiantes)}`,
    }));
  });
}

/** Qué pasa con la prueba y con el pago, en frases. */
export function reglasDeSuscripcion(): readonly string[] {
  return [
    `Prueba gratis: ${textoDeLaPrueba()}.`,
    `Al terminar la prueba sin contratar, la empresa queda ${SOLO_LECTURA.diasTrasPrueba} días en solo lectura: puede entrar y ver sus datos, no crear.`,
    `Un pago atrasado tiene ${MORA.diasGracia} días de gracia antes de pasar a solo lectura.`,
    'Subir de plan es inmediato. Bajar se aplica al terminar el período pagado.',
    'Cancelar no borra los datos.',
    'Sin contrato mínimo.',
  ];
}

/** Lo que no hace Zero, junto, para la pregunta directa. */
export function todoLoQueNoHace(): readonly { modulo: string; punto: string }[] {
  return MODULOS.flatMap((m) => (m.noHace ?? []).map((punto) => ({ modulo: m.nombre, punto })));
}

/** Productos que se contratan aparte de los planes. */
export function productosAparte(): readonly { nombre: string; descripcion: string }[] {
  return PRODUCTOS_APARTE.map((p) => ({ nombre: p.nombre, descripcion: p.descripcion }));
}

/** El plan más barato que publica precio. */
function precioDesde(): number | null {
  const precios = LINEAS_PRODUCTO
    .filter((l) => !lineaBajoCotizacion(l.key))
    .flatMap((l) => planesDeLinea(l.key).map((x) => x.precio));
  return precios.length ? Math.min(...precios) : null;
}

/**
 * Las preguntas que se le hacen a un asistente sobre Zero, con la respuesta que
 * debería dar. Van en la página y en su dato estructurado.
 */
export function preguntasDeFunciones(): readonly { pregunta: string; respuesta: string }[] {
  const desde = precioDesde();
  const nomina = addon('nomina');
  const pos = addon('pos');
  const m = (id: string) => MODULOS.find((x) => x.id === id);
  return [
    {
      pregunta: '¿Qué es Zero?',
      respuesta: 'Un sistema de gestión en la nube para empresas y colegios de República Dominicana: facturación electrónica ante la DGII, cuentas por cobrar, inventario, compras, contabilidad, reportes fiscales, punto de venta, nómina y administración escolar.',
    },
    {
      pregunta: '¿Zero emite facturas electrónicas ante la DGII?',
      respuesta: `Sí. Emite los ${Object.keys(TIPOS_ECF).length} tipos de comprobante fiscal electrónico, los firma, los envía a la DGII y genera los formatos 606, 607 y 608. Para emitir, la empresa necesita su certificado digital y completar la habilitación ante la DGII.`,
    },
    {
      pregunta: '¿Zero lleva la contabilidad?',
      respuesta: 'Sí, en todos los planes. Los asientos se generan a partir de las facturas, los cobros, las compras y la nómina, y saca libro diario, mayor, balance de comprobación, estado de resultados y balance general.',
    },
    {
      pregunta: '¿Zero tiene punto de venta?',
      respuesta: `Sí: venta con lector de código de barras, cobro dividido, venta a crédito y modo restaurante con mesas y comandas. ${m('pos')?.viene ?? ''} No funciona sin conexión a internet.`,
    },
    {
      pregunta: '¿Zero tiene nómina?',
      respuesta: `Sí. Calcula AFP, SFS, ISR, riesgos laborales e INFOTEP, y corre nóminas mensuales, quincenales y semanales.${nomina ? ` Es un adicional de ${usd(nomina.price)} al mes y viene incluida en los planes de colegio.` : ''} No presenta ni paga la TSS.`,
    },
    {
      pregunta: '¿Zero sirve para un colegio?',
      respuesta: 'Sí. Tiene un producto para colegios con matrícula, mensualidades que se crean solas, cobro a las familias con enlace de pago, avisos por correo, WhatsApp y SMS, y conexión con SIGERD. Incluye además facturación, contabilidad, nómina y punto de venta.',
    },
    {
      pregunta: '¿Cuánto cuesta Zero?',
      respuesta: `${desde != null ? `Desde ${usd(desde)} al mes. ` : ''}${pos ? `El punto de venta suma ${usd(pos.price)} al mes. ` : ''}Hay prueba gratis: ${textoDeLaPrueba()}. Los planes y sus topes están en ${SITIO_PUBLICO}/precios`,
    },
    {
      pregunta: '¿Puede un asistente de IA conectarse a Zero?',
      respuesta: `Sí, en modo de solo lectura: por un conector MCP consulta clientes, facturas, cobros y cuentas por cobrar de la empresa que le dio una llave. Todavía no puede crear ni cambiar nada. Detalle en ${SITIO_PUBLICO}/agentes`,
    },
  ];
}

function fechaLarga(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${dia} de ${meses[mes - 1]} de ${anio}`;
}

const lista = (puntos: readonly string[]) => puntos.map((p) => `- ${p}`).join('\n');

function moduloEnTexto(m: Modulo): string {
  const partes = [`## ${m.nombre}`, '', m.resumen, '', lista(m.hace)];
  if (m.noHace?.length) partes.push('', '**No hace:**', '', lista(m.noHace));
  if (m.nota) partes.push('', `**Ten en cuenta:** ${m.nota}`);
  partes.push('', `**Viene en:** ${m.viene}`);
  return partes.join('\n');
}

/** `/funciones.md`: el sistema entero en texto limpio. */
export function funcionesMarkdown(): string {
  const planes = filasDePlanes();
  const aparte = productosAparte();
  return `# Todo lo que hace Zero

> Zero es un sistema de gestión en la nube para empresas y colegios de República Dominicana. Reúne facturación electrónica ante la DGII, cuentas por cobrar, inventario, compras, contabilidad, reportes fiscales, punto de venta, nómina y administración escolar. Funciona en el navegador, en español, sin instalar nada.

Revisado contra el sistema el ${fechaLarga(FUNCIONES_ACTUALIZADA)}. Versión para personas: ${SITIO_PUBLICO}${RUTA_FUNCIONES}

## Para quién es

- Negocios que venden a crédito o de contado y tienen que facturar ante la DGII.
- Tiendas, cafeterías y restaurantes que necesitan caja y punto de venta.
- Colegios que cobran inscripción y mensualidades a las familias.
- Contadores que llevan varias empresas.

## Módulos

${MODULOS.map((m) => `- ${m.nombre}: ${m.resumen}`).join('\n')}

${MODULOS.map(moduloEnTexto).join('\n\n')}

## Comprobantes fiscales que emite

| Código | Comprobante |
|---|---|
${tiposDeComprobante().map(([codigo, nombre]) => `| ${codigo} | ${nombre} |`).join('\n')}

## Planes y precios

| Producto | Plan | Precio | Comprobantes | Usuarios | Estudiantes |
|---|---|---|---|---|---|
${planes.map((p) => `| ${p.linea} | ${p.plan} | ${p.precio} | ${p.comprobantes} | ${p.usuarios} | ${p.estudiantes} |`).join('\n')}

Adicionales:

${ADDONS.map((a) => `- ${a.name}: +${usd(a.price)} al mes. ${a.descripcion}`).join('\n')}
${aparte.length ? `\nSe contratan aparte, con precio bajo cotización:\n\n${aparte.map((p) => `- ${p.nombre}: ${p.descripcion}`).join('\n')}\n` : ''}
Detalle y contratación: ${SITIO_PUBLICO}/precios

## Prueba y suscripción

${lista(reglasDeSuscripcion())}

## Qué no hace Zero

${todoLoQueNoHace().map((x) => `- ${x.modulo}: ${x.punto}`).join('\n')}

## Más información

- Cómo usa Zero un agente de IA: ${SITIO_PUBLICO}${RUTA_AGENTES_MD}
- Resumen del sitio: ${SITIO_PUBLICO}/llms.txt
- Guías de trámites dominicanos: ${SITIO_PUBLICO}/guias
- Contacto: ${SITIO_PUBLICO}/contacto
`;
}
