import { describe, it, expect } from 'vitest';
import { nombreMeta, pegasDeMeta, cabeEnAviso, VARIABLES_POR_AVISO } from '@/lib/whatsapp/plantillas-colegio';

const ej = (n: number) => Array.from({ length: n }, (_, i) => ({ pos: i + 1, nombre: `v${i + 1}`, tipo: 'texto', ejemplo: 'x' }));

describe('nombreMeta', () => {
  it('normaliza y prefija con el colegio', () => {
    expect(nombreMeta(9, 'Aviso de Mora!')).toBe('c9_aviso_de_mora');
    expect(nombreMeta(9, 'Recordatorio ñandú')).toBe('c9_recordatorio_nandu');
  });
  it('no duplica el prefijo y rechaza vacío', () => {
    expect(nombreMeta(9, 'c9_algo')).toBe('c9_algo');
    expect(nombreMeta(9, '¡¡')).toBe('');
  });
});

describe('pegasDeMeta', () => {
  it('acepta una plantilla válida', () => {
    expect(pegasDeMeta({ cuerpo: 'Hola {{1}}, la cuota de {{2}} vence pronto, gracias.', variables: ej(2) })).toEqual([]);
  });
  it('rechaza variable al inicio o al final', () => {
    expect(pegasDeMeta({ cuerpo: '{{1}} te avisa algo importante hoy', variables: ej(1) }).join()).toMatch(/empezar/);
    expect(pegasDeMeta({ cuerpo: 'Tu cuota importante es de {{1}}', variables: ej(1) }).join()).toMatch(/terminar/);
  });
  it('exige variables consecutivas y ejemplos', () => {
    expect(pegasDeMeta({ cuerpo: 'Hola {{1}}, tu cuota {{3}} vence pronto.', variables: ej(3) }).join()).toMatch(/consecutivas|seguidas/);
    expect(pegasDeMeta({ cuerpo: 'Hola {{1}}, tu cuota vence pronto, gracias.', variables: [{ pos: 1, nombre: 'a', tipo: 'texto', ejemplo: '' }] }).join()).toMatch(/ejemplo/);
  });
});

describe('cabeEnAviso', () => {
  it('exige exactamente las variables del aviso', () => {
    const n = VARIABLES_POR_AVISO['al-emitir'].length;
    const cuerpo = Array.from({ length: n }, (_, i) => `a {{${i + 1}}} b`).join(' ');
    expect(cabeEnAviso(cuerpo, 'al-emitir').ok).toBe(true);
    expect(cabeEnAviso('solo {{1}} aquí', 'al-emitir').ok).toBe(false);
  });
});
