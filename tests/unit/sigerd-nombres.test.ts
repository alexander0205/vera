import { describe, it, expect } from 'vitest';
import { partirNombre } from '@/lib/sigerd/nombres';

/**
 * Los casos salen de nombres reales del listado de Andrés Bello. No se prueba
 * que la regla sea infalible —no lo es—, sino que acierta en la forma corriente
 * y que avisa cuando no puede estar segura.
 */
describe('partirNombre', () => {
  it('dos nombres y dos apellidos, que es lo corriente', () => {
    expect(partirNombre('AYLA PAMELA REYNOSO SANCHEZ'))
      .toEqual({ nombres: 'AYLA PAMELA', apellidos: 'REYNOSO SANCHEZ', dudoso: false });
  });

  it('un nombre y dos apellidos', () => {
    expect(partirNombre('WILHEN PINEDA ALCANTARA'))
      .toEqual({ nombres: 'WILHEN', apellidos: 'PINEDA ALCANTARA', dudoso: false });
  });

  it('dos palabras: una y una', () => {
    expect(partirNombre('ALINA LEDESMA'))
      .toEqual({ nombres: 'ALINA', apellidos: 'LEDESMA', dudoso: false });
  });

  it('el apellido con partícula no se parte por la mitad', () => {
    // Sin arrastrar hacia atrás, "DE LA" se quedaría en los nombres.
    expect(partirNombre('MARIA ALTAGRACIA DE LA CRUZ PEREZ'))
      .toEqual({ nombres: 'MARIA ALTAGRACIA', apellidos: 'DE LA CRUZ PEREZ', dudoso: false });
    expect(partirNombre('JOSE DEL ROSARIO SANTOS'))
      .toEqual({ nombres: 'JOSE', apellidos: 'DEL ROSARIO SANTOS', dudoso: false });
  });

  it('una sola palabra se marca: no hay forma de saber qué es', () => {
    const r = partirNombre('LEDESMA');
    expect(r.nombres).toBe('LEDESMA');
    expect(r.apellidos).toBe('');
    expect(r.dudoso).toBe(true);
  });

  it('demasiadas piezas se marcan para revisar', () => {
    expect(partirNombre('ANA MARIA DE LOS SANTOS PEREZ GARCIA MARTE').dudoso).toBe(true);
  });

  it('los espacios de más no cuentan', () => {
    // El portal deja nombres con espacios finales: "ALINA ALEXANDRA LEDESMA ".
    expect(partirNombre('  ALINA   ALEXANDRA  LEDESMA  '))
      .toEqual({ nombres: 'ALINA', apellidos: 'ALEXANDRA LEDESMA', dudoso: false });
  });

  it('vacío no revienta', () => {
    expect(partirNombre('   ').dudoso).toBe(true);
  });
});
