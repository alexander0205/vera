import { describe, expect, it } from 'vitest';
import {
  destinoValido,
  leerDestinoDeEntrada,
  rutaInterna,
  rutaTrasEntrar,
} from '@/lib/auth/destino';

/** Todo lo que un navegador leería como «otro sitio». */
const FUERA = [
  'https://ejemplo.invalid',
  'http://ejemplo.invalid/dashboard',
  'HTTPS://ejemplo.invalid',
  '//ejemplo.invalid',
  '///ejemplo.invalid',
  '/\\ejemplo.invalid',
  '\\\\ejemplo.invalid',
  '\\/ejemplo.invalid',
  '/\t/ejemplo.invalid',
  '/\n/ejemplo.invalid',
  '/\r\n/ejemplo.invalid',
  '\t//ejemplo.invalid',
  ' //ejemplo.invalid',
  ' https://ejemplo.invalid',
  'javascript:alert(1)',
  'data:text/html,hola',
  'ejemplo.invalid',
  'dashboard',
  '/..//ejemplo.invalid',
  '/.//ejemplo.invalid',
];

describe('rutaInterna', () => {
  it('acepta las rutas de la aplicación, con su query', () => {
    for (const ruta of ['/', '/dashboard', '/dashboard/soporte', '/escolar/matriculas?periodo=3&page=2', '/pos#mesas']) {
      expect(rutaInterna(ruta)).toBe(ruta);
    }
  });

  it('nada que saque de la aplicación', () => {
    for (const ruta of FUERA) {
      expect(rutaInterna(ruta), JSON.stringify(ruta)).toBeNull();
    }
  });

  it('lo que no es texto no vale', () => {
    for (const crudo of [undefined, null, '', 12, true, {}, ['/dashboard']]) {
      expect(rutaInterna(crudo)).toBeNull();
    }
  });

  it('devuelve la ruta resuelta, que es la que validó', () => {
    expect(rutaInterna('/a/../dashboard')).toBe('/dashboard');
    expect(rutaInterna('/dash\tboard')).toBe('/dashboard');
  });

  it('lo que devuelve, resuelto contra el dominio real, no cambia de sitio', () => {
    for (const ruta of ['/dashboard', '/a/../b', '/%2F%2Fejemplo.invalid', '/%5Cejemplo.invalid', '/@ejemplo.invalid']) {
      const resuelta = rutaInterna(ruta);
      expect(resuelta).not.toBeNull();
      expect(new URL(resuelta!, 'https://app.zero.com.do').host).toBe('app.zero.com.do');
    }
  });
});

describe('destinoValido: lo que se guarda para la vuelta', () => {
  it('conserva «checkout» y las rutas internas', () => {
    expect(destinoValido('checkout')).toBe('checkout');
    expect(destinoValido('/dashboard/soporte')).toBe('/dashboard/soporte');
  });

  it('descarta lo demás', () => {
    for (const crudo of [...FUERA, null, undefined, '', 'Checkout', 'checkout/']) {
      expect(destinoValido(crudo), JSON.stringify(crudo)).toBeUndefined();
    }
  });
});

describe('rutaTrasEntrar: a dónde se redirige', () => {
  it('una ruta interna se respeta', () => {
    expect(rutaTrasEntrar('/dashboard/soporte')).toBe('/dashboard/soporte');
  });

  it('«checkout» no es una ruta: va al panel, como siempre', () => {
    expect(rutaTrasEntrar('checkout')).toBe('/dashboard');
  });

  it('sin destino, o con uno de fuera, va al panel', () => {
    for (const crudo of [...FUERA, null, undefined, '']) {
      expect(rutaTrasEntrar(crudo), JSON.stringify(crudo)).toBe('/dashboard');
    }
  });
});

describe('leerDestinoDeEntrada: la cookie no va firmada', () => {
  it('lee los cuatro campos que se guardaron', () => {
    const cookie = JSON.stringify({ redirect: 'checkout', priceId: 'price_1', inviteId: '7', inviteToken: 'abc' });
    expect(leerDestinoDeEntrada(cookie)).toEqual({ redirect: 'checkout', priceId: 'price_1', inviteId: '7', inviteToken: 'abc' });
  });

  it('no deja colar campos del perfil de Google', () => {
    const leido = leerDestinoDeEntrada(JSON.stringify({ email: 'ajeno@ejemplo.invalid', googleId: 'x', nombre: 'x', inviteId: '7' }));
    expect(leido).not.toHaveProperty('email');
    expect(leido).not.toHaveProperty('googleId');
    expect(leido).not.toHaveProperty('nombre');
    expect(leido.inviteId).toBe('7');
  });

  it('una cookie reescrita a mano tampoco trae un destino de fuera', () => {
    expect(leerDestinoDeEntrada(JSON.stringify({ redirect: 'https://ejemplo.invalid' })).redirect).toBeUndefined();
  });

  it('solo texto: `parseInt` y las consultas cuentan con eso', () => {
    const leido = leerDestinoDeEntrada(JSON.stringify({ inviteId: { x: 1 }, inviteToken: ['a'], priceId: 3 }));
    expect(leido).toEqual({ redirect: undefined, priceId: undefined, inviteId: undefined, inviteToken: undefined });
  });

  it('rota, vacía o sin forma de objeto se entra sin destino', () => {
    for (const cookie of [undefined, '', '{', 'null', '3', '"texto"']) {
      expect(leerDestinoDeEntrada(cookie).redirect).toBeUndefined();
    }
  });
});
