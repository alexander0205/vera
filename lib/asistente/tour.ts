/**
 * Tour guiado: resalta en la pantalla real el botón o la sección donde se hace
 * cada paso de «primeros pasos». Los pasos son datos; el componente
 * `components/tour/TourGuiado.tsx` los dibuja y lee `?tour=<id>` de la URL.
 *
 * Los destinos se marcan en las pantallas con `data-tour="<destino>"`; si el
 * elemento no aparece, el tour igual explica el paso (nunca deja la pantalla
 * trabada ni depende de que el marcado exista).
 */

export interface PasoTour {
  id: string;
  /** Pantalla real donde ocurre. */
  ruta: string;
  /** Valor de `data-tour` del elemento a resaltar. */
  destino: string;
  titulo: string;
  texto: string;
  /** Texto del botón cuando el paso lleva a otra pantalla o al siguiente paso. */
  siguiente?: string;
}

export const PASOS_TOUR: PasoTour[] = [
  {
    id: 'certificado', ruta: '/dashboard/certificado', destino: 'certificado-subir',
    titulo: 'Sube tu certificado digital',
    texto: 'Es el archivo .p12 o .pfx con el que se firman tus facturas ante la DGII. Elígelo aquí, escribe su contraseña y súbelo.',
    siguiente: 'Siguiente: secuencias',
  },
  {
    id: 'secuencias', ruta: '/dashboard/secuencias', destino: 'secuencias-nueva',
    titulo: 'Registra tus secuencias de NCF',
    texto: 'Son los rangos de números que la DGII te autorizó. Pulsa aquí y registra el rango de cada tipo de comprobante que vayas a emitir.',
    siguiente: 'Siguiente: tus productos',
  },
  {
    id: 'producto', ruta: '/dashboard/productos', destino: 'producto-nuevo',
    titulo: 'Crea tu primer producto o servicio',
    texto: 'Pulsa aquí y llena el nombre, el precio y el ITBIS. Después podrás elegirlo con un clic al facturar. Repite para cada cosa que vendes.',
    siguiente: 'Siguiente: tus clientes',
  },
  {
    id: 'cliente', ruta: '/dashboard/clientes', destino: 'cliente-nuevo',
    titulo: 'Registra un cliente (opcional)',
    texto: 'Para ventas de consumo final no hace falta. Para crédito fiscal sí: pulsa aquí y registra su nombre y RNC.',
    siguiente: 'Siguiente: tu primera factura',
  },
  {
    id: 'factura-cliente', ruta: '/dashboard/facturas/nueva', destino: 'factura-cliente',
    titulo: 'Elige el cliente',
    texto: 'Busca a tu cliente por nombre o RNC, o déjalo en consumo final si no necesita crédito fiscal.',
    siguiente: 'Siguiente: las líneas',
  },
  {
    id: 'factura-lineas', ruta: '/dashboard/facturas/nueva', destino: 'factura-lineas',
    titulo: 'Agrega lo que vendes',
    texto: 'Escoge los productos que creaste, la cantidad y el precio. El ITBIS y el total se calculan solos.',
    siguiente: 'Siguiente: emitir',
  },
  {
    id: 'factura-emitir', ruta: '/dashboard/facturas/nueva', destino: 'factura-emitir',
    titulo: 'Emite tu factura',
    texto: 'Cuando todo esté bien, pulsa el botón de emitir. Puedes ver una vista previa antes.',
  },
];

export const pasoTour = (id: string | null | undefined): PasoTour | null =>
  PASOS_TOUR.find((p) => p.id === id) ?? null;

export const siguientePasoTour = (id: string): PasoTour | null => {
  const i = PASOS_TOUR.findIndex((p) => p.id === id);
  return i >= 0 ? PASOS_TOUR[i + 1] ?? null : null;
};

/** Dirección que abre un paso del tour. */
export const urlDeTour = (id: string): string | null => {
  const p = pasoTour(id);
  return p ? `${p.ruta}?tour=${p.id}` : null;
};

/** Qué paso del tour corresponde a cada paso de «primeros pasos» (por su pantalla). */
const TOUR_DE_RUTA: Record<string, string> = {
  '/dashboard/certificado': 'certificado',
  '/dashboard/secuencias': 'secuencias',
  '/dashboard/clientes/nuevo': 'cliente',
  '/dashboard/productos': 'producto',
  '/dashboard/facturas/nueva': 'factura-cliente',
};
export const tourDeRuta = (ruta: string): string | null => TOUR_DE_RUTA[ruta] ?? null;

/** Posición del paso dentro del tour completo, para «Paso 3 de 7». */
export const posicionTour = (id: string) => {
  const i = PASOS_TOUR.findIndex((p) => p.id === id);
  return { actual: i + 1, total: PASOS_TOUR.length };
};
