import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { leerQr } from '@/lib/compras/captura/qr';
import { leerTimbre } from '@/lib/compras/captura/timbre';

const URL_E31 = 'https://ecf.dgii.gov.do/ecf/consultatimbre?rncemisor=132274741&RncComprador=131988032&encf=E310000000034&fechaemision=15-09-2026&montototal=3200.00&fechafirma=15-09-2026%2015%3A14%3A02&codigoseguridad=XdnBqr';

/** Una «factura»: papel blanco de 1200×1700 con el QR pequeño abajo a la derecha. */
async function facturaConQr(ladoQr: number, rotar = 0): Promise<Buffer> {
  const qr = await QRCode.toBuffer(URL_E31, { width: ladoQr, margin: 2 });
  let img = sharp({ create: { width: 1200, height: 1700, channels: 3, background: '#ffffff' } })
    .composite([{ input: qr, left: 1200 - ladoQr - 80, top: 1700 - ladoQr - 120 }])
    .jpeg({ quality: 82 });
  let buf = await img.toBuffer();
  if (rotar) buf = await sharp(buf).rotate(rotar, { background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer();
  return buf;
}

describe('QR en la foto de la factura', () => {
  it('lo encuentra aunque ocupe una esquina del papel', async () => {
    const texto = await leerQr(await facturaConQr(220));
    expect(leerTimbre(texto)?.encf).toBe('E310000000034');
  });

  it('también con la foto girada', async () => {
    const texto = await leerQr(await facturaConQr(260, 90));
    expect(leerTimbre(texto)?.montoTotalCents).toBe(320000);
  });

  it('una foto sin QR devuelve null', async () => {
    const blanco = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    expect(await leerQr(blanco)).toBeNull();
  });

  it('un PDF no revienta', async () => {
    expect(await leerQr(Buffer.from('%PDF-1.4\n%falso'))).toBeNull();
  });
});
