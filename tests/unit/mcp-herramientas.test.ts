/**
 * El registro único de herramientas del conector (`lib/mcp/herramientas.ts`) y
 * todo lo que sale de él: el servidor MCP, la documentación de mcp.zero.com.do
 * y el `server.json` del registro oficial.
 *
 * Lo que se quiere impedir es que la documentación (o el registro oficial)
 * diga algo que el conector no hace. Por eso estas pruebas levantan un servidor
 * MCP de verdad con las herramientas del registro y lo consultan como lo haría
 * un cliente (`tools/list`, `tools/call`), y luego comparan con lo que publican
 * las páginas, los gemelos en texto, `llms.txt` y `server.json`.
 */

import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ANOTACIONES_DE_LECTURA, FILAS_MAXIMO, FILAS_POR_DEFECTO, HERRAMIENTAS_MCP, SERVIDOR_MCP, parametrosDe,
  peticionHttp, type Herramienta,
} from '@/lib/mcp/herramientas';
import { registrarHerramientas, type Llamar } from '@/lib/mcp/registrar';
import { MODULOS } from '@/lib/agentes/funciones';
import { CONECTOR } from '@/lib/agentes/contenido';
import { aMarkdown, fichaDeHerramienta, llmsTxt, modulosConHerramientas, paginaDocs, todasLasPaginas } from '@/lib/mcp/docs';
import {
  ESQUEMA_SERVER_JSON, MCP_BASE, MCP_URL, NOMBRE_EN_REGISTRO, PAGINAS_DOCS, urlDocs,
} from '@/lib/mcp/conector';
import { serverJson } from '@/lib/mcp/server-json';

// ─── Un servidor de verdad, con una `llamar` falsa ────────────────────────

async function conectar() {
  const llamadas: { ruta: string; consulta: Record<string, string | undefined> }[] = [];
  const llamar: Llamar = vi.fn(async (ruta, consulta) => {
    llamadas.push({ ruta, consulta });
    return { content: [{ type: 'text' as const, text: '{"ok":true}' }] };
  });

  const server = new McpServer({ name: SERVIDOR_MCP.nombre, version: SERVIDOR_MCP.version });
  registrarHerramientas(server, llamar);

  const [lado1, lado2] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'prueba', version: '0.0.0' });
  await Promise.all([server.connect(lado1), client.connect(lado2)]);
  return { client, llamadas, llamar };
}

describe('lo que registra el servidor MCP es el registro', () => {
  it('tools/list devuelve exactamente las herramientas del registro, en su orden', async () => {
    const { client } = await conectar();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(HERRAMIENTAS_MCP.map((h) => h.nombre));
  });

  it('cada herramienta lleva su título, su descripción y sus anotaciones', async () => {
    const { client } = await conectar();
    const { tools } = await client.listTools();
    for (const h of HERRAMIENTAS_MCP) {
      const t = tools.find((x) => x.name === h.nombre)!;
      expect(t.title, h.nombre).toBe(h.titulo);
      expect(t.description, h.nombre).toBe(h.descripcion);
      expect(t.annotations, h.nombre).toMatchObject(h.annotations);
    }
  });

  it('el esquema de entrada anunciado tiene los mismos campos y los mismos obligatorios que el esquema zod', async () => {
    const { client } = await conectar();
    const { tools } = await client.listTools();
    for (const h of HERRAMIENTAS_MCP) {
      const t = tools.find((x) => x.name === h.nombre)!;
      const esperados = parametrosDe(h.inputSchema);
      expect(Object.keys(t.inputSchema.properties ?? {}), h.nombre).toEqual(esperados.map((p) => p.nombre));
      expect([...(t.inputSchema.required ?? [])].sort(), h.nombre)
        .toEqual(esperados.filter((p) => p.obligatorio).map((p) => p.nombre).sort());
    }
  });

  it('cada parámetro llega con su descripción a quien lista las herramientas', async () => {
    const { client } = await conectar();
    const { tools } = await client.listTools();
    for (const t of tools) {
      for (const [campo, def] of Object.entries(t.inputSchema.properties ?? {})) {
        expect((def as { description?: string }).description, `${t.name}.${campo}`).toBeTruthy();
      }
    }
  });

  it('tools/call arma la petición HTTP que dice el registro', async () => {
    const { client, llamadas } = await conectar();

    await client.callTool({ name: 'get_client', arguments: { id: 42 } });
    await client.callTool({ name: 'list_invoices', arguments: { q: 'abc', clientId: 3, limit: 10, desde: '2026-09-01' } });
    await client.callTool({ name: 'get_accounts_receivable', arguments: { soloVencidas: true } });
    await client.callTool({ name: 'get_accounts_receivable', arguments: { soloVencidas: false } });
    await client.callTool({ name: 'list_school_charges', arguments: { mes: 11, anio: 2026 } });

    expect(llamadas).toEqual([
      { ruta: '/clientes/42', consulta: {} },
      { ruta: '/facturas', consulta: { q: 'abc', clientId: '3', limit: '10', desde: '2026-09-01' } },
      { ruta: '/cuentas-por-cobrar', consulta: { soloVencidas: 'true' } },
      { ruta: '/cuentas-por-cobrar', consulta: {} },
      { ruta: '/cargos-escolares', consulta: { mes: '11', anio: '2026' } },
    ]);
  });

  it('rechaza lo que el esquema no admite sin llegar a llamar a nada', async () => {
    const { client, llamar } = await conectar();
    for (const [name, args] of [
      ['get_client', { id: -1 }],
      ['get_client', { id: 1.5 }],
      ['get_client', {}],
      ['list_clients', { limit: 501 }],
      ['list_clients', { limit: 0 }],
      ['list_school_charges', { mes: 13 }],
    ] as const) {
      const r = await client.callTool({ name, arguments: args }).catch((e: unknown) => ({ isError: true, e }));
      expect((r as { isError?: boolean }).isError, `${name} ${JSON.stringify(args)}`).toBe(true);
    }
    expect(llamar).not.toHaveBeenCalled();
  });

  it('el ejemplo de cada herramienta es un uso válido y arma la ruta que se documenta', async () => {
    const { client, llamadas } = await conectar();
    for (const h of HERRAMIENTAS_MCP) {
      expect(h.inputSchema.safeParse(h.ejemplo.argumentos).success, h.nombre).toBe(true);
      const r = await client.callTool({ name: h.nombre, arguments: h.ejemplo.argumentos });
      expect((r as { isError?: boolean }).isError, h.nombre).toBeFalsy();
    }
    expect(llamadas.map((l) => l.ruta)).toEqual(
      HERRAMIENTAS_MCP.map((h) => peticionHttp(h, h.ejemplo.argumentos).ruta),
    );
  });
});

describe('el registro es coherente', () => {
  it('los nombres no se repiten y los límites del esquema salen de las constantes', () => {
    const nombres = HERRAMIENTAS_MCP.map((h) => h.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(CONECTOR.filasPorDefecto).toBe(FILAS_POR_DEFECTO);
    expect(CONECTOR.filasMaximo).toBe(FILAS_MAXIMO);
    const limit = HERRAMIENTAS_MCP[0].inputSchema.shape.limit;
    expect(limit.safeParse(FILAS_MAXIMO).success).toBe(true);
    expect(limit.safeParse(FILAS_MAXIMO + 1).success).toBe(false);
  });

  it('cada herramienta de lectura declara readOnlyHint verdadero, y solo ellas', () => {
    for (const h of HERRAMIENTAS_MCP) {
      if (h.nivel === 'lectura') {
        expect(h.annotations, h.nombre).toEqual(ANOTACIONES_DE_LECTURA);
        expect(h.annotations.readOnlyHint, h.nombre).toBe(true);
        expect(h.annotations.destructiveHint, h.nombre).toBe(false);
        expect(h.annotations.idempotentHint, h.nombre).toBe(true);
        expect(h.annotations.openWorldHint, h.nombre).toBe(false);
      } else {
        expect(h.annotations.readOnlyHint, h.nombre).toBe(false);
      }
    }
  });

  it('hoy todas son de lectura y empiezan por list_ o get_', () => {
    expect(HERRAMIENTAS_MCP.every((h) => h.nivel === 'lectura')).toBe(true);
    expect(HERRAMIENTAS_MCP.every((h) => /^(list|get)_[a-z_]+$/.test(h.nombre))).toBe(true);
  });

  it('cada módulo es uno del catálogo de funciones', () => {
    const ids = MODULOS.map((m) => m.id);
    for (const h of HERRAMIENTAS_MCP) expect(ids, h.nombre).toContain(h.modulo);
  });

  it('cada herramienta tiene título, descripción y ejemplo, y la descripción no da órdenes al modelo', () => {
    for (const h of HERRAMIENTAS_MCP) {
      expect(h.titulo.length, h.nombre).toBeGreaterThan(3);
      expect(h.descripcion.length, h.nombre).toBeGreaterThan(10);
      expect(h.ejemplo.peticion.length, h.nombre).toBeGreaterThan(10);
      // Sin imperativos dirigidos al modelo («usa…», «ojo…», «recuerda…»).
      expect(h.descripcion, h.nombre).not.toMatch(/\b(usa|usá|ojo|recuerda|nunca|siempre|debes)\b/i);
    }
  });

  it('cada ruta HTTP existe en app/api/mcp/v1 y sus {llaves} son campos del esquema', () => {
    for (const h of HERRAMIENTAS_MCP) {
      const [, carpeta, resto] = h.http.ruta.split('/');
      const archivo = resto === '{id}'
        ? path.join(process.cwd(), 'app/api/mcp/v1', carpeta, '[id]', 'route.ts')
        : path.join(process.cwd(), 'app/api/mcp/v1', carpeta, 'route.ts');
      expect(existsSync(archivo), `${h.nombre} → ${h.http.ruta}`).toBe(true);
      for (const [, campo] of h.http.ruta.matchAll(/\{(\w+)\}/g)) {
        expect(Object.keys(h.inputSchema.shape), h.nombre).toContain(campo);
      }
    }
  });

  it('el esquema se documenta con tipo, obligatorio y límites sacados de zod', () => {
    const get = (n: string) => HERRAMIENTAS_MCP.find((h) => h.nombre === n)!;
    const id = parametrosDe(get('get_client').inputSchema);
    expect(id).toEqual([expect.objectContaining({ nombre: 'id', tipo: 'entero', obligatorio: true, restriccion: 'mayor que 0' })]);

    const limit = parametrosDe(get('list_clients').inputSchema).find((p) => p.nombre === 'limit')!;
    expect(limit).toMatchObject({ tipo: 'entero', obligatorio: false, restriccion: `de 1 a ${FILAS_MAXIMO}` });

    const mes = parametrosDe(get('list_school_charges').inputSchema).find((p) => p.nombre === 'mes')!;
    expect(mes.restriccion).toBe('de 1 a 12');

    const vencidas = parametrosDe(get('get_accounts_receivable').inputSchema).find((p) => p.nombre === 'soloVencidas')!;
    expect(vencidas.tipo).toBe('sí/no');

    const desde = parametrosDe(get('list_invoices').inputSchema).find((p) => p.nombre === 'desde')!;
    expect(desde.tipo).toBe('fecha');
  });
});

// ─── La documentación ─────────────────────────────────────────────────────

/** Los nombres de herramienta que aparecen entre comillas invertidas en un texto. */
function nombresMencionados(texto: string): string[] {
  return [...new Set([...texto.matchAll(/`((?:list|get)_[a-z_]+)`/g)].map((m) => m[1]))];
}

describe('la documentación tiene todas las herramientas del registro y ninguna más', () => {
  const registro = HERRAMIENTAS_MCP.map((h) => h.nombre);

  it('la página de herramientas trae una ficha por herramienta, una vez, en el orden del registro', () => {
    const pagina = paginaDocs('herramientas');
    const fichas = pagina.secciones.flatMap((s) => s.bloques).flatMap((b) => (b.t === 'herramienta' ? [b.nombre] : []));
    expect(fichas.slice().sort()).toEqual(registro.slice().sort());
    expect(new Set(fichas).size).toBe(fichas.length);
    // Agrupadas por módulo: el orden es el del registro dentro de cada grupo.
    const agrupadas = modulosConHerramientas().flatMap((g) => g.herramientas.map((h) => h.nombre));
    expect(fichas).toEqual(agrupadas);
  });

  it('cada ficha trae los parámetros del esquema y su ejemplo', () => {
    for (const h of HERRAMIENTAS_MCP) {
      const f = fichaDeHerramienta(h.nombre);
      expect(f.parametros.map((p) => p.nombre), h.nombre).toEqual(Object.keys(h.inputSchema.shape));
      expect(JSON.parse(f.argumentos)).toEqual(h.ejemplo.argumentos);
    }
    expect(() => fichaDeHerramienta('inventada')).toThrow();
  });

  it('el gemelo en texto de la página de herramientas las trae todas y ninguna inventada', () => {
    const md = aMarkdown(paginaDocs('herramientas'));
    for (const nombre of registro) expect(md).toContain(`### \`${nombre}\``);
    const titulos = [...md.matchAll(/^### `([^`]+)`$/gm)].map((m) => m[1]);
    expect(titulos.sort()).toEqual(registro.slice().sort());
  });

  it('ninguna página, gemelo, llms.txt ni server.json nombra una herramienta que no esté en el registro', () => {
    const textos = [
      ...todasLasPaginas().map(aMarkdown),
      llmsTxt(),
      JSON.stringify(serverJson()),
    ];
    for (const t of textos) {
      for (const nombre of nombresMencionados(t)) expect(registro, nombre).toContain(nombre);
    }
  });

  it('llms.txt lista cada herramienta y enlaza cada gemelo en texto', () => {
    const llms = llmsTxt();
    for (const nombre of registro) expect(llms).toContain(`\`${nombre}\``);
    for (const p of PAGINAS_DOCS) expect(llms).toContain(urlDocs(p.md));
    expect(llms).toContain(MCP_URL);
    expect(llms.startsWith('# Zero')).toBe(true);
  });

  it('el número de herramientas que se dice es el del registro', () => {
    const md = aMarkdown(paginaDocs('herramientas'));
    expect(md).toContain(`${registro.length} herramientas`);
    expect(aMarkdown(paginaDocs('inicio'))).toContain(`Tiene ${registro.length} herramientas`);
  });

  it('los límites que se publican son los de CONECTOR (que otra prueba ata al guard)', () => {
    const inicio = aMarkdown(paginaDocs('inicio'));
    const seguridad = aMarkdown(paginaDocs('seguridad'));
    for (const md of [inicio, seguridad]) {
      expect(md).toContain(`${CONECTOR.topePorLlave} `);
      expect(md).toMatch(new RegExp(`${CONECTOR.topePorLlave} (peticiones )?por minuto`));
      expect(md).toMatch(new RegExp(`${CONECTOR.topePorDireccion} (peticiones )?por minuto`));
    }
    expect(inicio).toContain(`${CONECTOR.filasMaximo} como máximo`);
  });

  it('la portada trae la dirección del conector, los clientes y al menos tres ejemplos', () => {
    const md = aMarkdown(paginaDocs('inicio'));
    expect(md).toContain('https://mcp.zero.com.do/mcp');
    expect(md).toContain('claude mcp add --transport http zero https://mcp.zero.com.do/mcp');
    for (const cliente of ['Claude Code', 'Cursor', 'VS Code', 'ChatGPT']) expect(md).toContain(cliente);
    const ejemplos = (md.match(/^\| «/gm) ?? []).length;
    expect(ejemplos).toBeGreaterThanOrEqual(3);
  });

  it('dice lo que el conector no hace todavía y no promete fechas ni claves reales', () => {
    const todo = todasLasPaginas().map(aMarkdown).join('\n');
    expect(todo).toContain('Crear, cambiar o anular nada');
    expect(todo).not.toMatch(/emdo_[0-9a-f]{16,}/);
    // Fuera de los bloques de código (donde `${VARIABLE}` es parte del ejemplo de configuración).
    const sinCodigo = todo.replace(/```[\s\S]*?```/g, '');
    expect(sinCodigo).not.toMatch(/undefined|\[object Object\]|\$\{/);
  });

  it('cada página tiene su gemelo en texto, y todos están en el mapa de la documentación', () => {
    for (const p of PAGINAS_DOCS) {
      const pagina = paginaDocs(p.slug);
      expect(pagina.ruta).toBe(p.ruta);
      expect(pagina.md).toBe(p.md);
      expect(aMarkdown(pagina).startsWith(`# ${pagina.titulo}\n`)).toBe(true);
    }
  });
});

// ─── server.json ──────────────────────────────────────────────────────────

describe('server.json es válido para el registro oficial de MCP', () => {
  const sj = serverJson();

  /**
   * Las reglas del esquema `2025-12-11` que le tocan a un servidor remoto:
   * obligatorios `name`, `description` y `version`; `name` con forma
   * `espacio/nombre`; `description` de 1 a 100 caracteres; cada remoto con
   * `type` (streamable-http o sse) y `url` http(s); y cabeceras con `name`.
   */
  it('trae los campos obligatorios con la forma que pide el esquema', () => {
    expect(sj.$schema).toBe(ESQUEMA_SERVER_JSON);
    expect(sj.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(sj.name.length).toBeGreaterThanOrEqual(3);
    expect(sj.name.length).toBeLessThanOrEqual(200);
    expect(sj.description.length).toBeGreaterThanOrEqual(1);
    expect(sj.description.length).toBeLessThanOrEqual(100);
    expect(sj.title.length).toBeLessThanOrEqual(100);
    expect(sj.version.length).toBeLessThanOrEqual(255);
    expect(() => new URL(sj.websiteUrl)).not.toThrow();
  });

  it('declara el servidor remoto de Zero, con su cabecera secreta', () => {
    expect(sj.remotes).toHaveLength(1);
    const [remoto] = sj.remotes;
    expect(['streamable-http', 'sse']).toContain(remoto.type);
    expect(remoto.type).toBe('streamable-http');
    expect(remoto.url).toMatch(/^https?:\/\/[^\s]+$/);
    expect(remoto.url).toBe(MCP_URL);
    expect(remoto.headers).toEqual([
      expect.objectContaining({ name: 'Authorization', isRequired: true, isSecret: true }),
    ]);
  });

  it('es el espacio do.com.zero y la versión del servidor MCP', () => {
    expect(sj.name).toBe('do.com.zero/zero');
    expect(sj.name).toBe(NOMBRE_EN_REGISTRO);
    expect(sj.version).toBe(SERVIDOR_MCP.version);
    expect(sj.websiteUrl).toBe(MCP_BASE);
  });

  it('el remoto es del dominio del espacio del nombre (do.com.zero → zero.com.do)', () => {
    const dominio = sj.name.split('/')[0].split('.').reverse().join('.');
    expect(new URL(sj.remotes[0].url).hostname.endsWith(dominio)).toBe(true);
  });

  it('sobrevive a ir y volver por JSON sin perder nada', () => {
    expect(JSON.parse(JSON.stringify(sj))).toEqual(sj);
  });
});

describe('herramienta con parámetros en la ruta', () => {
  it('peticionHttp no deja escapar nada raro en la ruta', () => {
    const h = HERRAMIENTAS_MCP.find((x) => x.nombre === 'get_client') as Herramienta;
    expect(peticionHttp(h, { id: '../x?y=1' }).ruta).toBe('/clientes/..%2Fx%3Fy%3D1');
  });
});
