/**
 * Tour guiado: resalta en la pantalla real el botón o la sección donde se hace
 * cada paso de «primeros pasos». Los pasos son datos; el componente
 * `components/tour/TourGuiado.tsx` los dibuja y lee `?tour=<id>` de la URL.
 *
 * Los destinos se marcan en las pantallas con `data-tour="<destino>"`; si el
 * elemento no aparece, el tour igual explica el paso (nunca deja la pantalla
 * trabada ni depende de que el marcado exista).
 */

export type GrupoTour = 'empresa' | 'catalogo' | 'factura';

export const GRUPOS_TOUR: Record<GrupoTour, string> = {
  empresa: 'Configura tu empresa',
  catalogo: 'Prepara tu catálogo',
  factura: 'Emite tu primera factura',
};

export interface PasoTour {
  id: string;
  /** Pantalla real donde ocurre. */
  ruta: string;
  /** Valor de `data-tour` del elemento a resaltar. */
  destino: string;
  grupo: GrupoTour;
  titulo: string;
  texto: string;
  /** Un consejo corto, aparte del texto. */
  consejo?: string;
}

export const PASOS_TOUR: PasoTour[] = [
  {
    id: 'empresa', ruta: '/dashboard/configuracion', destino: 'empresa-datos', grupo: 'empresa',
    titulo: 'Completa los datos de tu negocio',
    texto: 'Nombre, dirección, teléfono y logo. Salen en todas tus facturas en PDF, así que conviene dejarlos bien desde el principio.',
    consejo: 'Cuando termines, pulsa «Guardar» arriba a la derecha.',
  },
  {
    id: 'certificado', ruta: '/dashboard/certificado', destino: 'certificado-subir', grupo: 'empresa',
    titulo: 'Sube tu certificado digital',
    texto: 'Es el archivo .p12 o .pfx con el que se firman tus facturas ante la DGII. Elígelo aquí, escribe su contraseña y súbelo.',
    consejo: 'Guarda la contraseña: sin ella el certificado no se puede usar.',
  },
  {
    id: 'secuencias', ruta: '/dashboard/secuencias', destino: 'secuencias-nueva', grupo: 'empresa',
    titulo: 'Registra tus secuencias de NCF',
    texto: 'Son los rangos de números que la DGII te autorizó. Pulsa aquí y registra el rango de cada tipo de comprobante que vayas a emitir.',
    consejo: 'Si aún no tienes rangos, se solicitan en la Oficina Virtual de la DGII.',
  },
  {
    id: 'producto', ruta: '/dashboard/productos', destino: 'producto-nuevo', grupo: 'catalogo',
    titulo: 'Crea tu primer producto o servicio',
    texto: 'Pulsa aquí y llena el nombre, el precio y el ITBIS. Después podrás elegirlo con un clic al facturar.',
    consejo: 'Empieza por lo que más vendes; el resto se agrega con el tiempo.',
  },
  {
    id: 'producto-importar', ruta: '/dashboard/productos', destino: 'producto-importar', grupo: 'catalogo',
    titulo: '¿Ya tienes tu lista en Excel?',
    texto: 'Impórtala de una vez en vez de crear los productos uno por uno. Sube un archivo CSV con tus productos y precios.',
  },
  {
    id: 'cliente', ruta: '/dashboard/clientes', destino: 'cliente-nuevo', grupo: 'catalogo',
    titulo: 'Registra un cliente (opcional)',
    texto: 'Para ventas de consumo final no hace falta. Para crédito fiscal sí: pulsa aquí y registra su nombre y RNC.',
    consejo: 'También se crean solos cuando facturas a alguien nuevo.',
  },
  {
    id: 'factura-cliente', ruta: '/dashboard/facturas/nueva', destino: 'factura-cliente', grupo: 'factura',
    titulo: 'Elige el cliente',
    texto: 'Busca a tu cliente por nombre o RNC, o déjalo en consumo final si no necesita crédito fiscal.',
  },
  {
    id: 'factura-lineas', ruta: '/dashboard/facturas/nueva', destino: 'factura-lineas', grupo: 'factura',
    titulo: 'Agrega lo que vendes',
    texto: 'Escoge los productos que creaste, la cantidad y el precio. El ITBIS y el total se calculan solos.',
  },
  {
    id: 'factura-pago', ruta: '/dashboard/facturas/nueva', destino: 'factura-pago', grupo: 'factura',
    titulo: 'Registra el cobro si ya te pagaron',
    texto: 'Marca «Registrar pago recibido» para dejar la factura pagada en el acto, con el método y el monto.',
    consejo: 'Si no te han pagado, déjalo sin marcar: quedará por cobrar.',
  },
  {
    id: 'factura-vista-previa', ruta: '/dashboard/facturas/nueva', destino: 'factura-vista-previa', grupo: 'factura',
    titulo: 'Revisa cómo quedará',
    texto: 'La vista previa te muestra la factura tal como la verá tu cliente, antes de emitirla.',
  },
  {
    id: 'factura-emitir', ruta: '/dashboard/facturas/nueva', destino: 'factura-emitir', grupo: 'factura',
    titulo: 'Emite tu factura',
    texto: 'Cuando todo esté bien, pulsa el botón de emitir. Quedará firmada y enviada a la DGII.',
    consejo: 'Después podrás descargarla en PDF o enviarla por correo.',
  },
];

export const pasoTour = (id: string | null | undefined): PasoTour | null =>
  PASOS_TOUR.find((p) => p.id === id) ?? null;

export const siguientePasoTour = (id: string): PasoTour | null => {
  const i = PASOS_TOUR.findIndex((p) => p.id === id);
  return i >= 0 ? PASOS_TOUR[i + 1] ?? null : null;
};

export const anteriorPasoTour = (id: string): PasoTour | null => {
  const i = PASOS_TOUR.findIndex((p) => p.id === id);
  return i > 0 ? PASOS_TOUR[i - 1] : null;
};

/** Dirección que abre un paso del tour. */
export const urlDeTour = (id: string): string | null => {
  const p = pasoTour(id);
  return p ? `${p.ruta}?tour=${p.id}` : null;
};

/** Qué paso del tour corresponde a cada paso de «primeros pasos» (por su pantalla). */
const TOUR_DE_RUTA: Record<string, string> = {
  '/dashboard/configuracion': 'empresa',
  '/dashboard/certificado': 'certificado',
  '/dashboard/secuencias': 'secuencias',
  '/dashboard/clientes/nuevo': 'cliente',
  '/dashboard/productos': 'producto',
  '/dashboard/facturas/nueva': 'factura-cliente',
};
export const tourDeRuta = (ruta: string): string | null => TOUR_DE_RUTA[ruta] ?? null;

/** Posición del paso dentro del tour completo, para «Paso 3 de 11». */
export const posicionTour = (id: string) => {
  const i = PASOS_TOUR.findIndex((p) => p.id === id);
  return { actual: i + 1, total: PASOS_TOUR.length };
};
