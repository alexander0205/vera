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
