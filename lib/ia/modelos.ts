/**
 * Qué modelo de IA usa cada parte de Zero, y entre cuáles se puede escoger.
 *
 * Tres partes de Zero llaman a un modelo: el asistente del chat, el que redacta
 * plantillas de WhatsApp y el que lee las fotos de facturas de proveedor. Cada
 * una tenía su modelo fijo en código (o en una variable de entorno), y cambiarlo
 * pedía un despliegue. Ahora el administrador de la plataforma lo escoge en
 * /admin/ia y se guarda en `plataforma_ajustes`.
 *
 * Todo va por Vercel AI Gateway, que habla con Google y con Anthropic con el
 * mismo id (`proveedor/modelo`): cambiar de Gemini a Claude es cambiar ese id,
 * sin otra librería. OJO: el plan gratuito del gateway NO da acceso a los
 * modelos de Anthropic (devuelven 403) hasta que la cuenta tenga créditos
 * pagados; mientras tanto el respaldo contesta y /admin/ia lo avisa con
 * «Probar».
 *
 * Este archivo no importa nada del servidor: lo usan la página de /admin y
 * las pruebas.
 */

export type ProveedorIa = 'Anthropic' | 'Google';

export interface ModeloIa {
  /** Id del AI Gateway: `anthropic/claude-sonnet-5.5`. */
  id: string;
  nombre: string;
  proveedor: ProveedorIa;
  nota: string;
  /** US$ por millón de tokens, según el catálogo del gateway. */
  entradaUsd: number;
  salidaUsd: number;
}

export const MODELOS_IA: readonly ModeloIa[] = [
  { id: 'anthropic/claude-sonnet-5.5', nombre: 'Claude Sonnet 5.5', proveedor: 'Anthropic', nota: 'El mejor equilibrio entre calidad y costo', entradaUsd: 2, salidaUsd: 10 },
  { id: 'anthropic/claude-haiku-5.5', nombre: 'Claude Haiku 5.5', proveedor: 'Anthropic', nota: 'Rápido y barato', entradaUsd: 0.1, salidaUsd: 0.5 },
  { id: 'anthropic/claude-opus-5.5', nombre: 'Claude Opus 5.5', proveedor: 'Anthropic', nota: 'El más capaz y el más caro', entradaUsd: 4, salidaUsd: 20 },
  { id: 'google/gemini-2.5-flash', nombre: 'Gemini 2.5 Flash', proveedor: 'Google', nota: 'Rápido; el que se usaba hasta ahora', entradaUsd: 0.3, salidaUsd: 2.5 },
  { id: 'google/gemini-2.5-flash-lite', nombre: 'Gemini 2.5 Flash-Lite', proveedor: 'Google', nota: 'El más barato', entradaUsd: 0.1, salidaUsd: 0.4 },
  { id: 'google/gemini-3-flash', nombre: 'Gemini 3 Flash', proveedor: 'Google', nota: 'Más nuevo; razona antes de contestar', entradaUsd: 0.5, salidaUsd: 3 },
];

export type UsoIa = 'asistente' | 'plantillas' | 'captura';

export interface UsoIaInfo {
  uso: UsoIa;
  nombre: string;
  descripcion: string;
  /** Lo que se usa mientras nadie haya escogido otra cosa. */
  principal: string;
  respaldo: string;
}

/**
 * Los valores de fábrica son los que cada parte tenía en código, y la variable
 * de entorno de antes los sigue pisando: al desplegar esto nada cambia hasta
 * que alguien escoja otro modelo en /admin/ia.
 */
export function usosIa(env: Record<string, string | undefined> = {}): UsoIaInfo[] {
  return [
    {
      uso: 'asistente',
      nombre: 'Asistente del chat',
      descripcion: 'Contesta preguntas del dueño o administrador sobre su empresa (ventas, cobros, dónde está cada cosa).',
      principal: env.ASISTENTE_IA_MODELO || 'google/gemini-2.5-flash',
      respaldo: env.ASISTENTE_IA_MODELO_RESPALDO || 'google/gemini-2.5-flash-lite',
    },
    {
      uso: 'plantillas',
      nombre: 'Plantillas de WhatsApp',
      descripcion: 'Redacta y revisa las plantillas de aviso a los padres en /admin/whatsapp.',
      principal: env.PLANTILLAS_IA_MODELO || 'google/gemini-2.5-flash',
      respaldo: env.PLANTILLAS_IA_MODELO_RESPALDO || 'google/gemini-2.5-flash-lite',
    },
    {
      uso: 'captura',
      nombre: 'Fotos de facturas de proveedor',
      descripcion: 'Lee la foto o el PDF de una compra y llena el registro.',
      principal: env.CAPTURA_IA_MODELO || 'google/gemini-2.5-flash-lite',
      respaldo: env.CAPTURA_IA_MODELO_RESPALDO || 'google/gemini-2.5-flash',
    },
  ];
}

export const USOS_IA: readonly UsoIa[] = ['asistente', 'plantillas', 'captura'];

export interface ModelosDeUso { principal: string; respaldo: string }

/** Lo que se guarda en `plataforma_ajustes` con la clave `ia.modelos`. */
export type AjusteModelos = Partial<Record<UsoIa, Partial<ModelosDeUso>>>;

export const CLAVE_AJUSTE_MODELOS = 'ia.modelos';

export const esModeloConocido = (id: unknown): id is string =>
  typeof id === 'string' && MODELOS_IA.some((m) => m.id === id);

export const modeloPorId = (id: string): ModeloIa | undefined => MODELOS_IA.find((m) => m.id === id);

/**
 * Los modelos de un uso: lo guardado si es un modelo del catálogo, y si no, el
 * de fábrica. Un id que se dejó de ofrecer (o un JSON mal escrito a mano) no
 * puede dejar a Zero sin IA.
 */
export function elegirModelos(guardado: AjusteModelos | null | undefined, uso: UsoIa, env: Record<string, string | undefined> = {}): ModelosDeUso {
  const fabrica = usosIa(env).find((u) => u.uso === uso)!;
  const g = guardado?.[uso];
  return {
    principal: esModeloConocido(g?.principal) ? g.principal : fabrica.principal,
    respaldo: esModeloConocido(g?.respaldo) ? g.respaldo : fabrica.respaldo,
  };
}

/**
 * Valida lo que manda la página de /admin antes de guardarlo. Devuelve el
 * ajuste limpio o el error que se le enseña al administrador.
 */
export function validarAjusteModelos(entrada: unknown): { ok: true; valor: AjusteModelos } | { ok: false; error: string } {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { ok: false, error: 'Faltan los modelos.' };
  }
  const valor: AjusteModelos = {};
  for (const [uso, v] of Object.entries(entrada as Record<string, unknown>)) {
    if (!(USOS_IA as readonly string[]).includes(uso)) return { ok: false, error: `No hay ninguna parte de Zero llamada «${uso}».` };
    const x = (v ?? {}) as Record<string, unknown>;
    if (!esModeloConocido(x.principal) || !esModeloConocido(x.respaldo)) {
      return { ok: false, error: 'Escoge un modelo de la lista para el principal y para el respaldo.' };
    }
    valor[uso as UsoIa] = { principal: x.principal, respaldo: x.respaldo };
  }
  return { ok: true, valor };
}

/**
 * El id que espera cada proveedor cuando se le habla directo, sin el gateway.
 * Anthropic escribe la versión con guiones (`claude-sonnet-5-5`) donde el
 * gateway usa punto (`claude-sonnet-5.5`); Google usa el mismo nombre.
 */
export function idDirecto(id: string): { proveedor: 'google' | 'anthropic'; modelo: string } | null {
  const [proveedor, ...resto] = id.split('/');
  const modelo = resto.join('/');
  if (!modelo) return null;
  if (proveedor === 'google') return { proveedor, modelo };
  if (proveedor === 'anthropic') return { proveedor, modelo: modelo.replace(/\./g, '-') };
  return null;
}

/**
 * El error que devolvió el gateway, contado para el administrador. El 403 de
 * Anthropic en plan gratuito es el caso que más va a salir.
 */
export function explicarErrorIa(e: unknown): string {
  const x = (e ?? {}) as { statusCode?: number; message?: string; responseBody?: string };
  const texto = `${x.message ?? ''} ${x.responseBody ?? ''}`;
  if (x.statusCode === 403 && /free tier|paid credits/i.test(texto)) {
    return 'El AI Gateway está en plan gratuito: este modelo pide créditos pagados en Vercel (AI → Top up).';
  }
  if (x.statusCode === 429 || /RESOURCE_EXHAUSTED|rate limit/i.test(texto)) return 'Se acabó la cuota del proveedor por ahora.';
  if (x.statusCode === 401) return 'La llave del AI Gateway no es válida.';
  return (x.message || 'No respondió.').slice(0, 200);
}
