import { describe, it, expect } from 'vitest';
import { partirApellidos, partirNombre, separarPegadas } from '@/lib/sigerd/nombres';

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

/**
 * El camino de vuelta: de nuestro campo «apellidos» a los dos que pide el
 * buscador del portal. Aquí los apellidos son inventados; lo que se prueba es
 * la forma, sobre todo que la partícula se quede con SU apellido.
 */
describe('partirApellidos', () => {
  it('dos apellidos: uno y uno', () => {
    expect(partirApellidos('INVENTADO FICTICIO'))
      .toEqual({ primero: 'INVENTADO', segundo: 'FICTICIO', dudoso: false });
  });

  it('uno solo deja el segundo vacío', () => {
    expect(partirApellidos('INVENTADO'))
      .toEqual({ primero: 'INVENTADO', segundo: '', dudoso: false });
  });

  it('la partícula va con el apellido que introduce', () => {
    // Cortando por el primer espacio, el primero sería "DE".
    expect(partirApellidos('DE LA NADA INVENTADO'))
      .toEqual({ primero: 'DE LA NADA', segundo: 'INVENTADO', dudoso: false });
    expect(partirApellidos('INVENTADO DEL EJEMPLO'))
      .toEqual({ primero: 'INVENTADO', segundo: 'DEL EJEMPLO', dudoso: false });
    expect(partirApellidos('DEL EJEMPLO DE LOS INVENTOS'))
      .toEqual({ primero: 'DEL EJEMPLO', segundo: 'DE LOS INVENTOS', dudoso: false });
  });

  it('un compuesto solo es UN apellido, no dos', () => {
    expect(partirApellidos('DE LA NADA'))
      .toEqual({ primero: 'DE LA NADA', segundo: '', dudoso: false });
  });

  it('las partículas se reconocen también en minúsculas', () => {
    expect(partirApellidos('de la Nada Inventado'))
      .toEqual({ primero: 'de la Nada', segundo: 'Inventado', dudoso: false });
  });

  it('con tres o más avisa: no se sabe dónde acaba el primero', () => {
    expect(partirApellidos('INVENTADO FICTICIO IMAGINARIO'))
      .toEqual({ primero: 'INVENTADO', segundo: 'FICTICIO IMAGINARIO', dudoso: true });
  });

  it('una partícula colgando al final no cuenta como otro apellido', () => {
    expect(partirApellidos('INVENTADO DE'))
      .toEqual({ primero: 'INVENTADO DE', segundo: '', dudoso: false });
  });

  it('los espacios de más no cuentan, y vacío no revienta', () => {
    expect(partirApellidos('  INVENTADO    FICTICIO '))
      .toEqual({ primero: 'INVENTADO', segundo: 'FICTICIO', dudoso: false });
    expect(partirApellidos('   ')).toEqual({ primero: '', segundo: '', dudoso: false });
  });
});

describe('separarPegadas', () => {
  it('separa las palabras que el PDF de SIGERD dejó juntas', () => {
    expect(separarPegadas('Rosa MaríaPeñaPaniagua')).toBe('Rosa María Peña Paniagua');
    expect(separarPegadas('JuanPérez')).toBe('Juan Pérez');
  });
  it('deja como viene lo que ya está bien, y lo que va todo en mayúsculas', () => {
    expect(separarPegadas('Rosa María Peña Paniagua')).toBe('Rosa María Peña Paniagua');
    expect(separarPegadas('ROSA MARIAPEÑA')).toBe('ROSA MARIAPEÑA');
  });
});
