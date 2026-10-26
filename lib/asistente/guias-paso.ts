/**
 * Ayuda guiada para tareas de varios pasos («¿qué me falta para emitir mi
 * primera factura?»). Cada paso apunta a una pantalla real de Zero y, cuando se
 * puede saber, dice si ya está hecho; el asistente marca el siguiente.
 *
 * El estado sale de `estado_configuracion` (solo conteos; nada personal). Un
 * dato que no se pudo consultar queda en `null` y el paso se muestra sin marca:
 * nunca se afirma «listo» ni «falta» sin saberlo.
 */

export interface EstadoConfiguracion {
  certificado: boolean | null;
  secuencias: number | null;
  clientes: number | null;
  productos: number | null;
  facturasEmitidas: number | null;
}

export interface PasoGuia {
  titulo: string;
  detalle: string;
  /** Pantalla real donde se hace (se verifica contra el mapa en las pruebas). */
  ruta: string;
  /** true = hecho, false = falta, null = no se sabe. */
  listo: (e: EstadoConfiguracion) => boolean | null;
  opcional?: boolean;
}

export interface FlujoGuia {
  id: 'primera-factura' | 'primera-cotizacion';
  titulo: string;
  pasos: PasoGuia[];
}

const cuenta = (v: number | null) => (v == null ? null : v > 0);

export const FLUJOS: FlujoGuia[] = [
  {
    id: 'primera-factura',
    titulo: 'Emitir tu primera factura',
    pasos: [
      { titulo: 'Subir el certificado digital', detalle: 'Es con lo que se firman tus comprobantes ante la DGII.', ruta: '/dashboard/certificado', listo: (e) => e.certificado },
      { titulo: 'Registrar tus secuencias de NCF', detalle: 'El rango de números que la DGII te autorizó.', ruta: '/dashboard/secuencias', listo: (e) => cuenta(e.secuencias) },
      { titulo: 'Crear un cliente', detalle: 'Para facturas de consumo final no hace falta; para crédito fiscal sí.', ruta: '/dashboard/clientes/nuevo', listo: (e) => cuenta(e.clientes), opcional: true },
      { titulo: 'Crear un producto o servicio', detalle: 'Con su precio e ITBIS, para elegirlo al facturar.', ruta: '/dashboard/productos', listo: (e) => cuenta(e.productos) },
      { titulo: 'Emitir la factura', detalle: 'Elige el cliente, agrega las líneas y emite.', ruta: '/dashboard/facturas/nueva', listo: (e) => cuenta(e.facturasEmitidas) },
    ],
  },
  {
    id: 'primera-cotizacion',
    titulo: 'Hacer tu primera cotización',
    pasos: [
      { titulo: 'Crear un producto o servicio', detalle: 'Para agregarlo a la cotización con su precio.', ruta: '/dashboard/productos', listo: (e) => cuenta(e.productos) },
      { titulo: 'Crear un cliente', detalle: 'A quién se la envías.', ruta: '/dashboard/clientes/nuevo', listo: (e) => cuenta(e.clientes) },
      { titulo: 'Crear la cotización', detalle: 'Agrega las líneas y envíala por correo o descárgala en PDF.', ruta: '/dashboard/cotizaciones/nueva', listo: () => null },
    ],
  },
];

export const DISPARA_FLUJO_FACTURA = /\b(primera factura|como (empiezo|comienzo|inicio) a facturar|empezar a facturar|que me falta (para|por)|que necesito para (facturar|emitir)|puedo (ya )?(emitir|facturar)|configurar (todo|mi cuenta|la facturacion)|primeros pasos|por donde empiezo|ayudame a (empezar|configurar)|guiame (para|a))\b/;
export const DISPARA_FLUJO_COTIZACION = /\bprimera cotizacion\b/;

export function formatearFlujo(flujo: FlujoGuia, estado: EstadoConfiguracion): string {
  const marcas = flujo.pasos.map((p) => p.listo(estado));
  // El siguiente paso: el primero que falta (los opcionales no frenan).
  const siguiente = flujo.pasos.findIndex((p, i) => marcas[i] === false && !p.opcional);
  const sabe = marcas.some((m) => m !== null);
  const hechos = marcas.filter((m) => m === true).length;

  const lineas: string[] = [`**${flujo.titulo}**`];
  if (sabe) {
    lineas.push(siguiente < 0
      ? (marcas.every((m) => m === true) ? '¡Completaste todos los pasos!' : 'Ya tienes todo lo necesario. Solo falta hacerlo.')
      : `Llevas ${hechos} de ${flujo.pasos.length} pasos. El siguiente es el **${siguiente + 1}**.`);
  }
  lineas.push('');
  flujo.pasos.forEach((p, i) => {
    const m = marcas[i];
    const icono = m === true ? '✅' : m === false ? (i === siguiente ? '👉' : '⬜') : '▫️';
    lineas.push(
      `${i + 1}. ${icono} [${p.titulo}](${p.ruta})${p.opcional ? ' _(opcional)_' : ''}${m === true ? ' — hecho' : ''}`,
      `   ${p.detalle}`,
    );
  });
  if (siguiente >= 0) lineas.push('', `Empieza por [${flujo.pasos[siguiente].titulo}](${flujo.pasos[siguiente].ruta}). Cuando termines, vuelve a preguntarme «¿qué me falta?» y lo reviso.`);
  return lineas.join('\n');
}
