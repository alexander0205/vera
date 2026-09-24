import { describe, it, expect } from 'vitest';
import {
  ADDONS, LINEAS_PRODUCTO, PLANS, PRODUCTOS_APARTE, TEXTO_BAJO_COTIZACION,
  addonBajoCotizacion, familiaBajoCotizacion, getLinea, getPlanPriceLabel,
  getProductoAparte, lineaBajoCotizacion, planBajoCotizacion, planesDeFamilia,
  planesDeLinea, precioPublicable, precioTotal,
} from '@/lib/config/plans';
import { MODULES } from '@/lib/config/modules';

/**
 * Qué publica precio y qué se cotiza.
 *
 * La regla vive en un solo campo del catálogo —`precioBajoCotizacion`— porque
 * antes vivía repartida: cada pantalla decidía por su cuenta con un
 * `if (esColegio)`, y basta con que una no se entere para que publique la cifra
 * que las otras acaban de retirar, o al revés. Estas pruebas fijan el campo y
 * los helpers que lo leen; lo que no pueden fijar es que una pantalla nueva se
 * salte los helpers y escriba `plan.price` a mano.
 *
 * Hoy fijan que las TRES líneas publican su cifra, y que el CRM —que se vende
 * aparte— es lo único que se cotiza. Antes fijaban lo contrario: que ninguna
 * línea publicaba. El fallo que esto caza es que una línea se calle sin que
 * nadie lo haya decidido, y que el precio del colegio vuelva a taparse en una
 * pantalla sola.
 */

const LINEAS_CON_PRECIO = ['erp', 'pos-erp', 'erp-colegio'] as const;

describe('las tres líneas publican su precio', () => {
  it('ninguna está marcada bajo cotización', () => {
    for (const key of LINEAS_CON_PRECIO) {
      const linea = getLinea(key);
      expect(linea, `la línea ${key} tiene que existir en el catálogo`).not.toBeNull();
      expect(linea!.precioBajoCotizacion).toBe(false);
      expect(lineaBajoCotizacion(key)).toBe(false);
    }
  });

  it('cada plan de cada línea devuelve una cifra, no un null', () => {
    for (const key of LINEAS_CON_PRECIO) {
      const linea = getLinea(key)!;
      const planes = planesDeFamilia(linea.familia);
      // Si esto se queda vacío la prueba no prueba nada: pasaría sola.
      expect(planes.length).toBeGreaterThan(0);

      for (const plan of planes) {
        const publicable = precioPublicable(key, plan.key);
        expect(publicable, `${key} · ${plan.key}`).not.toBeNull();
        expect(publicable!).toBeGreaterThan(0);
        expect(planBajoCotizacion(plan.key)).toBe(false);
        expect(getPlanPriceLabel(plan.key)).toBe(`$${plan.price} USD/mes`);
      }
    }
  });

  it('las dos familias publican, así que las pantallas que trabajan por familia también', () => {
    // `familiaBajoCotizacion` es la pregunta de las pantallas que no saben desde
    // qué línea se está mirando (la comparativa de /dashboard/suscripcion).
    expect(familiaBajoCotizacion('ecf')).toBe(false);
    expect(familiaBajoCotizacion('colegio')).toBe(false);
  });

  it('«Zero POS + ERP» cuesta su plan más el adicional del POS', () => {
    // Es la misma familia `ecf` con el POS sumado. Si esta suma se rompe, la
    // línea combinada publica el precio de la de abajo y el adicional sale
    // gratis en la portada.
    const pos = ADDONS.find(a => a.key === 'pos')!;
    for (const { plan, precio } of planesDeLinea('pos-erp')) {
      expect(precio).toBe(plan.price + pos.price);
      expect(precioPublicable('pos-erp', plan.key)).toBe(plan.price + pos.price);
      // Y la línea pelada no lo suma.
      expect(precioPublicable('erp', plan.key)).toBe(plan.price);
    }
    expect(precioTotal('negocio', ['pos'])).toBe(19 + pos.price);
  });
});

describe('los tramos de colegio publican sus cuatro cifras', () => {
  it('son 135, 237, 350 y 500, que es lo que Stripe cobra', () => {
    // Escritas a propósito: el catálogo es lo que se cobra, y un cambio de
    // precio tiene que ser una decisión, no un efecto de otro cambio.
    const tramos = planesDeFamilia('colegio');
    expect(tramos.map(p => p.price)).toEqual([135, 237, 350, 500]);
    for (const plan of tramos) {
      expect(precioPublicable('erp-colegio', plan.key)).toBe(plan.price);
    }
  });

  it('la etiqueta enseña la cifra en vez del texto de cotización', () => {
    for (const plan of planesDeFamilia('colegio')) {
      const etiqueta = getPlanPriceLabel(plan.key);
      expect(etiqueta).not.toBe(TEXTO_BAJO_COTIZACION);
      expect(etiqueta).toContain(String(plan.price));
    }
  });

  it('cada tramo sigue teniendo su tope de estudiantes, que es por lo que se cobra', () => {
    for (const plan of planesDeFamilia('colegio')) {
      expect(plan.limits.estudiantes, `el tramo ${plan.key}`).toBeGreaterThan(0);
    }
  });
});

describe('los adicionales publican su cifra sobre la familia que los vende', () => {
  it('el Punto de Venta no se cotiza sobre e-CF: es donde se vende suelto', () => {
    expect(addonBajoCotizacion('pos', 'ecf')).toBe(false);
  });

  it('sobre colegio no aplica: ahí viene incluido y no se cobra aparte', () => {
    // No es «se publica», es «no hay cifra que publicar»: cobrarlo dos veces
    // sería el error obvio, y por eso `incluidoEn` manda sobre la cotización.
    const pos = ADDONS.find(a => a.key === 'pos')!;
    expect(pos.incluidoEn).toContain('colegio');
    expect(addonBajoCotizacion('pos', 'colegio')).toBe(false);
  });

  it('la Nómina publica su cifra sobre e-CF, que es donde se vende suelta', () => {
    expect(addonBajoCotizacion('nomina', 'ecf')).toBe(false);
  });

  it('en colegio la Nómina viene dentro: no se cobra ni se cotiza', () => {
    const nomina = ADDONS.find(a => a.key === 'nomina')!;
    expect(nomina.incluidoEn).toContain('colegio');
    expect(addonBajoCotizacion('nomina', 'colegio')).toBe(false);
  });

  it('y los cuatro tramos ABREN el módulo, no solo lo prometen', () => {
    // El precio diciendo «incluida» con la compuerta cerrada es la peor de las
    // dos mitades: el colegio paga por un módulo al que no puede entrar. Los
    // `modulos` del plan son lo que de verdad enciende `modulosDelPlan`.
    for (const plan of planesDeFamilia('colegio')) {
      expect(plan.modulos, `el tramo ${plan.key}`).toContain('nomina');
    }
  });

  it('un adicional que no existe no inventa una respuesta', () => {
    expect(addonBajoCotizacion('inexistente', 'ecf')).toBe(false);
  });
});

describe('el CRM se vende aparte y es lo único que se cotiza', () => {
  it('está en el catálogo de productos aparte, sin cifra', () => {
    const crm = getProductoAparte('crm');
    expect(crm).not.toBeNull();
    expect(crm!.bajoCotizacion).toBe(true);
    // `null` y no 0: un cero se pintaría como «US$0/mes», que es peor que no
    // decir nada.
    expect(crm!.precio).toBeNull();
    expect(crm!.hace.length).toBeGreaterThan(0);
  });

  it('no es un plan, ni un adicional, ni un módulo del sistema', () => {
    // Si se cuela en PLANS entra al checkout de Stripe y a los límites; si se
    // cuela en ADDONS se cobra sobre un plan que no lo incluye; y si su clave
    // fuera un ModuleKey, las compuertas de módulos intentarían encenderlo.
    for (const p of PRODUCTOS_APARTE) {
      expect(PLANS.some(plan => plan.key === p.key)).toBe(false);
      expect(ADDONS.some(addon => addon.key === p.key)).toBe(false);
      expect(MODULES as readonly string[]).not.toContain(p.key);
    }
  });

  it('un producto aparte que no existe devuelve null', () => {
    expect(getProductoAparte('inexistente')).toBeNull();
  });
});

describe('el flag es del catálogo, no de una pantalla', () => {
  it('las tres líneas lo declaran a propósito, ninguna se queda sin él', () => {
    // Un `undefined` aquí se leería como «publica precio» y la línea nueva
    // saldría con su cifra en la portada sin que nadie lo decidiera.
    expect(LINEAS_PRODUCTO.length).toBe(3);
    for (const linea of LINEAS_PRODUCTO) {
      expect(typeof linea.precioBajoCotizacion, `la línea ${linea.key}`).toBe('boolean');
    }
  });

  it('una línea que no existe no publica precio', () => {
    // El lado seguro ante la duda es callar la cifra: enseñar de más un precio
    // no se deshace, y un hueco se arregla con un despliegue.
    expect(precioPublicable('linea-que-no-existe', 'negocio')).toBeNull();
    // …aunque `lineaBajoCotizacion` diga que no: sin línea no hay nada que
    // cotizar tampoco. Son dos preguntas distintas y conviene no confundirlas.
    expect(lineaBajoCotizacion('linea-que-no-existe')).toBe(false);
  });

  it('el plan gratuito no pasa por la cotización: no tiene precio que esconder', () => {
    expect(getPlanPriceLabel('free')).toBe('Gratis');
  });
});
