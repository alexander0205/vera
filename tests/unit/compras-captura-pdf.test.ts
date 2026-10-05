import { describe, it, expect } from 'vitest';
import QR from 'qrcode';
import sharp from 'sharp';
import { imagenesDePdf } from '@/lib/compras/captura/pdf';
import { leerQr } from '@/lib/compras/captura/qr';
import { leerTimbre } from '@/lib/compras/captura/timbre';
import { datosDesdeTimbre } from '@/lib/compras/captura/datos';

/**
 * El PDF que el proveedor manda por correo lleva el timbre del e-CF impreso
 * como QR. Mientras el lector solo miraba fotos, ese PDF entraba sin el dato
 * exacto y todo quedaba en manos de la lectura con IA.
 *
 * Aquí se fabrica un PDF como el real —el QR va dentro como imagen JPEG, que es
 * como lo pone cualquier generador— y se recorre el camino entero: sacar la
 * imagen, leer el código y convertirlo en los datos del registro.
 */

const TIMBRE = 'https://ecf.dgii.gov.do/ecf/consultatimbre?rncemisor=132047907&RncComprador=133716348'
  + '&encf=E310000000045&fechaemision=27-09-2026&montototal=1500.01'
  + '&fechafirma=27-09-2026%2010%3A15%3A00&codigoseguridad=Ab3Xy9';

/** El JPEG en la PRIMERA página, y `relleno` páginas vacías detrás. */
function pdfConImagen(jpeg: Buffer, ancho: number, alto: number, relleno = 0): Buffer {
  const kids = ['3 0 R', ...Array.from({ length: relleno }, (_, i) => `${6 + i} 0 R`)].join(' ');
  const dicts = [
    '<</Type/Catalog/Pages 2 0 R>>',
    `<</Type/Pages/Kids[${kids}]/Count ${1 + relleno}>>`,
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>',
  ];
  const contenido = 'q 200 0 0 200 60 500 cm /Im0 Do Q\n';
  const partes: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let pos = partes[0].length;
  const push = (b: Buffer) => { partes.push(b); pos += b.length; };

  for (let i = 0; i < 5 + relleno; i++) {
    offsets.push(pos);
    if (i >= 5) {
      push(Buffer.from(`${i + 1} 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>\nendobj\n`));
    } else if (i === 3) {
      const cab = Buffer.from(
        `4 0 obj\n<</Type/XObject/Subtype/Image/Width ${ancho}/Height ${alto}`
        + `/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpeg.length}>>\nstream\n`,
      );
      push(Buffer.concat([cab, jpeg, Buffer.from('\nendstream\nendobj\n')]));
    } else if (i === 4) {
      push(Buffer.from(`5 0 obj\n<</Length ${contenido.length}>>\nstream\n${contenido}endstream\nendobj\n`));
    } else {
      push(Buffer.from(`${i + 1} 0 obj\n${dicts[i]}\nendobj\n`));
    }
  }
  const inicioXref = pos;
  const total = offsets.length + 1;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  push(Buffer.from(`${xref}trailer\n<</Size ${total}/Root 1 0 R>>\nstartxref\n${inicioXref}\n%%EOF\n`));
  return Buffer.concat(partes);
}

async function pdfDeEcf(relleno = 0): Promise<Buffer> {
  const png = await QR.toBuffer(TIMBRE, { width: 400, margin: 2 });
  const { data, info } = await sharp(png).flatten({ background: '#fff' })
    .jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true });
  return pdfConImagen(data, info.width, info.height, relleno);
}

/** El primer timbre que se lea de las imágenes del PDF. */
async function timbreDe(pdf: Buffer) {
  for (const imagen of await imagenesDePdf(pdf)) {
    const t = leerTimbre(await leerQr(imagen));
    if (t) return t;
  }
  return null;
}

describe('el QR dentro de un PDF', () => {
  it('saca las imágenes que el PDF lleva embebidas', async () => {
    const imagenes = await imagenesDePdf(await pdfDeEcf());
    expect(imagenes.length).toBeGreaterThan(0);
  }, 30_000);

  it('del PDF salen los mismos datos exactos que de la foto del QR', async () => {
    const timbre = await timbreDe(await pdfDeEcf());
    expect(timbre).not.toBeNull();
    expect(timbre).toMatchObject({
      rncEmisor: '132047907',
      encf: 'E310000000045',
      fechaEmision: '2026-09-27',
      montoTotalCents: 150_001,
    });

    // Y eso es lo que entra al registro, sin pasar por ninguna interpretación.
    const datos = datosDesdeTimbre(timbre!, '133716348');
    expect(datos).toMatchObject({
      proveedorRnc: '132047907', ncf: 'E310000000045', fecha: '2026-09-27', totalCents: 150_001,
    });
  }, 30_000);

  it('en un PDF largo mira la PRIMERA página, que es donde va el timbre', async () => {
    // Con el rango al revés —las últimas páginas en lugar de las primeras— esto
    // sale vacío y la factura pierde su dato exacto sin que nadie se entere.
    expect(await timbreDe(await pdfDeEcf(5))).toMatchObject({ encf: 'E310000000045' });
  }, 30_000);

  it('un archivo que no es un PDF no revienta nada: se devuelve vacío', async () => {
    expect(await imagenesDePdf(Buffer.from('esto no es un pdf'))).toEqual([]);
  }, 30_000);
});
