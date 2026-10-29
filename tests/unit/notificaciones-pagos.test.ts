import { describe, it, expect } from 'vitest';
import {
  PERMISOS_POR_TIPO, esNoLeida, esTipo, tiposVisibles, umbralNoLeidas, veTipo,
  VENTANA_NO_LEIDAS_DIAS,
} from '@/lib/notificaciones/tipos';
import {
  cuandoLlego, enlaceDeComprobante, enlaceDePagoEnLinea, montoCorto, nombresDeHijos,
  notificacionDeComprobante, notificacionDePagoEnLinea, payloadPush,
  type DatosPagoEnLinea,
} from '@/lib/notificaciones/texto';
import { base64UrlABytes } from '@/lib/notificaciones/base64';
import { ROLES, type Permission } from '@/lib/config/roles';

/**
 * La campana de pagos: lo que dice cada aviso, a dónde lleva, quién lo recibe y
 * cuándo cuenta como «no leído». Todo puro: la inserción y el push los prueba
 * quien tenga una rama de Neon a mano, no esta suite.
 */

const permisosDe = (rol: string): Permission[] => ROLES.find((r) => r.key === rol)?.permissions ?? [];

describe('el comprobante que sube una familia', () => {
  const base = { id: 12, montoCentavos: 400_000, responsable: 'Pérez', estudiantes: ['Juan'], referencia: null };

  it('el título lleva el monto en pesos, sin centavos si son redondos', () => {
    expect(notificacionDeComprobante(base).titulo).toBe('Comprobante de pago · RD$4,000');
    expect(notificacionDeComprobante({ ...base, montoCentavos: 400_050 }).titulo).toBe('Comprobante de pago · RD$4,000.50');
  });

  it('el detalle dice de qué familia y de qué hijo', () => {
    expect(notificacionDeComprobante(base).detalle).toBe('Familia Pérez · Juan');
  });

  it('con varios hijos recorta a dos y cuenta el resto', () => {
    expect(nombresDeHijos(['Ana', 'Luis'])).toBe('Ana, Luis');
    expect(nombresDeHijos(['Ana', 'Luis', 'Marta', 'Pedro'])).toBe('Ana, Luis +2');
  });

  it('sin nombre de responsable no inventa uno', () => {
    expect(notificacionDeComprobante({ ...base, responsable: null, estudiantes: [] }).detalle).toBe('Una familia');
  });

  it('la referencia, si la hay, sale para buscarlo en el banco', () => {
    expect(notificacionDeComprobante({ ...base, referencia: 'TRF-889' }).detalle).toBe('Familia Pérez · Juan · ref. TRF-889');
  });

  it('lleva a la cola de comprobantes con ese comprobante resaltado', () => {
    const n = notificacionDeComprobante(base);
    expect(n.enlace).toBe('/escolar/pagos?tab=comprobantes&comprobante=12');
    expect(n.enlace).toBe(enlaceDeComprobante(12));
  });

  it('la llave contra repetidos es el id del comprobante', () => {
    const n = notificacionDeComprobante(base);
    expect(n.tipo).toBe('comprobante');
    expect(n.refId).toBe(12);
    expect(n.montoCentavos).toBe(400_000);
  });
});

describe('el pago con tarjeta', () => {
  const base: DatosPagoEnLinea = {
    linkId: 7, montoCentavos: 250_000, cliente: 'María Gómez', documento: 'FA-2026-000629',
    ecfDocumentId: 629, cotizacionId: null, referencia: '123456', proveedor: 'cardnet', escolar: false,
  };

  it('dice de quién es la factura y la autorización', () => {
    const n = notificacionDePagoEnLinea(base);
    expect(n.titulo).toBe('Pago con tarjeta · RD$2,500');
    expect(n.detalle).toBe('María Gómez · FA-2026-000629 · aut. 123456');
  });

  it('una factura que no es del colegio lleva a su ficha en Facturación', () => {
    expect(enlaceDePagoEnLinea(base)).toBe('/dashboard/facturas/629');
  });

  it('un cargo escolar lleva a Pagos del colegio buscando por la autorización', () => {
    expect(enlaceDePagoEnLinea({ ...base, escolar: true })).toBe('/escolar/pagos?buscar=123456');
  });

  it('el personal del colegio no es mandado a Facturación, donde no entra', () => {
    expect(notificacionDePagoEnLinea({ ...base, escolar: true }).enlace).not.toContain('/dashboard');
  });

  it('sin autorización el enlace escolar no lleva búsqueda vacía', () => {
    expect(enlaceDePagoEnLinea({ ...base, escolar: true, referencia: null })).toBe('/escolar/pagos');
  });

  it('la autorización se escapa en la dirección', () => {
    expect(enlaceDePagoEnLinea({ ...base, escolar: true, referencia: 'A B&C' })).toBe('/escolar/pagos?buscar=A%20B%26C');
  });

  it('una cotización pagada lleva a la cotización', () => {
    expect(enlaceDePagoEnLinea({ ...base, ecfDocumentId: null, cotizacionId: 31 })).toBe('/dashboard/cotizaciones/31');
  });

  it('la llave contra repetidos es el enlace de pago, así un callback repetido no avisa dos veces', () => {
    expect(notificacionDePagoEnLinea(base).refId).toBe(7);
    expect(notificacionDePagoEnLinea(base).tipo).toBe('pago_en_linea');
  });
});

describe('el aviso push', () => {
  const n = notificacionDeComprobante({
    id: 12, montoCentavos: 400_000, responsable: 'Pérez', estudiantes: ['Juan'], referencia: null,
  });

  it('lleva título, detalle con el nombre del colegio y la ruta', () => {
    expect(payloadPush(n, 'Colegio Demo')).toEqual({
      title: 'Comprobante de pago · RD$4,000',
      body: 'Colegio Demo · Familia Pérez · Juan',
      url: '/escolar/pagos?tab=comprobantes&comprobante=12',
      tag: 'pago-comprobante-12',
    });
  });

  it('sin nombre de empresa el cuerpo es solo el detalle', () => {
    expect(payloadPush(n, null).body).toBe('Familia Pérez · Juan');
  });

  it('la ruta es relativa: el service worker la abre en su propio origen', () => {
    expect(payloadPush(n, 'X').url.startsWith('/')).toBe(true);
    expect(payloadPush(n, 'X').url).not.toMatch(/^https?:/);
  });

  it('el mismo pago avisado dos veces comparte etiqueta y se reemplaza', () => {
    expect(payloadPush(n, 'X').tag).toBe(payloadPush(n, 'Y').tag);
  });
});

describe('quién recibe cada tipo', () => {
  it('el comprobante es de quien puede aprobarlo: dueño, admin y personal del colegio', () => {
    expect(veTipo(permisosDe('owner'), 'comprobante')).toBe(true);
    expect(veTipo(permisosDe('admin'), 'comprobante')).toBe(true);
    expect(veTipo(permisosDe('personal-escolar'), 'comprobante')).toBe(true);
  });

  it('el vendedor, el cajero y el auditor no reciben comprobantes', () => {
    for (const rol of ['user', 'cajero', 'lector']) {
      expect(veTipo(permisosDe(rol), 'comprobante')).toBe(false);
    }
  });

  it('el pago con tarjeta le llega al dueño, al admin y al personal del colegio', () => {
    for (const rol of ['owner', 'admin', 'personal-escolar']) {
      expect(veTipo(permisosDe(rol), 'pago_en_linea')).toBe(true);
    }
  });

  it('el cajero del POS no recibe nada y la campana no le sirve', () => {
    expect(tiposVisibles(permisosDe('cajero'))).toEqual([]);
  });

  it('el personal del colegio ve los dos tipos', () => {
    expect(tiposVisibles(permisosDe('personal-escolar'))).toEqual(['comprobante', 'pago_en_linea']);
  });

  it('todo tipo exige al menos un permiso: nadie lo ve «por defecto»', () => {
    for (const permisos of Object.values(PERMISOS_POR_TIPO)) expect(permisos.length).toBeGreaterThan(0);
  });

  it('reconoce solo los tipos que existen', () => {
    expect(esTipo('comprobante')).toBe(true);
    expect(esTipo('pago_en_linea')).toBe(true);
    expect(esTipo('otro')).toBe(false);
    expect(esTipo(undefined)).toBe(false);
  });
});

describe('cuándo es «no leída»', () => {
  const ahora = new Date('2026-10-29T15:00:00Z');
  const hace = (horas: number) => new Date(ahora.getTime() - horas * 3_600_000);

  it('es la creada DESPUÉS de la última vez que miró', () => {
    expect(esNoLeida(hace(1), hace(2), ahora)).toBe(true);
    expect(esNoLeida(hace(3), hace(2), ahora)).toBe(false);
  });

  it('la creada en el mismo instante en que miró ya está vista', () => {
    expect(esNoLeida(hace(2), hace(2), ahora)).toBe(false);
  });

  it('sin marca cuenta la de los últimos 14 días, no todas las de siempre', () => {
    expect(esNoLeida(hace(24 * 13), null, ahora)).toBe(true);
    expect(esNoLeida(hace(24 * 15), null, ahora)).toBe(false);
    expect(VENTANA_NO_LEIDAS_DIAS).toBe(14);
  });

  it('una marca muy vieja no resucita avisos de hace un mes', () => {
    const marcaVieja = hace(24 * 60);
    expect(esNoLeida(hace(24 * 30), marcaVieja, ahora)).toBe(false);
    expect(umbralNoLeidas(marcaVieja, ahora).getTime()).toBe(hace(24 * 14).getTime());
  });

  it('la marca reciente manda sobre la ventana', () => {
    expect(umbralNoLeidas(hace(1), ahora).getTime()).toBe(hace(1).getTime());
  });
});

describe('la hora en la campana', () => {
  // 2026-10-29 13:40 UTC = 9:40 a. m. en Santo Domingo (UTC-4, sin horario de verano).
  const ahora = new Date('2026-10-29T16:00:00Z');

  it('lo de hoy dice «hoy» y la hora de Santo Domingo', () => {
    expect(cuandoLlego('2026-10-29T13:40:00Z', ahora)).toMatch(/^hoy 9:40/);
  });

  it('lo de ayer dice «ayer»', () => {
    expect(cuandoLlego('2026-10-28T20:15:00Z', ahora)).toMatch(/^ayer 4:15/);
  });

  it('lo de antes dice el día y el mes', () => {
    expect(cuandoLlego('2026-10-20T20:15:00Z', ahora)).toMatch(/20/);
  });

  it('pasada la medianoche UTC sigue siendo «hoy» en Santo Domingo', () => {
    // 01:00 UTC del 30 = 9:00 p. m. del 29 en Santo Domingo.
    expect(cuandoLlego('2026-10-30T01:00:00Z', new Date('2026-10-30T02:00:00Z'))).toMatch(/^hoy /);
  });
});

describe('montoCorto', () => {
  it('quita los centavos solo cuando son cero', () => {
    expect(montoCorto(100_000)).toBe('RD$1,000');
    expect(montoCorto(100_005)).toBe('RD$1,000.05');
    expect(montoCorto(0)).toBe('RD$0');
  });
});

describe('la llave VAPID en bytes', () => {
  it('convierte base64 url-safe a bytes, con o sin relleno', () => {
    // "hola" = aG9sYQ==  ·  con caracteres url-safe: 0xfb 0xff = "-_8"
    expect(Array.from(base64UrlABytes('aG9sYQ'))).toEqual([104, 111, 108, 97]);
    expect(Array.from(base64UrlABytes('aG9sYQ=='))).toEqual([104, 111, 108, 97]);
    expect(Array.from(base64UrlABytes('-_8'))).toEqual([0xfb, 0xff]);
  });

  it('una llave VAPID pública de 65 bytes mide 87 caracteres base64 url-safe', () => {
    const llave = 'B'.repeat(86) + 'A';
    expect(base64UrlABytes(llave).length).toBe(65);
  });
});
