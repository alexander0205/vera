import { describe, it, expect } from 'vitest';
import {
  ADDONS, LINEAS_PRODUCTO, TEXTO_BAJO_COTIZACION,
  addonBajoCotizacion, familiaBajoCotizacion, getLinea, getPlanPriceLabel,
  lineaBajoCotizacion, planBajoCotizacion, planesDeFamilia, precioPublicable,
} from '@/lib/config/plans';

/**
 * Qué líneas publican precio y cuáles se cotizan.
 *
 * La regla vive en un solo campo del catálogo —`precioBajoCotizacion`— porque
 * antes vivía repartida: cada pantalla decidía por su cuenta con un
 * `if (esColegio)`, y basta con que una no se entere para que siga publicando
 * la cifra que las otras acaban de retirar. Estas pruebas fijan el campo y los
 * helpers que lo leen; lo que no pueden fijar es que una pantalla nueva se
 * salte los helpers y escriba `plan.price` a mano.
 *
 * Lo que sí protegen de verdad es la asimetría: las dos líneas de facturación
 * NO llevan cifra y la de colegio SÍ. Igualarlas por descuido —en cualquiera de
 * los dos sentidos— es el fallo que esto caza.
 */

const LINEAS_SIN_PRECIO = ['erp', 'pos-erp'] as const;
const LINEA_CON_PRECIO = 'erp-colegio';

describe('las líneas de facturación no exponen precio', () => {
  it('«Zero ERP» y «Zero POS + ERP» están marcadas bajo cotización', () => {
    for (const key of LINEAS_SIN_PRECIO) {
      const linea = getLinea(key);
      expect(linea, `la línea ${key} tiene que existir en el catálogo`).not.toBeNull();
      expect(linea!.precioBajoCotizacion).toBe(true);
      expect(lineaBajoCotizacion(key)).toBe(true);
    }
  });

  it('ninguno de sus planes devuelve una cifra publicable', () => {
    for (const key of LINEAS_SIN_PRECIO) {
      const linea = getLinea(key)!;
      const planes = planesDeFamilia(linea.familia);
      // Si esto se queda vacío la prueba no prueba nada: pasaría sola.
      expect(planes.length).toBeGreaterThan(0);

      for (const plan of planes) {
        // `null` y no 0 ni cadena vacía: es lo que permite que el servidor NO
        // le mande la cifra al navegador. Un precio «escondido» con CSS sigue
        // estando en el HTML de una página pública para quien mire el fuente.
        expect(precioPublicable(key, plan.key)).toBeNull();
        expect(planBajoCotizacion(plan.key)).toBe(true);
        expect(getPlanPriceLabel(plan.key)).toBe(TEXTO_BAJO_COTIZACION);
      }
    }
  });

  it('la familia entera se cotiza: las dos líneas la comparten', () => {
    // `familiaBajoCotizacion` es la pregunta de las pantallas que trabajan por
    // familia y no saben desde qué línea se está mirando (la comparativa de
    // /dashboard/suscripcion). Mientras UNA de las dos líneas de `ecf`
    // publicara cifra, el precio del plan estaría publicado igual y esconderlo
    // en la otra no lo retiraría de ningún sitio.
    expect(familiaBajoCotizacion('ecf')).toBe(true);
  });
});

describe('los tramos de colegio conservan su precio', () => {
  it('la línea de colegio NO está bajo cotización', () => {
    expect(getLinea(LINEA_CON_PRECIO)!.precioBajoCotizacion).toBe(false);
    expect(lineaBajoCotizacion(LINEA_CON_PRECIO)).toBe(false);
    expect(familiaBajoCotizacion('colegio')).toBe(false);
  });

  it('sus cuatro tramos devuelven la cifra del catálogo', () => {
    const tramos = planesDeFamilia('colegio');
    expect(tramos.length).toBeGreaterThan(0);

    for (const plan of tramos) {
      const publicable = precioPublicable(LINEA_CON_PRECIO, plan.key);
      expect(publicable).not.toBeNull();
      // Es el MISMO número del catálogo, no uno redondeado ni recalculado: la
      // línea de colegio no lleva adicionales sueltos (el POS le viene dentro),
      // así que el precio publicable es el del plan tal cual.
      expect(publicable).toBe(plan.price);
      expect(publicable).toBeGreaterThan(0);
      expect(planBajoCotizacion(plan.key)).toBe(false);
    }
  });

  it('la etiqueta de precio sigue diciendo la cifra, no «bajo cotización»', () => {
    for (const plan of planesDeFamilia('colegio')) {
      expect(getPlanPriceLabel(plan.key)).toContain(String(plan.price));
    }
  });
});

describe('el adicional del Punto de Venta sigue a la familia sobre la que se ofrece', () => {
  it('sobre e-CF se cotiza: es donde se vende suelto', () => {
    // Publicarlo ahí devolvería por la puerta de atrás lo que las tarjetas
    // acaban de retirar: con el precio del adicional a la vista, el del
    // combinado «Zero POS + ERP» sale por resta en cuanto alguien publique el
    // otro.
    expect(addonBajoCotizacion('pos', 'ecf')).toBe(true);
  });

  it('sobre colegio no aplica: ahí viene incluido y no se cobra aparte', () => {
    // No es «se publica», es «no hay cifra que publicar»: cobrarlo dos veces
    // sería el error obvio, y por eso `incluidoEn` manda sobre la cotización.
    const pos = ADDONS.find(a => a.key === 'pos')!;
    expect(pos.incluidoEn).toContain('colegio');
    expect(addonBajoCotizacion('pos', 'colegio')).toBe(false);
  });

  it('un adicional que no existe no inventa una respuesta', () => {
    expect(addonBajoCotizacion('inexistente', 'ecf')).toBe(false);
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
});
