/**
 * Lo que Zero le publica a un agente de IA tiene que ser verdad.
 *
 * `/agentes`, `/agentes.md` y la sección de `llms.txt` salen de
 * `lib/agentes/contenido.ts`. Un asistente lee eso y lo repite como un hecho:
 * si la página nombra una herramienta que ya no existe, o un tope que cambió,
 * el agente falla delante del cliente y la culpa es de la documentación.
 *
 * Las herramientas del conector salen del registro único
 * `lib/mcp/herramientas.ts`: de ahí las registra `app/api/mcp/route.ts` y de ahí
 * las publica `lib/agentes/contenido.ts`. Esta prueba comprueba que la ruta no
 * registra nada por su cuenta (si una herramienta se colara inline, no saldría
 * en la documentación) y que lo publicado es lo del registro. Los topes viven
 * como constantes privadas del guard; para no tocarlo —es la puerta de la API—
 * se lee su fuente y se compara con lo publicado. Cambiar uno sin el otro la
 * rompe, que es exactamente el aviso.
 *
 * El detalle del conector (que lo que registra coincide con el registro, las
 * anotaciones, la ruta de cada herramienta) está en `mcp-herramientas.test.ts`.
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
import { HERRAMIENTAS_MCP } from '@/lib/mcp/herramientas';

const leer = (ruta: string) => readFileSync(path.join(process.cwd(), ruta), 'utf8');

const RUTA_MCP = leer('app/api/mcp/route.ts');
const GUARD = leer('lib/auth/api-key-guard.ts');

describe('lo publicado coincide con el conector', () => {
  it('la ruta del conector no registra herramientas por su cuenta: todas salen del registro', () => {
    expect(RUTA_MCP).not.toContain('registerTool(');
    expect(RUTA_MCP).toContain('registrarHerramientas');
    expect(RUTA_MCP).toContain("from '@/lib/mcp/registrar'");
  });

  it('publica exactamente las herramientas del registro, en su orden', () => {
    expect(HERRAMIENTAS.length).toBeGreaterThan(5);
    expect(HERRAMIENTAS.map((h) => h.nombre)).toEqual(HERRAMIENTAS_MCP.map((h) => h.nombre));
  });

  it('publica exactamente los parámetros del esquema de cada herramienta', () => {
    for (const h of HERRAMIENTAS_MCP) {
      const publicada = HERRAMIENTAS.find((x) => x.nombre === h.nombre);
      expect(publicada?.parametros.map((p) => p.nombre), h.nombre).toEqual(Object.keys(h.inputSchema.shape));
    }
  });

  it('no publica ninguna herramienta que escriba: el conector es de solo lectura', () => {
    expect(RUTA_MCP).toContain('Endpoint MCP de solo lectura');
    // Mientras `TODAVIA_NO` diga que el conector no escribe, el registro no
    // puede traer una herramienta que no sea de lectura: al añadirla, esta
    // prueba obliga a corregir primero lo que se le promete a los agentes.
    expect(HERRAMIENTAS_MCP.every((h) => h.nivel === 'lectura')).toBe(true);
    expect(HERRAMIENTAS.every((h) => /^(list|get)_/.test(h.nombre))).toBe(true);
    expect(TODAVIA_NO.some((t) => t.includes('solo lectura'))).toBe(true);
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
    expect(RUTA_MCP).toContain("const ENDPOINT_APP = '/api/mcp'");
    expect(RUTA_MCP).toContain("const ENDPOINT_MCP = '/mcp'");
    // La misma puerta, en el subdominio del conector.
    expect(CONECTOR.urlEnSubdominio).toBe(`${CONECTOR.documentacion}/mcp`);
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

  it('llevan a la documentación del conector (mcp.zero.com.do)', () => {
    expect(leer('app/llms.txt/route.ts')).toContain('CONECTOR.documentacion');
    expect(leer('app/(marketing)/agentes/page.tsx')).toContain('CONECTOR.documentacion');
    expect(agentesMarkdown()).toContain(CONECTOR.documentacion);
    expect(CONECTOR.documentacion).toBe('https://mcp.zero.com.do');
  });

  it('la página declara su gemelo en texto y está en el mapa del sitio', () => {
    const pagina = leer('app/(marketing)/agentes/page.tsx');
    expect(pagina).toContain("types: { 'text/markdown': RUTA_AGENTES_MD }");
    expect(leer('app/sitemap.ts')).toContain("ruta: '/agentes'");
    expect(leer('app/(marketing)/_pie.tsx')).toContain("href: '/agentes'");
  });
});
