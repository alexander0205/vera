/**
 * El registro único de las herramientas del conector MCP de Zero.
 *
 * De aquí sale TODO lo que se dice o se hace con una herramienta:
 *
 *  - `app/api/mcp/route.ts` las registra en el servidor MCP (nombre, título,
 *    descripción, anotaciones y esquema de entrada), vía `registrar.ts`;
 *  - la documentación de `mcp.zero.com.do` (páginas, `.md`, `llms.txt`) las
 *    lista, con su tabla de parámetros leída del MISMO esquema zod;
 *  - `lib/agentes/contenido.ts` (la página `/agentes`) las publica desde aquí.
 *
 * Una sola fuente a propósito: una herramienta que se documenta a mano en tres
 * sitios es una herramienta que un día se promete sin existir. Para añadir una,
 * se añade una entrada aquí y nada más: el conector la sirve, la documentación
 * la lista y las pruebas (`tests/unit/mcp-herramientas.test.ts`) comprueban que
 * es coherente.
 *
 * Nada de este archivo toca la base ni la red: es declaración pura, importable
 * desde cualquier sitio (servidor, pruebas, páginas).
 */

import { z } from 'zod';

// ─── Constantes que comparten el esquema y la documentación ───────────────

/** Filas que devuelve un listado si no se pide otra cosa. Debe coincidir con las rutas `v1`. */
export const FILAS_POR_DEFECTO = 200;
/** Máximo de filas por listado. */
export const FILAS_MAXIMO = 500;

/** Nombre y versión que el conector anuncia en `initialize` y en `server.json`. */
export const SERVIDOR_MCP = {
  nombre: 'zero',
  titulo: 'Zero',
  /** 1.0.0: 11 herramientas de lectura. 1.1.0: anotaciones MCP y subdominio `mcp.`. */
  version: '1.1.0',
} as const;

// ─── Tipos ────────────────────────────────────────────────────────────────

/**
 * Qué hace la herramienta con los datos.
 *
 *  - `lectura`: solo consulta. No pide aprobación.
 *  - `escritura`: crea o cambia algo que se puede deshacer.
 *  - `aprobacion`: no se deshace; exige la aprobación de una persona.
 *
 * Hoy todas son `lectura`. Los otros dos existen en el tipo para que la fase de
 * escritura entre por aquí sin rehacer la documentación ni las pruebas.
 */
export type NivelDeHerramienta = 'lectura' | 'escritura' | 'aprobacion';

/** Las anotaciones de herramienta de la especificación MCP. */
export type AnotacionesMcp = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

/**
 * Anotaciones de una herramienta de lectura: no cambia nada, repetirla da lo
 * mismo y solo habla con Zero (no con el mundo abierto).
 */
export const ANOTACIONES_DE_LECTURA: AnotacionesMcp = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export type Herramienta = {
  /** `list_…` / `get_…` mientras todo sea de lectura. */
  nombre: string;
  /** Lo que ve una persona en la lista de herramientas de su asistente. */
  titulo: string;
  /** Qué hace y qué devuelve, en español y en afirmativo. Sin órdenes al modelo. */
  descripcion: string;
  /** Clave del módulo en el catálogo de `lib/agentes/funciones.ts` (`MODULOS`). */
  modulo: string;
  nivel: NivelDeHerramienta;
  annotations: AnotacionesMcp;
  /** El esquema de entrada. De aquí salen la validación Y la tabla de la documentación. */
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /** La ruta HTTP hermana a la que llama la herramienta. `{id}` se sustituye por el argumento `id`. */
  http: { metodo: 'GET'; ruta: string };
  /** Un pedido en español natural y los argumentos con que el asistente llamaría la herramienta. */
  ejemplo: { peticion: string; argumentos: Record<string, unknown> };
};

// ─── Piezas del esquema ───────────────────────────────────────────────────

const id = (que: string) => z.number().int().positive().safe().describe(`Id ${que}, el que devuelve el listado.`);
const limit = z.number().int().min(1).max(FILAS_MAXIMO).optional()
  .describe(`Filas a devolver; por defecto ${FILAS_POR_DEFECTO}.`);
const clientId = z.number().int().optional().describe('Limita el resultado a un cliente (su id).');
const desde = (sobre: string) => z.string().optional().describe(`Fecha inicial del rango, aplicada a ${sobre}. Formato YYYY-MM-DD.`);
const hasta = (sobre: string) => z.string().optional().describe(`Fecha final del rango, aplicada a ${sobre}. Formato YYYY-MM-DD.`);

// ─── Las herramientas, en el orden en que se publican ─────────────────────

export const HERRAMIENTAS_MCP: readonly Herramienta[] = [
  {
    nombre: 'list_clients',
    titulo: 'Listar clientes',
    descripcion: 'Lista los clientes de la empresa, con búsqueda opcional por nombre, RNC o correo.',
    modulo: 'clientes',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({
      q: z.string().optional().describe('Texto a buscar en el nombre, el RNC o el correo.'),
      limit,
    }),
    http: { metodo: 'GET', ruta: '/clientes' },
    ejemplo: {
      peticion: 'Busca a Ferretería Díaz entre mis clientes y dime su RNC.',
      argumentos: { q: 'Ferretería Díaz', limit: 5 },
    },
  },
  {
    nombre: 'get_client',
    titulo: 'Detalle de cliente',
    descripcion: 'Devuelve un cliente por su id.',
    modulo: 'clientes',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({ id: id('del cliente') }),
    http: { metodo: 'GET', ruta: '/clientes/{id}' },
    ejemplo: { peticion: 'Muéstrame los datos completos del cliente 42.', argumentos: { id: 42 } },
  },
  {
    nombre: 'list_invoices',
    titulo: 'Listar facturas',
    descripcion:
      'Lista facturas y demás comprobantes, del más antiguo al más reciente por fecha de emisión, con filtros opcionales por estado, estado de cobro, cliente, fechas y texto.',
    modulo: 'facturacion',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({
      q: z.string().optional().describe('Número de comprobante, código, nombre o RNC del comprador.'),
      estado: z.string().optional().describe('Estado del documento, tal como lo devuelve el listado.'),
      estadoPago: z.string().optional().describe('Estado de cobro, tal como lo devuelve el listado.'),
      clientId,
      desde: desde('la fecha de emisión'),
      hasta: hasta('la fecha de emisión'),
      limit,
    }),
    http: { metodo: 'GET', ruta: '/facturas' },
    ejemplo: {
      peticion: '¿Qué facturas emití en septiembre de 2026?',
      argumentos: { desde: '2026-09-01', hasta: '2026-09-30' },
    },
  },
  {
    nombre: 'get_invoice',
    titulo: 'Detalle de factura',
    descripcion: 'Devuelve una factura por su id.',
    modulo: 'facturacion',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({ id: id('de la factura') }),
    http: { metodo: 'GET', ruta: '/facturas/{id}' },
    ejemplo: { peticion: 'Muéstrame el detalle de la factura 118.', argumentos: { id: 118 } },
  },
  {
    nombre: 'list_recurring_invoices',
    titulo: 'Listar facturas recurrentes',
    descripcion:
      'Lista los planes de facturación recurrente, con filtros opcionales por estado, cliente y texto.',
    modulo: 'recurrentes',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({
      q: z.string().optional().describe('Texto a buscar.'),
      estado: z.string().optional().describe('Estado del plan.'),
      clientId,
      limit,
    }),
    http: { metodo: 'GET', ruta: '/facturas-recurrentes' },
    ejemplo: { peticion: '¿Qué clientes tengo en facturación recurrente?', argumentos: { limit: 50 } },
  },
  {
    nombre: 'get_recurring_invoice',
    titulo: 'Detalle de factura recurrente',
    descripcion: 'Devuelve un plan de facturación recurrente por su id.',
    modulo: 'recurrentes',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({ id: id('del plan recurrente') }),
    http: { metodo: 'GET', ruta: '/facturas-recurrentes/{id}' },
    ejemplo: { peticion: 'Dame el detalle del plan recurrente 7.', argumentos: { id: 7 } },
  },
  {
    nombre: 'get_accounts_receivable',
    titulo: 'Cuentas por cobrar',
    descripcion:
      'Lista las cuentas por cobrar con sus totales y la antigüedad del saldo, con filtros opcionales por cliente y por vencidas.',
    modulo: 'cobros',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({
      clientId,
      soloVencidas: z.boolean().optional().describe('Si es true, deja solo lo vencido.'),
    }),
    http: { metodo: 'GET', ruta: '/cuentas-por-cobrar' },
    ejemplo: { peticion: '¿Quién me debe y cuánto lleva vencido?', argumentos: { soloVencidas: true } },
  },
  {
    nombre: 'list_payments',
    titulo: 'Listar pagos recibidos',
    descripcion:
      'Lista los pagos cobrados: cuándo, por cuánto y por qué vía. Devuelve además `total` (en centavos) y `count` de todos los pagos que cumplen el filtro, no solo de la página. Un pago con metodo «nota_credito» no es dinero que entró.',
    modulo: 'cobros',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({
      metodo: z.string().optional()
        .describe('Vía de cobro: efectivo, transferencia, tarjeta, cheque, deposito, nota_credito, entre otras.'),
      ecfDocumentId: z.number().int().optional().describe('Limita a los cobros de una factura (su id).'),
      clientId,
      desde: desde('la fecha del pago'),
      hasta: hasta('la fecha del pago'),
      limit,
    }),
    http: { metodo: 'GET', ruta: '/pagos' },
    ejemplo: {
      peticion: '¿Cuánto cobré por transferencia en octubre de 2026?',
      argumentos: { metodo: 'transferencia', desde: '2026-10-01', hasta: '2026-10-31' },
    },
  },
  {
    nombre: 'get_payment',
    titulo: 'Detalle de pago',
    descripcion: 'Devuelve un pago recibido por su id.',
    modulo: 'cobros',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({ id: id('del pago') }),
    http: { metodo: 'GET', ruta: '/pagos/{id}' },
    ejemplo: { peticion: 'Muéstrame el cobro 305.', argumentos: { id: 305 } },
  },
  {
    nombre: 'list_school_charges',
    titulo: 'Listar cargos escolares',
    descripcion:
      'Lista los cargos del plan de pago de los estudiantes (mensualidades, inscripción y demás conceptos) con su fecha de vencimiento. Es la única herramienta que mira hacia adelante: las otras cuentan lo ya facturado, y un cargo con vencimiento futuro es dinero que todavía no se cobró. Devuelve `total` (lo facturado), `saldo` (lo que falta cobrar) y `count`, calculados sobre todo el filtro y no sobre la página. Las fechas `desde` y `hasta` filtran por el vencimiento.',
    modulo: 'colegios',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({
      estado: z.string().optional().describe('Estado del cargo.'),
      estudianteId: z.number().int().optional().describe('Limita a los cargos de un alumno (su id).'),
      mes: z.number().int().min(1).max(12).optional().describe('Mes del cargo, de 1 a 12.'),
      anio: z.number().int().optional().describe('Año del cargo.'),
      desde: desde('la fecha de vencimiento'),
      hasta: hasta('la fecha de vencimiento'),
      limit,
    }),
    http: { metodo: 'GET', ruta: '/cargos-escolares' },
    ejemplo: {
      peticion: '¿Cuánto voy a cobrar de mensualidades en noviembre de 2026?',
      argumentos: { mes: 11, anio: 2026 },
    },
  },
  {
    nombre: 'get_school_charge',
    titulo: 'Detalle de cargo escolar',
    descripcion: 'Devuelve un cargo escolar por su id.',
    modulo: 'colegios',
    nivel: 'lectura',
    annotations: ANOTACIONES_DE_LECTURA,
    inputSchema: z.object({ id: id('del cargo escolar') }),
    http: { metodo: 'GET', ruta: '/cargos-escolares/{id}' },
    ejemplo: { peticion: 'Dame el detalle del cargo escolar 912.', argumentos: { id: 912 } },
  },
];

// ─── De argumentos a la petición HTTP ─────────────────────────────────────

/** Una petición ya armada: la ruta (bajo `/api/mcp/v1`) y sus parámetros de consulta. */
export type PeticionHttp = { ruta: string; consulta: Record<string, string | undefined> };

/**
 * Convierte los argumentos validados de una herramienta en la petición HTTP.
 *
 * Los que aparecen como `{nombre}` en la ruta van en la ruta; los demás, en la
 * consulta. Un booleano falso no viaja (`soloVencidas: false` es no filtrar) y
 * los números van como texto, igual que cuando esto estaba escrito a mano en
 * cada herramienta.
 */
export function peticionHttp(h: Herramienta, args: Record<string, unknown>): PeticionHttp {
  const enRuta = new Set<string>();
  const ruta = h.http.ruta.replace(/\{(\w+)\}/g, (_, nombre: string) => {
    enRuta.add(nombre);
    return encodeURIComponent(String(args[nombre]));
  });

  const consulta: Record<string, string | undefined> = {};
  for (const nombre of Object.keys(h.inputSchema.shape)) {
    if (enRuta.has(nombre)) continue;
    const v = args[nombre];
    if (v === undefined || v === null) continue;
    consulta[nombre] = typeof v === 'boolean' ? (v ? 'true' : undefined) : String(v);
  }
  return { ruta, consulta };
}

// ─── Lo que la documentación lee del esquema ──────────────────────────────

export type TipoDeParametro = 'texto' | 'fecha' | 'entero' | 'número' | 'sí/no';

export type ParametroDocumentado = {
  nombre: string;
  tipo: TipoDeParametro;
  obligatorio: boolean;
  /** Los límites del esquema dichos en palabras: «de 1 a 500», «mayor que 0». */
  restriccion?: string;
  descripcion: string;
};

/** Un valor de 2^53 o similar es el `.safe()` de zod, no un límite que le importe a nadie. */
const esLimiteSeguro = (n: number) => Math.abs(n) >= Number.MAX_SAFE_INTEGER;

type ZodInterno = {
  _def: { typeName?: string; innerType?: ZodInterno; checks?: { kind: string; value?: number; inclusive?: boolean }[]; description?: string };
  description?: string;
  isOptional(): boolean;
};

function restriccionNumerica(checks: NonNullable<ZodInterno['_def']['checks']>): string | undefined {
  let min: { v: number; incl: boolean } | undefined;
  let max: number | undefined;
  for (const c of checks) {
    if (c.value === undefined || esLimiteSeguro(c.value)) continue;
    if (c.kind === 'min') min = { v: c.value, incl: c.inclusive !== false };
    if (c.kind === 'max') max = c.value;
  }
  if (min && !min.incl && min.v === 0 && max === undefined) return 'mayor que 0';
  if (min && max !== undefined) return `de ${min.v} a ${max}`;
  if (min) return min.incl ? `mínimo ${min.v}` : `mayor que ${min.v}`;
  if (max !== undefined) return `máximo ${max}`;
  return undefined;
}

/**
 * Lee un esquema zod (v3) y devuelve sus parámetros para la documentación.
 *
 * Nombre, tipo, si es obligatorio y límites salen de zod; el texto, del
 * `.describe()` de cada campo. Si alguien añade un campo al esquema, aparece en
 * la tabla solo; si lo quita, desaparece. No hay una segunda lista que
 * mantener.
 *
 * Un campo de texto cuya descripción menciona `YYYY-MM-DD` se muestra como
 * `fecha`: el esquema lo acepta como texto (la ruta valida el formato), pero
 * para quien lee la tabla es una fecha.
 */
export function parametrosDe(schema: z.ZodObject<z.ZodRawShape>): ParametroDocumentado[] {
  return Object.entries(schema.shape).map(([nombre, campo]) => {
    const externo = campo as unknown as ZodInterno;
    const interno = externo._def.typeName === 'ZodOptional' ? externo._def.innerType! : externo;
    const descripcion = externo.description ?? interno.description ?? '';
    const tipoZod = interno._def.typeName;

    let tipo: TipoDeParametro;
    let restriccion: string | undefined;
    if (tipoZod === 'ZodBoolean') {
      tipo = 'sí/no';
    } else if (tipoZod === 'ZodNumber') {
      const checks = interno._def.checks ?? [];
      tipo = checks.some((c) => c.kind === 'int') ? 'entero' : 'número';
      restriccion = restriccionNumerica(checks);
    } else if (tipoZod === 'ZodString') {
      tipo = /YYYY-MM-DD/.test(descripcion) ? 'fecha' : 'texto';
    } else {
      throw new Error(`Tipo de parámetro sin documentar: ${nombre} (${tipoZod ?? 'desconocido'}). Añádelo en parametrosDe().`);
    }

    return { nombre, tipo, obligatorio: !externo.isOptional(), ...(restriccion ? { restriccion } : {}), descripcion };
  });
}

/** Lo que dice un parámetro, con sus límites: «Filas a devolver; por defecto 200 (de 1 a 500).» */
export function notaDeParametro(p: ParametroDocumentado): string {
  const lim = p.restriccion ? ` (${p.restriccion})` : '';
  return `${p.descripcion.replace(/\.$/, '')}${lim}.`;
}

/** Lo mismo con «Opcional»/«Obligatorio» delante, para donde no hay columna aparte (`/agentes`). */
export function detalleDeParametro(p: ParametroDocumentado): string {
  return `${p.obligatorio ? 'Obligatorio' : 'Opcional'}. ${notaDeParametro(p)}`;
}

/** Las herramientas de un módulo, en el orden del registro. */
export function herramientasDeModulo(modulo: string): Herramienta[] {
  return HERRAMIENTAS_MCP.filter((h) => h.modulo === modulo);
}

export function nombreDeNivel(nivel: NivelDeHerramienta): string {
  switch (nivel) {
    case 'lectura': return 'Solo lectura';
    case 'escritura': return 'Escritura';
    case 'aprobacion': return 'Pide aprobación';
  }
}
