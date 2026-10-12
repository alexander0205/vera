import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  validarImagen, procesarImagen, claveFoto, LADO_FOTO, LADO_MINIATURA, MAX_BYTES_SUBIDA,
} from '@/lib/fotos/storage';

/**
 * Lo que llega del teléfono es un binario de internet. Aquí se comprueba que no
 * se acepta lo que no es una foto y que lo que sí lo es acaba pesando lo que
 * tiene que pesar (una foto de móvil son varios MB).
 */

/** Foto sintética del tamaño típico de una cámara de móvil. */
async function fotoFalsa(ancho = 3000, alto = 4000, formato: 'jpeg' | 'png' = 'jpeg') {
  const img = sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 120, g: 80, b: 40 } },
  });
  return formato === 'png' ? img.png().toBuffer() : img.jpeg().toBuffer();
}

describe('validarImagen', () => {
  it('acepta las fotos de verdad y dice sus medidas', async () => {
    const meta = await validarImagen(await fotoFalsa(800, 600));
    expect(meta).toEqual({ formato: 'jpeg', ancho: 800, alto: 600 });
    const png = await validarImagen(await fotoFalsa(100, 100, 'png'));
    expect(png?.formato).toBe('png');
  });

  it('rechaza lo que no es una imagen aunque venga disfrazado', async () => {
    // Un ejecutable, un JSON o un HTML con un <script>: nada de eso tiene
    // cabecera de imagen, que es lo único que miramos (no el Content-Type).
    expect(await validarImagen(Buffer.from('MZ\x90\x00ejecutable'))).toBeNull();
    expect(await validarImagen(Buffer.from('{"foto":"si"}'))).toBeNull();
    expect(await validarImagen(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(await validarImagen(Buffer.alloc(0))).toBeNull();
  });

  it('rechaza un JPEG real que se pasa del tope de tamaño', async () => {
    const gorda = Buffer.concat([await fotoFalsa(64, 64), Buffer.alloc(MAX_BYTES_SUBIDA)]);
    expect(await validarImagen(gorda)).toBeNull();
  });
});

describe('procesarImagen', () => {
  it('baja una foto de móvil a 800px de lado y a un peso razonable', async () => {
    const original = await fotoFalsa(3000, 4000);
    const salida = await procesarImagen(original);
    const meta = await sharp(salida).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(LADO_FOTO);
    expect(meta.format).toBe('jpeg');
    expect(salida.length).toBeLessThan(original.length);
    expect(salida.length).toBeLessThan(500 * 1024);
  });

  it('respeta la proporción — no deforma la cara', async () => {
    const meta = await sharp(await procesarImagen(await fotoFalsa(4000, 3000))).metadata();
    expect(meta.width).toBe(LADO_FOTO);
    expect(meta.height).toBe(600); // 800 * 3000/4000
  });

  it('no agranda una foto que ya era pequeña', async () => {
    const meta = await sharp(await procesarImagen(await fotoFalsa(200, 150))).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it('la miniatura sale mucho más liviana que la grande', async () => {
    const original = await fotoFalsa(2000, 2000);
    const grande = await procesarImagen(original, { lado: LADO_FOTO });
    const mini = await procesarImagen(original, { lado: LADO_MINIATURA, calidad: 75 });
    expect((await sharp(mini).metadata()).width).toBe(LADO_MINIATURA);
    expect(mini.length).toBeLessThan(grande.length);
  });

  it('convierte a JPEG lo que llegue en otro formato', async () => {
    const meta = await sharp(await procesarImagen(await fotoFalsa(900, 900, 'png'))).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('no arrastra el EXIF del original (ni el GPS de dónde se tomó)', async () => {
    const conExif = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 1, g: 2, b: 3 } },
    }).withExif({ IFD0: { Copyright: 'colegio', Software: 'camara' } }).jpeg().toBuffer();
    expect((await sharp(conExif).metadata()).exif).toBeDefined();
    expect((await sharp(await procesarImagen(conExif)).metadata()).exif).toBeUndefined();
  });
});

describe('claveFoto', () => {
  it('separa por empresa y entidad, y no es adivinable', () => {
    const a = claveFoto(9, 'estudiante', 12);
    const b = claveFoto(9, 'estudiante', 12);
    expect(a).toMatch(/^9\/estudiante\/12-[0-9a-f]{12}$/);
    // Misma entidad, clave distinta: reemplazar una foto no pisa el objeto
    // anterior mientras alguien lo descarga con una URL firmada aún viva.
    expect(a).not.toBe(b);
    // Y la empresa va delante: nunca se cruzan los objetos de dos colegios.
    expect(claveFoto(4, 'estudiante', 12).startsWith('4/')).toBe(true);
  });

  it('sirve igual para cualquier entidad futura', () => {
    expect(claveFoto(2, 'producto', 310)).toMatch(/^2\/producto\/310-/);
    expect(claveFoto(2, 'personal', 7)).toMatch(/^2\/personal\/7-/);
  });
});
