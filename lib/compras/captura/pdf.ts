import 'server-only';

/**
 * Las imágenes que lleva dentro un PDF.
 *
 * Existe por el QR del e-CF. El lector de QR solo sabe mirar píxeles, así que
 * mientras lo único que entraba eran fotos de teléfono bastaba con pasarle el
 * archivo. Al admitir el PDF que el proveedor manda por correo —que es
 * justamente el que trae el timbre impreso— esa puerta se cerraba: el PDF se
 * saltaba y la factura entraba por IA, que interpreta. El QR no se interpreta:
 * trae el RNC del emisor, el e-NCF, la fecha y el total exactos y firmados.
 *
 * No se rasteriza la página: el QR va dentro del PDF como una imagen propia, y
 * sacarla es más barato y más nítido que renderizar un folio entero. Si el PDF
 * resulta ser un escaneo —la página entera como una sola foto— también cae
 * aquí, porque esa foto es una imagen embebida más.
 *
 * Quedarse sin imágenes nunca es un error: la IA lee la factura igual.
 */

/** Un PDF trae logos, firmas y sellos; el timbre está entre los primeros. */
const MAX_IMAGENES = 12;

/**
 * Solo las primeras páginas: el timbre va arriba, en la primera. Ojo con la
 * opción —`last` son las ÚLTIMAS N páginas, no las primeras—, y con un PDF
 * largo eso sería mirar justo donde el QR no está.
 */
const MAX_PAGINAS = 4;

export async function imagenesDePdf(buffer: Buffer): Promise<Buffer[]> {
  // pdf-parse carga pdf.js entero: se trae solo cuando hay un PDF que mirar, no
  // al cargar el módulo, que es lo que hacen el resto de lectores de aquí.
  const { PDFParse } = await import('pdf-parse');
  let parser: InstanceType<typeof PDFParse> | null = null;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const salida: Buffer[] = [];
    const { pages } = await parser.getImage({ first: MAX_PAGINAS });
    for (const pagina of pages) {
      for (const imagen of pagina.images) {
        const base64 = imagen.dataUrl?.split(',')[1];
        if (!base64) continue;
        salida.push(Buffer.from(base64, 'base64'));
        if (salida.length >= MAX_IMAGENES) return salida;
      }
    }
    return salida;
  } catch (e) {
    console.warn('[captura-factura] no se pudieron sacar las imágenes del PDF', e);
    return [];
  } finally {
    await parser?.destroy().catch(() => {});
  }
}

/**
 * Al doble de tamaño: un QR de 96 puntos mide 96 píxeles a escala 1, y a ese
 * tamaño el decodificador falla más de lo aceptable. Al doble entra de sobra y
 * la página pesa unos 200 KB, que se tiran en cuanto se lee.
 */
const ESCALA_PAGINA = 2;

/** Solo la primera: el timbre va arriba, y pintar folios cuesta. */
const PAGINAS_PINTADAS = 1;

/**
 * La primera página pintada como imagen.
 *
 * Es el plan B de `imagenesDePdf` para el PDF que dibuja su QR con trazos en
 * vez de incrustarlo como imagen: ahí no hay ninguna imagen que sacar y el
 * timbre se perdería, cayendo en la lectura con IA sin que nadie se entere.
 * Pintando la página, el QR vuelve a ser píxeles y el lector de siempre lo
 * encuentra.
 *
 * Cuesta bastante más que sacar una imagen ya hecha, así que solo se llama
 * cuando lo barato no encontró nada, y después de haber respondido.
 */
export async function pintarPrimeraPagina(buffer: Buffer): Promise<Buffer | null> {
  const { PDFParse } = await import('pdf-parse');
  let parser: InstanceType<typeof PDFParse> | null = null;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const { pages } = await parser.getScreenshot({ first: PAGINAS_PINTADAS, scale: ESCALA_PAGINA });
    const base64 = pages[0]?.dataUrl?.split(',')[1];
    return base64 ? Buffer.from(base64, 'base64') : null;
  } catch (e) {
    console.warn('[captura-factura] no se pudo pintar la página del PDF', e);
    return null;
  } finally {
    await parser?.destroy().catch(() => {});
  }
}
