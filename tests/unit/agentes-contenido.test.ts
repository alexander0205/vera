/**
 * Lo que Zero le publica a un agente de IA tiene que ser verdad.
 *
 * `/agentes`, `/agentes.md` y la sección de `llms.txt` salen de
 * `lib/agentes/contenido.ts`. Un asistente lee eso y lo repite como un hecho:
 * si la página nombra una herramienta que ya no existe, o un tope que cambió,
 * el agente falla delante del cliente y la culpa es de la documentación.
 *
 * El conector registra sus herramientas dentro de `app/api/mcp/route.ts`, y los
 * topes viven como constantes privadas del guard. Para no tocar ninguno de los
 * dos —son la puerta de la API— esta prueba lee su fuente y lo compara con lo
 * publicado. Cambiar uno sin el otro la rompe, que es exactamente el aviso.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  CONECTOR, DONDE_SE_PEGA, EJEMPLO_CURL, ERRORES, HERRAMIENTAS, HOY_PUEDE, PREGUNTAS, REGLAS, RUTAS_REST, TODAVIA_NO,
  agentesMarkdown, textoDeLaPrueba,
} from '@/lib/agentes/contenido';
import { BASE_PUBLICA } from '@/lib/config/enlaces';
import { PRUEBA, diasDePrueba } from '@/lib/config/suscripcion';

const leer = (ruta: string) => readFileSync(path.join(process.cwd(), ruta), 'utf8');

const RUTA_MCP = leer('app/api/mcp/route.ts');
const GUARD = leer('lib/auth/api-key-guard.ts');

/** Cada `registerTool('nombre', { … inputSchema: z.object({ … }) })` del conector. */
function herramientasDelCodigo(): { nombre: string; parametros: string[] }[] {
  const trozos = RUTA_MCP.split('server.registerTool(').slice(1);
  return trozos.map((trozo) => {
    const nombre = trozo.match(/^\s*'([a-z_]+)'/)?.[1] ?? '';
    // El esquema llega hasta el `async` del manejador; ahí dentro, cada
    // `clave: z.` es un parámetro.
    const esquema = trozo.slice(trozo.indexOf('inputSchema'), trozo.indexOf('async'));
    const parametros = [...esquema.matchAll(/(\w+):\s*z\./g)].map((m) => m[1]).filter((p) => p !== 'inputSchema');
    return { nombre, parametros };
  });
}

describe('lo publicado coincide con el conector', () => {
  const delCodigo = herramientasDelCodigo();

  it('lee al menos una herramienta del fuente (la prueba no se quedó ciega)', () => {
    expect(delCodigo.length).toBeGreaterThan(5);
    expect(delCodigo.every((h) => h.nombre.length > 0)).toBe(true);
  });

  it('publica exactamente las herramientas que registra el conector, en su orden', () => {
    expect(HERRAMIENTAS.map((h) => h.nombre)).toEqual(delCodigo.map((h) => h.nombre));
  });

  it('publica exactamente los parámetros de cada herramienta', () => {
    for (const h of delCodigo) {
      const publicada = HERRAMIENTAS.find((x) => x.nombre === h.nombre);
      expect(publicada?.parametros.map((p) => p.nombre), h.nombre).toEqual(h.parametros);
    }
  });

  it('no publica ninguna herramienta que escriba: el conector es de solo lectura', () => {
    expect(RUTA_MCP).toContain('Endpoint MCP de solo lectura');
    expect(HERRAMIENTAS.every((h) => /^(list|get)_/.test(h.nombre))).toBe(true);
  });

  it('los topes publicados son los del guard', () => {
    expect(Number(GUARD.match(/const MAX_POR_KEY = (\d+)/)?.[1])).toBe(CONECTOR.topePorLlave);
    expect(Number(GUARD.match(/const MAX_POR_IP = (\d+)/)?.[1])).toBe(CONECTOR.topePorDireccion);
  });

  it('el prefijo de la llave es el que el guard exige', () => {
    expect(GUARD).toContain(`startsWith('${CONECTOR.prefijoDeLaLlave}')`);
    expect(CONECTOR.cabecera).toContain(`Bearer ${CONECTOR.prefijoDeLaLlave}`);
  });

  it('las filas por defecto y el máximo son los de los listados', () => {
    const facturas = leer('app/api/mcp/v1/facturas/route.ts');
    expect(facturas).toContain(`|| ${CONECTOR.filasPorDefecto}, ${CONECTOR.filasMaximo})`);
  });

  it('la dirección del conector sale de la base pública, no de un texto a mano', () => {
    expect(CONECTOR.url).toBe(`${BASE_PUBLICA}/api/mcp`);
    expect(RUTA_MCP).toContain("streamableHttpEndpoint: '/api/mcp'");
  });
});

describe('las consultas por HTTP coinciden con las rutas que existen', () => {
  const base = path.join(process.cwd(), 'app/api/mcp/v1');
  /** Cada carpeta con `route.ts` bajo `v1`, como `/facturas` o `/facturas/{id}`. */
  function rutasDelCodigo(): string[] {
    return readdirSync(base).flatMap((carpeta) => {
      const rutas: string[] = [];
      if (existsSync(path.join(base, carpeta, 'route.ts'))) rutas.push(`/${carpeta}`);
      if (existsSync(path.join(base, carpeta, '[id]', 'route.ts'))) rutas.push(`/${carpeta}/{id}`);
      return rutas;
    }).sort();
  }

  it('publica todas y solo las rutas que hay', () => {
    expect(RUTAS_REST.map((r) => r.ruta).sort()).toEqual(rutasDelCodigo());
  });

  it('cada ruta apunta a una herramienta que existe, y ninguna herramienta se queda sin ruta', () => {
    const nombres = HERRAMIENTAS.map((h) => h.nombre).sort();
    expect(RUTAS_REST.map((r) => r.herramienta).sort()).toEqual(nombres);
  });

  it('el comando de prueba es el mismo que enseña la pantalla de llaves', () => {
    const guia = leer('components/mcp/GuiaConexion.tsx');
    expect(guia).toContain('/api/mcp/v1/facturas?limit=1');
    expect(EJEMPLO_CURL).toContain(`${CONECTOR.rest}/facturas?limit=1`);
    expect(CONECTOR.rest).toBe(`${BASE_PUBLICA}/api/mcp/v1`);
  });

  it('dice dónde se pega la llave en los asistentes que nombra la app', () => {
    const guia = leer('components/mcp/GuiaConexion.tsx');
    for (const d of DONDE_SE_PEGA) expect(guia).toContain(d.asistente);
  });
});

describe('la versión en texto', () => {
  const md = agentesMarkdown();

  it('empieza por el título y el resumen, que es lo que un modelo lee primero', () => {
    const lineas = md.split('\n');
    expect(lineas[0]).toBe('# Zero para agentes de IA');
    expect(lineas[2].startsWith('> ')).toBe(true);
  });

  it('trae todas las herramientas, reglas, errores y preguntas', () => {
    for (const h of HERRAMIENTAS) expect(md).toContain(`\`${h.nombre}\``);
    for (const r of REGLAS) expect(md).toContain(r);
    for (const e of ERRORES) expect(md).toContain(`| ${e.codigo} |`);
    for (const p of PREGUNTAS) expect(md).toContain(`### ${p.pregunta}`);
    for (const r of RUTAS_REST) expect(md).toContain(`\`GET ${r.ruta}\``);
    for (const d of DONDE_SE_PEGA) expect(md).toContain(`**${d.asistente}:**`);
  });

  it('dice lo que se puede y lo que todavía no, sin prometer', () => {
    for (const p of HOY_PUEDE) expect(md).toContain(p);
    for (const p of TODAVIA_NO) expect(md).toContain(p);
    expect(md).toContain('todavía no existen');
  });

  it('no deja valores sin resolver ni una llave de verdad', () => {
    expect(md).not.toMatch(/undefined|\[object Object\]|\$\{/);
    // Una llave real son `emdo_` + 48 hexadecimales. En la documentación solo
    // puede salir el marcador.
    expect(md).not.toMatch(/emdo_[0-9a-f]{16,}/);
  });

  it('la prueba gratis se lee de la misma perilla que el alta', () => {
    const texto = textoDeLaPrueba();
    expect(texto).toContain(String(diasDePrueba('ecf')));
    expect(texto).toContain(String(diasDePrueba('colegio')));
    expect(texto.includes('sin tarjeta')).toBe(!PRUEBA.pideTarjeta);
    expect(md).toContain(texto);
  });
});

describe('las puertas hacia la información', () => {
  it('llms.txt enseña el camino a las páginas para agentes y al conector', () => {
    const llms = leer('app/llms.txt/route.ts');
    expect(llms).toContain('## Para agentes de IA');
    expect(llms).toContain('RUTA_AGENTES_MD');
    expect(llms).toContain('RUTA_FUNCIONES_MD');
    expect(llms).toContain('CONECTOR.url');
  });

  it('la página declara su gemelo en texto y está en el mapa del sitio', () => {
    const pagina = leer('app/(marketing)/agentes/page.tsx');
    expect(pagina).toContain("types: { 'text/markdown': RUTA_AGENTES_MD }");
    expect(leer('app/sitemap.ts')).toContain("ruta: '/agentes'");
    expect(leer('app/(marketing)/_pie.tsx')).toContain("href: '/agentes'");
  });
});
