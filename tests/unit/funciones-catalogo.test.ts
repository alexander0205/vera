/**
 * El catálogo de funciones que Zero publica (`/funciones`, `/funciones.md`).
 *
 * Es lo que lee un asistente cuando le preguntan «¿Zero hace X?». Tres cosas
 * que aquí se amarran, porque son las que hacen daño si se sueltan:
 *
 *  - Los **precios, topes y comprobantes** salen del catálogo del sistema. Si
 *    alguien los escribe a mano en el texto, el día que cambie un plan la
 *    página seguirá anunciando el precio viejo.
 *  - Lo que **no hace** no desaparece: es lo que evita que un asistente prometa
 *    de más.
 *  - Lo que está **apagado en producción** no se anuncia.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MODULOS, filasDePlanes, funcionesMarkdown, preguntasDeFunciones, reglasDeSuscripcion,
  tiposDeComprobante, todoLoQueNoHace,
} from '@/lib/agentes/funciones';
import { textoDeLaPrueba } from '@/lib/agentes/contenido';
import { ADDONS, LINEAS_PRODUCTO, lineaBajoCotizacion, planesDeLinea } from '@/lib/config/plans';
import { TIPOS_ECF } from '@/lib/ecf/types';

const leer = (ruta: string) => readFileSync(path.join(process.cwd(), ruta), 'utf8');
const md = funcionesMarkdown();

describe('la forma del catálogo', () => {
  it('cada módulo tiene nombre, resumen, funciones y dónde viene', () => {
    for (const m of MODULOS) {
      expect(m.nombre.length, m.id).toBeGreaterThan(3);
      expect(m.resumen.length, m.id).toBeGreaterThan(20);
      expect(m.hace.length, m.id).toBeGreaterThanOrEqual(3);
      expect(m.viene.length, m.id).toBeGreaterThan(10);
    }
  });

  it('los identificadores no se repiten: son las anclas de la página', () => {
    const ids = MODULOS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ninguna función se repite dentro de un módulo', () => {
    for (const m of MODULOS) expect(new Set(m.hace).size, m.id).toBe(m.hace.length);
  });

  it('el texto empieza por el título y el resumen', () => {
    const lineas = md.split('\n');
    expect(lineas[0]).toBe('# Todo lo que hace Zero');
    expect(lineas[2].startsWith('> ')).toBe(true);
  });

  it('no deja valores sin resolver', () => {
    expect(md).not.toMatch(/undefined|\[object Object\]|\$\{|NaN/);
  });

  it('trae todos los módulos con todas sus funciones', () => {
    for (const m of MODULOS) {
      expect(md).toContain(`## ${m.nombre}`);
      for (const f of m.hace) expect(md, m.id).toContain(`- ${f}`);
    }
  });
});

describe('precios, topes y comprobantes salen del catálogo del sistema', () => {
  it('hay una fila por cada plan que publica precio', () => {
    const esperadas = LINEAS_PRODUCTO.reduce(
      (n, l) => n + (lineaBajoCotizacion(l.key) ? 1 : planesDeLinea(l.key).length), 0);
    expect(filasDePlanes().length).toBe(esperadas);
  });

  it('cada plan sale con el precio que tiene hoy', () => {
    for (const l of LINEAS_PRODUCTO) {
      if (lineaBajoCotizacion(l.key)) continue;
      for (const { plan, precio } of planesDeLinea(l.key)) {
        expect(md, `${l.nombre} ${plan.name}`).toContain(`| ${l.nombre} | ${plan.name} | US$${precio} al mes |`);
      }
    }
  });

  it('los adicionales salen con su precio', () => {
    for (const a of ADDONS) expect(md).toContain(`- ${a.name}: +US$${a.price} al mes.`);
  });

  it('están todos los comprobantes que el sistema emite, y ninguno más', () => {
    expect(tiposDeComprobante().map(([c]) => c)).toEqual(Object.keys(TIPOS_ECF));
    for (const [codigo, nombre] of Object.entries(TIPOS_ECF)) expect(md).toContain(`| ${codigo} | ${nombre} |`);
  });

  it('la prueba gratis es la de la perilla', () => {
    expect(reglasDeSuscripcion()[0]).toContain(textoDeLaPrueba());
    expect(md).toContain(textoDeLaPrueba());
  });

  it('los precios no están escritos a mano en el catálogo', () => {
    // Un `US$` seguido de cifra dentro del fuente es un precio tecleado. Los
    // que salen en la página vienen de `usd(...)` sobre el catálogo de planes.
    expect(leer('lib/agentes/funciones.ts')).not.toMatch(/US\$\d/);
  });
});

describe('lo que no hace y lo que está apagado', () => {
  it('conserva los límites que el sitio ya declara en llms.txt', () => {
    const no = todoLoQueNoHace().map((x) => x.punto).join(' | ');
    expect(no).toMatch(/sucursales/);
    expect(no).toMatch(/sin conexión/);
    expect(no).toMatch(/lotes con fecha de vencimiento/);
    expect(no).toMatch(/liquidaciones/);
  });

  it('lo que no hace sale junto al final, para la pregunta directa', () => {
    expect(md).toContain('## Qué no hace Zero');
    for (const x of todoLoQueNoHace()) expect(md).toContain(`- ${x.modulo}: ${x.punto}`);
  });

  it('no anuncia el cobro con tarjeta por enlace mientras esté oculto en producción', () => {
    // `NEXT_PUBLIC_PAGOS_ONLINE` no está definida en producción (comprobado el
    // 14-10-2026): el menú, el botón y la opción del padre están escondidos.
    // El día que se encienda, se añade al catálogo y se cambia esta prueba.
    expect(leer('lib/config/pagos-online.ts')).toContain('NEXT_PUBLIC_PAGOS_ONLINE');
    expect(md).not.toMatch(/CardNet|Azul|link de pago con tarjeta/i);
  });

  it('no promete que un agente escribe', () => {
    const p = preguntasDeFunciones().find((x) => x.pregunta.includes('asistente de IA'));
    expect(p?.respuesta).toContain('solo lectura');
    expect(p?.respuesta).toContain('Todavía no puede crear ni cambiar nada');
  });
});

describe('las puertas', () => {
  it('la página declara su gemelo en texto, y está en el mapa y en el pie', () => {
    expect(leer('app/(marketing)/funciones/page.tsx')).toContain("types: { 'text/markdown': RUTA_FUNCIONES_MD }");
    expect(leer('app/sitemap.ts')).toContain("ruta: '/funciones'");
    expect(leer('app/(marketing)/_pie.tsx')).toContain("href: '/funciones'");
  });

  it('las dos páginas usan las mismas piezas de texto', () => {
    for (const pagina of ['app/(marketing)/funciones/page.tsx', 'app/(marketing)/agentes/page.tsx']) {
      expect(leer(pagina)).toContain("from '../_texto'");
    }
  });
});
