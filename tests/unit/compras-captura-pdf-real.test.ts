import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, Page, View, Text, Image, renderToBuffer } from '@react-pdf/renderer';
import QR from 'qrcode';
import { imagenesDePdf, pintarPrimeraPagina } from '@/lib/compras/captura/pdf';
import { leerQr } from '@/lib/compras/captura/qr';
import { leerTimbre } from '@/lib/compras/captura/timbre';

/**
 * El QR dentro de un PDF hecho por un generador de verdad.
 *
 * La otra prueba arma el PDF a mano, byte a byte, y por eso demuestra menos de
 * lo que parece: podría estar comprobando que mi propio PDF se deja leer. Esta
 * usa `@react-pdf/renderer`, que es **el mismo con el que esta aplicación emite
 * las representaciones impresas de sus e-CF** (`lib/pdf/generar.ts`), y le mete
 * el QR igual que allí: una imagen PNG en un data URL.
 *
 * El otro caso, el del proveedor que dibuja su QR con trazos en vez de
 * incrustarlo como imagen, también se prueba aquí: de ese PDF no se saca
 * ninguna imagen, y el timbre tiene que salir igual pintando la página.
 */

const TIMBRE = 'https://ecf.dgii.gov.do/ecf/consultatimbre?rncemisor=132047907&RncComprador=133716348'
  + '&encf=E310000000045&fechaemision=27-09-2026&montototal=1500.01'
  + '&fechafirma=27-09-2026%2010%3A15%3A00&codigoseguridad=Ab3Xy9';

/** Una representación impresa como la que emite la app: datos y el QR del timbre. */
async function facturaConQr(ancho: number): Promise<Buffer> {
  const qr = await QR.toDataURL(TIMBRE, { width: ancho, margin: 1, errorCorrectionLevel: 'M' });
  const doc = React.createElement(
    Document, null,
    React.createElement(
      Page, { size: 'LETTER', style: { padding: 32 } },
      React.createElement(Text, { style: { fontSize: 14 } }, 'FALCO TELECOM SRL'),
      React.createElement(Text, { style: { fontSize: 9 } }, 'RNC 132047907 · e-NCF E310000000045'),
      React.createElement(Text, { style: { fontSize: 9 } }, 'Fecha 27/09/2026 · TOTAL RD$ 1,500.01'),
      React.createElement(View, { style: { marginTop: 16 } },
        React.createElement(Image, { src: qr, style: { width: 96, height: 96 } })),
    ),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- createElement sin JSX pierde el tipo del Document
  return renderToBuffer(doc as any);
}

async function timbreDe(pdf: Buffer) {
  for (const imagen of await imagenesDePdf(pdf)) {
    const t = leerTimbre(await leerQr(imagen));
    if (t) return t;
  }
  return null;
}

describe('QR en un PDF hecho con el mismo generador que usa la app', () => {
  it('se saca del PDF y se lee', async () => {
    const timbre = await timbreDe(await facturaConQr(128));
    expect(timbre).toMatchObject({
      rncEmisor: '132047907',
      encf: 'E310000000045',
      fechaEmision: '2026-09-27',
      montoTotalCents: 150_001,
    });
  }, 60_000);

  it('también al tamaño chico con el que la app lo imprime', async () => {
    // `lib/pdf/generar.ts` genera el QR a 128 px. Si a ese tamaño no se leyera,
    // el camino no serviría justo para las facturas que emite esta aplicación.
    expect(await timbreDe(await facturaConQr(128))).not.toBeNull();
  }, 60_000);
});

describe('QR dibujado con trazos, no incrustado como imagen', () => {
  /**
   * Hay generadores que pintan el QR módulo a módulo, como rectángulos. Para el
   * PDF eso no es una imagen: es dibujo, y por tanto no hay nada que extraer.
   * Se reproduce aquí dibujando los cuadros del propio QR con `View`.
   */
  async function facturaConQrDibujado(): Promise<Buffer> {
    const { modules } = QR.create(TIMBRE, { errorCorrectionLevel: 'M' });
    const lado = modules.size;
    const punto = 4;
    const celdas: React.ReactElement[] = [];
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        if (!modules.get(x, y)) continue;
        celdas.push(React.createElement(View, {
          key: `${x}-${y}`,
          style: {
            position: 'absolute', left: x * punto, top: y * punto,
            width: punto, height: punto, backgroundColor: '#000',
          },
        }));
      }
    }
    const doc = React.createElement(
      Document, null,
      React.createElement(
        Page, { size: 'LETTER', style: { padding: 24 } },
        React.createElement(Text, { style: { fontSize: 12 } }, 'FALCO TELECOM SRL'),
        React.createElement(View, {
          style: { position: 'relative', marginTop: 12, width: lado * punto, height: lado * punto, backgroundColor: '#fff' },
        }, celdas),
      ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- createElement sin JSX pierde el tipo del Document
    return renderToBuffer(doc as any);
  }

  it('el PDF no trae ninguna imagen que sacar', async () => {
    expect(await imagenesDePdf(await facturaConQrDibujado())).toEqual([]);
  }, 60_000);

  it('aun así se lee el timbre, pintando la página', async () => {
    const pagina = await pintarPrimeraPagina(await facturaConQrDibujado());
    expect(pagina).not.toBeNull();
    expect(leerTimbre(await leerQr(pagina!))).toMatchObject({
      rncEmisor: '132047907', encf: 'E310000000045', montoTotalCents: 150_001,
    });
  }, 60_000);
});
